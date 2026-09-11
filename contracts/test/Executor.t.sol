// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AllowanceExecutor} from "../src/AllowanceExecutor.sol";
import {Call} from "../src/Types.sol";
import {MockToken} from "./mocks/MockToken.sol";
import {MockSwapRouter, ExactInputSingleParams} from "./mocks/MockSwapRouter.sol";
import {MockAavePool} from "./mocks/MockAavePool.sol";

/// The executor performs what the registry has already permitted. These tests
/// are about the one thing it can get wrong on its own: an allowance is a
/// clumsy instrument, and using it means briefly holding money and briefly
/// handing out an approval. Both have to be gone by the end of the
/// transaction, whatever the call in the middle turned out to be.
contract ExecutorTest is Test {
    AllowanceExecutor executor;
    MockToken usdc;
    MockToken weth;
    MockToken aUsdc;
    MockSwapRouter router;
    MockAavePool pool;

    address constant REGISTRY = address(0x4E6157);
    address constant TENANT = address(0x7E4A47);
    address constant AGENT = address(0xA6E47);
    address constant SUPPLIER = address(0x5000);

    uint256 constant FUNDED = 1_000e6;

    function setUp() public {
        executor = new AllowanceExecutor(REGISTRY);
        usdc = new MockToken();
        weth = new MockToken();
        aUsdc = new MockToken();
        router = new MockSwapRouter();
        pool = new MockAavePool(aUsdc);

        usdc.mint(TENANT, FUNDED);
        // The one approval the Tenant grants at onboarding. Everything the
        // executor can ever do is bounded by it.
        vm.prank(TENANT);
        usdc.approve(address(executor), type(uint256).max);
    }

    // --- who may direct it --------------------------------------------------

    function test_onlyRegistryMayExecute() public {
        vm.expectRevert(AllowanceExecutor.NotRegistry.selector);
        vm.prank(AGENT);
        executor.execute(TENANT, _one(address(usdc), _transfer(SUPPLIER, 1e6)));
    }

    // --- transfers ----------------------------------------------------------

    function test_transferMovesFromTenantAndHoldsNothing() public {
        _run(_one(address(usdc), _transfer(SUPPLIER, 10e6)));

        assertEq(usdc.balanceOf(TENANT), FUNDED - 10e6);
        assertEq(usdc.balanceOf(SUPPLIER), 10e6);
        assertEq(usdc.balanceOf(address(executor)), 0, "custody between calls");
        // Rewritten as transferFrom, so nothing was ever approved or pulled.
        assertEq(usdc.allowance(address(executor), SUPPLIER), 0);
    }

    // --- protocols the executor knows nothing about -------------------------

    /// A swap is the two calls anyone would write. Nothing here decodes
    /// `exactInputSingle`, and nothing has to.
    function test_swapsWithoutKnowingWhatASwapIs() public {
        _run(_approveThen(address(router), _swap(TENANT, 100e6)));

        assertEq(usdc.balanceOf(TENANT), FUNDED - 100e6);
        assertEq(weth.balanceOf(TENANT), 100e6, "output reached the owner");
        assertEq(usdc.balanceOf(address(executor)), 0, "custody after the batch");
        assertEq(usdc.allowance(address(executor), address(router)), 0, "approval outlived it");
    }

    /// The same two calls at a different contract, with a different function,
    /// and the executor is unchanged. This is the whole point of the design.
    function test_depositsWithoutKnowingWhatADepositIs() public {
        _run(_approveThen(address(pool), _supply(TENANT, 100e6)));

        assertEq(usdc.balanceOf(TENANT), FUNDED - 100e6);
        assertEq(aUsdc.balanceOf(TENANT), 100e6, "the claim reached the owner");
        assertEq(usdc.balanceOf(address(executor)), 0);
        assertEq(usdc.allowance(address(executor), address(pool)), 0);
    }

    /// An Agent may name itself as the recipient, and this contract cannot
    /// tell that from a legitimate trade — it does not read the arguments.
    /// What it must not do is make the Tenant pay twice: the input is spent
    /// once, which is the number the registry charges against the ceiling, and
    /// is the same exposure as the Agent simply sending itself the money.
    function test_anAgentTakingTheOutputStillOnlySpendsTheInput() public {
        _run(_approveThen(address(router), _swap(AGENT, 100e6)));

        assertEq(FUNDED - usdc.balanceOf(TENANT), 100e6, "spend is the input, once");
        assertEq(weth.balanceOf(AGENT), 100e6);
        assertEq(usdc.balanceOf(address(executor)), 0);
    }

    // --- what must never be left behind -------------------------------------

    /// A router that spends less than it was given leaves the remainder here.
    /// It is the Tenant's, and they must not have to ask for it.
    function test_unspentInputGoesBackToTheTenant() public {
        router.setLeaveUnspent(30e6);
        _run(_approveThen(address(router), _swap(TENANT, 100e6)));

        assertEq(usdc.balanceOf(address(executor)), 0, "dust stranded");
        assertEq(usdc.balanceOf(TENANT), FUNDED - 70e6, "charged for what traded");
    }

    /// The ordinary way to write an approval, and the one that would strand
    /// the whole balance if the pull were taken literally.
    function test_anInfiniteApprovalPullsOnlyWhatIsThere() public {
        _run(_approveThen(address(router), _swap(TENANT, 100e6), type(uint256).max));

        assertEq(usdc.balanceOf(address(executor)), 0);
        assertEq(usdc.balanceOf(TENANT), FUNDED - 100e6);
        assertEq(usdc.allowance(address(executor), address(router)), 0);
    }

    /// Value sent along for a call that did not want it. It is the Tenant's
    /// and goes home rather than accumulating here across batches.
    function test_nativeChangeGoesBackToTheTenant() public {
        vm.deal(REGISTRY, 1 ether);
        uint256 before = TENANT.balance;

        vm.prank(REGISTRY);
        executor.execute{value: 0.4 ether}(TENANT, _one(address(usdc), _transfer(SUPPLIER, 1e6)));

        assertEq(address(executor).balance, 0, "change kept");
        assertEq(TENANT.balance - before, 0.4 ether);
    }

    // --- failure ------------------------------------------------------------

    function test_aFailingCallRevertsWithItsOwnReason() public {
        // Nothing approved, so the router's pull fails inside the token.
        Call[] memory calls = new Call[](1);
        calls[0] = Call({to: address(router), value: 0, data: _swap(TENANT, 100e6)});

        vm.expectRevert();
        _run(calls);

        assertEq(usdc.balanceOf(TENANT), FUNDED);
    }

    /// A batch is all or nothing, so an Agent cannot pair something
    /// legitimate with something that fails and keep the half that worked.
    function test_aFailedCallUndoesTheWholeBatch() public {
        Call[] memory calls = new Call[](2);
        calls[0] = Call({to: address(usdc), value: 0, data: _transfer(SUPPLIER, 10e6)});
        calls[1] = Call({to: address(router), value: 0, data: _swap(TENANT, 100e6)});

        vm.expectRevert();
        _run(calls);

        assertEq(usdc.balanceOf(SUPPLIER), 0, "first call survived a failed batch");
        assertEq(usdc.balanceOf(TENANT), FUNDED);
    }

    function test_balanceOfReportsTheTenantsOwnBalance() public view {
        assertEq(executor.balanceOf(TENANT, address(usdc)), FUNDED);
    }

    // --- helpers ------------------------------------------------------------

    function _run(Call[] memory calls) internal {
        vm.prank(REGISTRY);
        executor.execute(TENANT, calls);
    }

    function _one(address to, bytes memory data) internal pure returns (Call[] memory calls) {
        calls = new Call[](1);
        calls[0] = Call({to: to, value: 0, data: data});
    }

    /// The shape every protocol interaction takes: approve, then call.
    function _approveThen(address spender, bytes memory data)
        internal
        view
        returns (Call[] memory)
    {
        return _approveThen(spender, data, 100e6);
    }

    function _approveThen(address spender, bytes memory data, uint256 allowance)
        internal
        view
        returns (Call[] memory calls)
    {
        calls = new Call[](2);
        calls[0] = Call({
            to: address(usdc),
            value: 0,
            data: abi.encodeWithSelector(bytes4(0x095ea7b3), spender, allowance)
        });
        calls[1] = Call({to: spender, value: 0, data: data});
    }

    function _transfer(address to, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(0xa9059cbb), to, amount);
    }

    function _swap(address recipient, uint256 amountIn) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            MockSwapRouter.exactInputSingle.selector,
            ExactInputSingleParams({
                tokenIn: address(usdc),
                tokenOut: address(weth),
                fee: 3000,
                recipient: recipient,
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _supply(address onBehalfOf, uint256 amount) internal view returns (bytes memory) {
        return abi.encodeWithSelector(
            MockAavePool.supply.selector, address(usdc), amount, onBehalfOf, uint16(0)
        );
    }
}
