// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AllowanceExecutor, ExactInputSingleParams} from "../src/AllowanceExecutor.sol";
import {Call} from "../src/Types.sol";
import {MockToken} from "./mocks/MockToken.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";

/// The executor carries out calls the registry has already permitted, so these
/// tests do not ask whether a call was allowed. They ask what happens when a
/// permitted call is shaped to take more than it was meant to: the registry
/// approves a *target and a selector*, never the arguments, and everything
/// dangerous about a swap lives in the arguments.
contract ExecutorTest is Test {
    AllowanceExecutor executor;
    MockToken usdc;
    MockToken weth;
    MockSwapRouter router;

    address constant REGISTRY = address(0x4E6157);
    address constant TENANT = address(0x7E4A47);
    address constant AGENT = address(0xA6E47);
    address constant SUPPLIER = address(0x5000);

    uint256 constant FUNDED = 1_000e6;

    function setUp() public {
        executor = new AllowanceExecutor(REGISTRY);
        usdc = new MockToken();
        weth = new MockToken();
        router = new MockSwapRouter();

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
    }

    function test_rejectsUnknownSelector() public {
        vm.expectRevert(AllowanceExecutor.UnsupportedCall.selector);
        _run(_one(address(usdc), abi.encodeWithSignature("burn(uint256)", 1e6)));
    }

    /// `transferFrom(address,address,uint256)` shares no selector with
    /// `transfer`, but a padded or truncated payload could still decode. The
    /// length check is what stops the executor acting on a shape it did not
    /// verify.
    function test_rejectsMisshapenTransfer() public {
        vm.expectRevert(AllowanceExecutor.UnsupportedCall.selector);
        _run(_one(address(usdc), abi.encodePacked(_transfer(SUPPLIER, 1e6), uint256(7))));
    }

    // --- swaps: the drain ---------------------------------------------------

    /// The attack the `recipient` check exists for.
    ///
    /// The registry permitted "this agent may call `exactInputSingle` on this
    /// router". It said nothing about where the proceeds land. Left unchecked,
    /// an agent swaps the Tenant's USDC and has the router pay the WETH to
    /// itself: a drain wearing a trade's calldata, and one that costs the
    /// ceiling only what the *input* was worth.
    function test_swapToAnyoneButTheTenantIsRefused() public {
        vm.expectRevert(AllowanceExecutor.RecipientNotTenant.selector);
        _run(_one(address(router), _swap(AGENT, 100e6, 0)));

        assertEq(usdc.balanceOf(TENANT), FUNDED, "refused before any pull");
    }

    function test_swapSendsOutputToTheTenant() public {
        _run(_one(address(router), _swap(TENANT, 100e6, 0)));

        assertEq(usdc.balanceOf(TENANT), FUNDED - 100e6);
        assertEq(weth.balanceOf(TENANT), 100e6, "output reached the owner");
        assertEq(weth.balanceOf(AGENT), 0);
    }

    // --- swaps: what the executor is left holding ---------------------------

    function test_holdsNothingAfterASwap() public {
        _run(_one(address(router), _swap(TENANT, 100e6, 0)));

        assertEq(usdc.balanceOf(address(executor)), 0);
        assertEq(weth.balanceOf(address(executor)), 0);
    }

    /// A router that spends less than it was given leaves the remainder here.
    /// It is the Tenant's, and the ceiling was already charged for it.
    function test_unspentInputGoesBackToTheTenant() public {
        router.setLeaveUnspent(30e6);
        _run(_one(address(router), _swap(TENANT, 100e6, 0)));

        assertEq(usdc.balanceOf(address(executor)), 0, "dust stranded");
        assertEq(usdc.balanceOf(TENANT), FUNDED - 70e6, "only what was traded");
    }

    /// The approval exists for the length of one call. A router that tries to
    /// pull again later finds nothing left to pull.
    function test_routerApprovalIsResetAfterwards() public {
        router.setLeaveUnspent(30e6);
        _run(_one(address(router), _swap(TENANT, 100e6, 0)));

        assertEq(usdc.allowance(address(executor), address(router)), 0);
    }

    function test_swapThatReturnsNothingReverts() public {
        router.setRate(0);
        vm.expectRevert(AllowanceExecutor.NothingSwapped.selector);
        _run(_one(address(router), _swap(TENANT, 100e6, 0)));
    }

    // --- batches ------------------------------------------------------------

    /// A batch is all or nothing: the second call failing must undo the first,
    /// or an agent could pair a legitimate transfer with a drain and keep half.
    function test_aFailedCallUndoesTheWholeBatch() public {
        Call[] memory calls = new Call[](2);
        calls[0] = Call({to: address(usdc), value: 0, data: _transfer(SUPPLIER, 10e6)});
        calls[1] = Call({to: address(router), value: 0, data: _swap(AGENT, 100e6, 0)});

        vm.expectRevert(AllowanceExecutor.RecipientNotTenant.selector);
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

    function _transfer(address to, uint256 amount) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(bytes4(0xa9059cbb), to, amount);
    }

    function _swap(address recipient, uint256 amountIn, uint256 minOut)
        internal
        view
        returns (bytes memory)
    {
        return abi.encodeWithSelector(
            bytes4(0x414bf389),
            ExactInputSingleParams({
                tokenIn: address(usdc),
                tokenOut: address(weth),
                fee: 3000,
                recipient: recipient,
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
