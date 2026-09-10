// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {IAgentReadable} from "../src/interfaces/IAgentReadable.sol";
import {AgentResolver} from "../src/AgentResolver.sol";
import {CallRule, Constants, Grant, Period, SpendLimit} from "../src/Types.sol";
import {MockLabelStore} from "./mocks/MockLabelStore.sol";
import {MockExecutor} from "./mocks/MockExecutor.sol";

/// What a standard ENS client sees. These go through `resolve(bytes,bytes)`
/// exactly as UniversalResolver would, so what they prove is what a wallet gets
/// — not what our own tooling gets.
contract ResolverTest is Test {
    PlatformRegistry platform;
    AgentRegistry demoReg;
    AgentResolver resolver;
    MockExecutor executor;

    uint256 constant DEVICE_PK = 0xA11CE;
    address device;
    address tenant = address(0x7E4A47);
    address researchKey = address(0x1002);

    address constant TOOL = address(0xC0FFEE);
    address constant USDC = address(0x05DC);

    /// \x07harness\x03eth\x00
    bytes constant ZONE = hex"076861726e6573730365746800";

    /// research.demo.harness.eth
    bytes constant RESEARCH = hex"0872657365617263680464656d6f076861726e6573730365746800";
    /// demo.harness.eth
    bytes constant DEMO = hex"0464656d6f076861726e6573730365746800";

    /// The ed25519 host key of the box serving the demo Agent.
    bytes32 constant HOST_KEY =
        0x4d86674e02de300f905ceb0b712f3323a14447fa7516dbad2094dca747e1cb74;

    bytes32 researchId;

    function setUp() public {
        device = vm.addr(DEVICE_PK);
        executor = new MockExecutor();

        // harness.eth issues Tenants; each Tenant gets a tree of its own, rooted
        // in its own device.
        platform = new PlatformRegistry(
            new MockLabelStore(),
            address(this),
            // Only ever cloned, never used directly — but its constructor still
            // grants root roles, and they must go somewhere real.
            address(
                new AgentRegistry(
                    new MockLabelStore(),
                    bytes32(0),
                    address(this),
                    address(this),
                    executor,
                    AgentRegistry(address(0))
                )
            )
        );
        resolver = new AgentResolver(IAgentReadable(address(platform)), ZONE);
        vm.warp(1_000_000);

        demoReg = platform.onboardTenant("demo", device, tenant, executor, address(resolver));

        vm.startPrank(device);
        // The machine publishes where it is and how to recognise it, once.
        demoReg.setHost(bytes4(hex"8d94d14d"), HOST_KEY); // 141.148.209.77

        Grant memory research = _grant(bytes32(0), "research", researchKey, 10e6);
        Grant memory none;
        researchId = demoReg.grant(research, none);
        vm.stopPrank();
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

    function _addr(bytes memory name) internal view returns (address) {
        bytes memory out = resolver.resolve(name, abi.encodeWithSelector(0x3b3b57de, bytes32(0)));
        if (out.length == 0) return address(0);
        return abi.decode(out, (address));
    }

    function _text(bytes memory name, string memory key) internal view returns (string memory) {
        bytes memory out =
            resolver.resolve(name, abi.encodeWithSelector(0x59d1d43c, bytes32(0), key));
        if (out.length == 0) return "";
        return abi.decode(out, (string));
    }

    // --- the happy path -----------------------------------------------------

    function test_resolves_a_nested_agent() public view {
        assertEq(_addr(RESEARCH), researchKey, "two levels deep");
        assertEq(_addr(DEMO), address(0), "a Tenant is not an Agent and has no key");
    }

    function test_resolves_the_endpoint_as_text_and_bytes() public view {
        assertEq(_text(RESEARCH, "url"), "ssh://141.148.209.77");

        bytes memory out =
            resolver.resolve(RESEARCH, abi.encodeWithSelector(0xecbfada3, bytes32(0), "endpoint"));
        assertEq(abi.decode(out, (bytes)), hex"8d94d14d");
    }

    function test_resolves_the_multicoin_form_for_ether_only() public view {
        bytes memory eth =
            resolver.resolve(RESEARCH, abi.encodeWithSelector(0xf1cb7e06, bytes32(0), uint256(60)));
        assertEq(abi.decode(eth, (bytes)), abi.encodePacked(researchKey));

        bytes memory btc =
            resolver.resolve(RESEARCH, abi.encodeWithSelector(0xf1cb7e06, bytes32(0), uint256(0)));
        assertEq(abi.decode(btc, (bytes)).length, 0, "no bitcoin address for an agent");
    }

    /// The exact second field of /etc/ssh/ssh_host_ed25519_key.pub on the box
    /// serving the demo Agent. If the contract emits this, the record can be
    /// pasted into known_hosts unmodified — which is the whole point of
    /// publishing it.
    string constant HOST_KEY_B64 =
        "AAAAC3NzaC1lZDI1NTE5AAAAIE2GZ04C3jAPkFzrC3EvMyOhREf6dRbbrSCU3KdH4ct0";

    function test_publishes_a_paste_ready_known_hosts_line() public view {
        assertEq(
            _text(RESEARCH, "ssh-hostkey"), string.concat("ssh-ed25519 ", HOST_KEY_B64)
        );
    }

    function test_publishes_the_raw_host_key_for_machines() public view {
        bytes memory out = resolver.resolve(
            RESEARCH, abi.encodeWithSelector(0xecbfada3, bytes32(0), "ssh-hostkey")
        );
        assertEq(abi.decode(out, (bytes)), abi.encodePacked(HOST_KEY));
    }

    function test_a_revoked_agent_publishes_no_host_key() public {
        vm.prank(device);
        demoReg.revoke(researchId);
        assertEq(_text(RESEARCH, "ssh-hostkey"), "", "nothing to recognise it by");
        assertEq(_text(RESEARCH, "url"), "", "and nowhere to reach it");
    }

    /// An Agent whose Runner has not registered publishes no key at all, rather
    /// than a zero one that would look like a real answer.
    /// The host record is published once, by the machine, and every Agent on
    /// that machine resolves to it. Storing it per Agent would be the same two
    /// facts written N times with nothing keeping them equal.
    function test_agents_inherit_the_host_record_from_their_machine() public view {
        assertEq(
            _text(RESEARCH, "ssh-hostkey"), _text(DEMO, "ssh-hostkey"), "one key, one machine"
        );
        assertEq(_text(RESEARCH, "url"), _text(DEMO, "url"), "and one address");
    }

    function test_declares_ensip10() public view {
        assertTrue(resolver.supportsInterface(0x9061b923));
        assertTrue(resolver.supportsInterface(0x01ffc9a7));
        assertFalse(resolver.supportsInterface(0xdeadbeef));
    }

    // --- authority is the only thing keeping a name alive -------------------

    function test_a_revoked_agent_stops_resolving() public {
        assertEq(_addr(RESEARCH), researchKey);

        vm.prank(device);
        demoReg.revoke(researchId);

        assertEq(_addr(RESEARCH), address(0), "revoked agent has no address");
        assertEq(_text(RESEARCH, "url"), "", "and no address");
        assertEq(_text(DEMO, "url"), "ssh://141.148.209.77", "but its machine is untouched");
    }

    function test_unregistering_the_tenant_takes_its_agents_with_it() public {
        platform.unregister(uint256(keccak256("demo")));

        assertEq(_text(DEMO, "url"), "", "the Tenant is gone");
        assertEq(_addr(RESEARCH), address(0), "so the walk cannot even reach its Agents");
    }

    function test_an_expired_agent_stops_resolving() public {
        vm.warp(block.timestamp + 31 days);
        assertEq(_addr(RESEARCH), address(0), "the Agent's Grant ran out");
        assertEq(_text(RESEARCH, "url"), "", "so it has no address either");
    }

    // --- names that are not ours --------------------------------------------

    function test_refuses_names_outside_the_zone() public view {
        // research.demo.attacker.eth — same shape, different zone. Anyone may
        // point their own ENS name at this resolver; none of them get to speak
        // for an Agent.
        bytes memory impostor =
            hex"0872657365617263680464656d6f0861747461636b65720365746800";
        assertEq(_addr(impostor), address(0));
    }

    function test_answers_nothing_for_the_apex() public view {
        assertEq(_addr(ZONE), address(0), "harness.eth is not an agent");
    }

    function test_answers_nothing_for_an_unknown_agent() public view {
        // ghost.harness.eth
        bytes memory ghost = hex"0567686f7374076861726e6573730365746800";
        assertEq(_addr(ghost), address(0));
    }

    function test_answers_nothing_for_an_unsupported_record() public view {
        assertEq(resolver.resolve(RESEARCH, abi.encodeWithSelector(0xdeadbeef)).length, 0);
        assertEq(_text(RESEARCH, "com.twitter"), "");
    }
}
