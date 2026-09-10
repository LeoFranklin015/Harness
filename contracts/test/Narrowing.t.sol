// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Call, CallRule, Constants, Grant, Period, Reason, SpendLimit} from "../src/Types.sol";
import {MockExecutor} from "./mocks/MockExecutor.sol";

/// Tests written to break the design, not to confirm it. Each targets a
/// specific way authority could widen, or survive when it should not.
contract NarrowingTest is Test {
    AgentRegistry registry;
    MockExecutor executor;

    uint256 constant DEVICE_PK = 0xA11CE;
    uint256 constant ROOT_KEY_PK = 0x1001;
    uint256 constant CHILD_KEY_PK = 0x1002;

    address device;
    address rootKey;
    address childKey;
    address tenant = address(0x7E4A47);

    address constant TOOL = address(0xC0FFEE);
    address constant OTHER_TOOL = address(0xBEEF);
    address constant USDC = address(0x05DC);

    function setUp() public {
        device = vm.addr(DEVICE_PK);
        rootKey = vm.addr(ROOT_KEY_PK);
        childKey = vm.addr(CHILD_KEY_PK);

        executor = new MockExecutor();
        registry = new AgentRegistry(bytes32(0), tenant, device, executor, AgentRegistry(address(0)));
        executor.fund(tenant, USDC, 1_000e6);
        vm.warp(1_000_000);
    }

    // --- helpers ------------------------------------------------------------

    function _rules(address target) internal pure returns (CallRule[] memory r) {
        r = new CallRule[](1);
        r[0] = CallRule({
            target: target,
            selector: Constants.ANY_SELECTOR,
            maxValue: 0,
            checker: address(0),
            checkerCodeHash: bytes32(0)
        });
    }

    function _grant(bytes32 parent, string memory label, address key, address tool, uint160 cap)
        internal
        view
        returns (Grant memory)
    {
        SpendLimit[] memory l = new SpendLimit[](1);
        l[0] = SpendLimit({token: USDC, allowance: cap, unit: Period.Day, multiplier: 1});
        return Grant({
            parent: parent,
            label: label,
            agentKey: key,
            start: uint48(block.timestamp),
            end: uint48(block.timestamp + 30 days),
            salt: 0,
            calls: _rules(tool),
            spends: l
        });
    }

    function _root() internal returns (Grant memory g, bytes32 id) {
        g = _grant(bytes32(0), "acme", rootKey, TOOL, 100e6);
        Grant memory none;
        vm.prank(device);
        id = registry.grant(g, none);
    }

    /// A child is issued by the registry of the Agent it descends from, so the
    /// parent needs one of its own first.
    function _sub(bytes32 rootId) internal returns (AgentRegistry) {
        vm.prank(device);
        return registry.attachChildRegistry(rootId, "acme");
    }

    function _oneCall(address to) internal pure returns (Call[] memory calls) {
        calls = new Call[](1);
        calls[0] = Call({to: to, value: 0, data: hex"12345678"});
    }

    function _batchSig(bytes32 agentId, Call[] memory calls, uint256 nonce, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32[] memory callHashes = new bytes32[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            callHashes[i] = keccak256(abi.encode(calls[i].to, calls[i].value, keccak256(calls[i].data)));
        }
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Batch(bytes32 agentId,uint256 nonce,bytes32 calls)"),
                agentId,
                nonce,
                keccak256(abi.encodePacked(callHashes))
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", registry.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// Prepares a relayable batch. Kept separate from submission so a test can
    /// arm `vm.expectRevert` immediately before `execute` — every view call in
    /// here would otherwise absorb the expectation.
    function _prep(Grant memory g, uint256 agentPk, Call[] memory calls)
        internal
        view
        returns (uint256 nonce, bytes memory sig)
    {
        bytes32 agentId = registry.hashGrant(g);
        nonce = registry.nonces(agentId);
        sig = _batchSig(agentId, calls, nonce, agentPk);
    }

    /// The Agent signs; an address that is nobody in particular relays.
    function _relay(Grant memory g, uint256 agentPk, Call[] memory calls) internal {
        (uint256 nonce, bytes memory sig) = _prep(g, agentPk, calls);
        vm.prank(address(0xDEADBEEF));
        registry.execute(g, calls, nonce, sig);
    }

    // --- the tests ----------------------------------------------------------

    function test_child_may_be_narrower() public {
        (Grant memory root, bytes32 rootId) = _root();
        AgentRegistry sub = _sub(rootId);
        Grant memory child = _grant(rootId, "research", childKey, TOOL, 10e6);

        vm.prank(device);
        bytes32 id = sub.grant(child, root);

        (bool ok,) = sub.check(id);
        assertTrue(ok, "a narrower child should be permitted");
    }

    function test_child_cannot_raise_the_cap() public {
        (Grant memory root, bytes32 rootId) = _root();
        AgentRegistry sub = _sub(rootId);
        Grant memory child = _grant(rootId, "greedy", childKey, TOOL, 500e6);

        vm.prank(device);
        vm.expectRevert(AgentRegistry.NotNarrower.selector);
        sub.grant(child, root);
    }

    function test_child_cannot_add_a_tool_the_parent_lacks() public {
        (Grant memory root, bytes32 rootId) = _root();
        AgentRegistry sub = _sub(rootId);
        Grant memory child = _grant(rootId, "sneaky", childKey, OTHER_TOOL, 10e6);

        vm.prank(device);
        vm.expectRevert(AgentRegistry.NotNarrower.selector);
        sub.grant(child, root);
    }

    function test_child_cannot_outlive_its_parent() public {
        (Grant memory root, bytes32 rootId) = _root();
        AgentRegistry sub = _sub(rootId);
        Grant memory child = _grant(rootId, "outlives", childKey, TOOL, 10e6);
        child.end = root.end + 1 days;

        vm.prank(device);
        vm.expectRevert(AgentRegistry.NotNarrower.selector);
        sub.grant(child, root);
    }

    function test_only_the_device_may_grant() public {
        (Grant memory root, bytes32 rootId) = _root();
        AgentRegistry sub = _sub(rootId);
        Grant memory child = _grant(rootId, "forged", childKey, TOOL, 10e6);

        vm.prank(address(0xBAD));
        vm.expectRevert(AgentRegistry.NotRootDevice.selector);
        sub.grant(child, root);
    }

    function test_revoking_a_parent_kills_the_child() public {
        (Grant memory root, bytes32 rootId) = _root();
        AgentRegistry sub = _sub(rootId);
        Grant memory child = _grant(rootId, "doomed", childKey, TOOL, 10e6);

        vm.prank(device);
        bytes32 childId = sub.grant(child, root);

        (bool alive,) = sub.check(childId);
        assertTrue(alive, "child should start alive");

        vm.prank(device);
        registry.revoke(rootId);

        (bool ok, Reason reason) = sub.check(childId);
        assertFalse(ok, "child must die with its parent");
        assertEq(uint8(reason), uint8(Reason.AncestorGone));
    }

    function test_spend_is_counted_and_bounded() public {
        (Grant memory root, bytes32 rootId) = _root();

        executor.setWillMove(USDC, 30e6);
        _relay(root, ROOT_KEY_PK, _oneCall(TOOL));
        assertEq(registry.spentOf(rootId, root.spends[0]).spend, 30e6, "spend should be recorded");

        // 80 more would exceed the 100/day limit.
        executor.setWillMove(USDC, 80e6);
        Call[] memory again = _oneCall(TOOL);
        (uint256 n, bytes memory sig) = _prep(root, ROOT_KEY_PK, again);
        vm.prank(address(0xDEADBEEF));
        vm.expectRevert();
        registry.execute(root, again, n, sig);
    }

    function test_a_call_outside_the_allowlist_is_refused() public {
        (Grant memory root,) = _root();
        Call[] memory calls = _oneCall(OTHER_TOOL);
        (uint256 n, bytes memory sig) = _prep(root, ROOT_KEY_PK, calls);
        vm.prank(address(0xDEADBEEF));
        vm.expectRevert();
        registry.execute(root, calls, n, sig);
    }

    function test_a_batch_signed_by_the_wrong_key_is_refused() public {
        (Grant memory root,) = _root();
        Call[] memory calls = _oneCall(TOOL);
        (uint256 n, bytes memory sig) = _prep(root, CHILD_KEY_PK, calls);
        vm.prank(address(0xDEADBEEF));
        vm.expectRevert(AgentRegistry.BadSignature.selector);
        registry.execute(root, calls, n, sig);
    }

    function test_a_relayed_batch_cannot_be_replayed() public {
        (Grant memory root, bytes32 rootId) = _root();
        Call[] memory calls = _oneCall(TOOL);

        uint256 nonce = registry.nonces(rootId);
        bytes memory sig = _batchSig(rootId, calls, nonce, ROOT_KEY_PK);

        executor.setWillMove(USDC, 5e6);
        vm.prank(address(0xDEADBEEF));
        registry.execute(root, calls, nonce, sig);

        // A relayer that kept the signature cannot spend it twice.
        executor.setWillMove(USDC, 5e6);
        vm.prank(address(0xDEADBEEF));
        vm.expectRevert(AgentRegistry.BadNonce.selector);
        registry.execute(root, calls, nonce, sig);
    }
}
