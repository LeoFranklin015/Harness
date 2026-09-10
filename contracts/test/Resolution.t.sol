// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CallRule, Constants, Grant, Period, SpendLimit} from "../src/Types.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {MockLabelStore} from "./mocks/MockLabelStore.sol";
import {MockExecutor} from "./mocks/MockExecutor.sol";

/// Resolution answers to the same state as authority. These check that a name
/// stops resolving because the Agent is gone — through the plain ENSv2
/// traversal any client uses, not through anything of ours.
contract ResolutionTest is Test {
    AgentRegistry registry;
    MockExecutor executor;

    uint256 constant DEVICE_PK = 0xA11CE;
    address device;
    address tenant = address(0x7E4A47);
    address agentKey = address(0x1001);
    address childKey = address(0x1002);
    address resolverAddr = address(0xBEEF01);

    address constant TOOL = address(0xC0FFEE);
    address constant USDC = address(0x05DC);

    function setUp() public {
        device = vm.addr(DEVICE_PK);
        executor = new MockExecutor();
        registry = new AgentRegistry(
            new MockLabelStore(),
            bytes32(0),
            tenant,
            device,
            executor,
            AgentRegistry(address(0))
        );
        vm.warp(1_000_000);
    }

    function _grant(bytes32 parent, string memory label, address key, uint160 cap)
        internal
        view
        returns (Grant memory)
    {
        CallRule[] memory r = new CallRule[](1);
        r[0] = CallRule({
            target: TOOL,
            selector: Constants.ANY_SELECTOR,
            maxValue: 0,
            checker: address(0),
            checkerCodeHash: bytes32(0)
        });
        SpendLimit[] memory l = new SpendLimit[](1);
        l[0] = SpendLimit({token: USDC, allowance: cap, unit: Period.Day, multiplier: 1});
        return Grant({
            parent: parent,
            label: label,
            agentKey: key,
            start: uint48(block.timestamp),
            end: uint48(block.timestamp + 30 days),
            salt: 0,
            calls: r,
            spends: l
        });
    }

    function test_a_live_agent_resolves() public {
        Grant memory g = _grant(bytes32(0), "acme", agentKey, 100e6);
        Grant memory none;
        vm.prank(device);
        registry.grant(g, none);

        assertEq(registry.getResolver("acme"), address(0), "no resolver configured yet");
        assertTrue(registry.current(keccak256("acme")) != bytes32(0), "agent should be recorded");
    }

    function test_revoking_stops_the_name_resolving() public {
        Grant memory g = _grant(bytes32(0), "acme", agentKey, 100e6);
        Grant memory none;
        vm.prank(device);
        bytes32 id = registry.grant(g, none);

        // Give the tree a child registry, so traversal has somewhere to go.
        vm.prank(device);
        AgentRegistry child = registry.attachChildRegistry(id, "acme");
        assertEq(address(registry.getSubregistry("acme")), address(child), "should traverse while live");

        vm.prank(device);
        registry.revoke(id);

        assertEq(
            address(registry.getSubregistry("acme")),
            address(0),
            "a revoked Agent must stop resolving"
        );
        assertEq(registry.getResolver("acme"), address(0), "and must offer no resolver");
    }

    function test_expiry_stops_the_name_resolving() public {
        Grant memory g = _grant(bytes32(0), "acme", agentKey, 100e6);
        Grant memory none;
        vm.prank(device);
        bytes32 id = registry.grant(g, none);
        vm.prank(device);
        registry.attachChildRegistry(id, "acme");

        assertTrue(address(registry.getSubregistry("acme")) != address(0), "live before expiry");

        vm.warp(block.timestamp + 31 days);
        assertEq(address(registry.getSubregistry("acme")), address(0), "expired names must not resolve");
    }

    function test_a_child_registry_knows_its_parent() public {
        Grant memory g = _grant(bytes32(0), "acme", agentKey, 100e6);
        Grant memory none;
        vm.prank(device);
        bytes32 id = registry.grant(g, none);

        vm.prank(device);
        AgentRegistry child = registry.attachChildRegistry(id, "acme");

        (IRegistry parent, string memory label) = child.getParent();
        assertEq(address(parent), address(registry), "child should point back at us");
        assertEq(label, "acme", "and know the label it sits under");
    }

    function test_a_grandchild_dies_when_the_root_is_revoked() public {
        Grant memory root = _grant(bytes32(0), "acme", agentKey, 100e6);
        Grant memory none;
        vm.prank(device);
        bytes32 rootId = registry.grant(root, none);

        vm.prank(device);
        AgentRegistry child = registry.attachChildRegistry(rootId, "acme");

        // The child registry issues beneath itself.
        Grant memory sub = _grant(rootId, "research", childKey, 10e6);
        vm.prank(device);
        child.grant(sub, root);

        assertTrue(child.current(keccak256("research")) != bytes32(0), "grandchild recorded");

        // Killing the root must take the whole branch with it.
        vm.prank(device);
        registry.revoke(rootId);

        assertEq(
            address(registry.getSubregistry("acme")),
            address(0),
            "traversal must stop at the revoked link"
        );
    }
}
