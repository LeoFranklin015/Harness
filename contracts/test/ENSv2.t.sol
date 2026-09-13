// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {RegistryRolesLib} from
    "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {IPermissionedRegistry} from
    "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {LibLabel} from "@ensdomains/contracts-v2/utils/LibLabel.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CallRule, Constants, Grant, Period, SpendLimit} from "../src/Types.sol";
import {MockExecutor} from "./mocks/MockExecutor.sol";
import {MockLabelStore} from "./mocks/MockLabelStore.sol";

/// An Agent is a real ENSv2 name, not a lookup table of our own that happens to
/// answer ENS queries. These check the properties that follow from that — the
/// ones that would silently not hold if the registry only pretended.
contract ENSv2Test is Test {
    AgentRegistry root;
    MockExecutor executor;

    uint256 constant DEVICE_PK = 0xA11CE;
    address device;
    address tenant = address(0x7E4A47);
    address agentKey = address(0x1001);
    address stranger = address(0xBAD);

    address constant TOOL = address(0xC0FFEE);
    address constant USDC = address(0x05DC);

    function setUp() public {
        device = vm.addr(DEVICE_PK);
        executor = new MockExecutor();
        root = new AgentRegistry(
            new MockLabelStore(), bytes32(0), tenant, device, executor, AgentRegistry(address(0))
        );
        vm.warp(1_000_000);
    }

    function _grant(bytes32 parent, string memory label, address key, uint48 endsIn)
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
        l[0] = SpendLimit({token: USDC, allowance: 100e6, unit: Period.Day, multiplier: 1});
        return Grant({
            parent: parent,
            label: label,
            agentKey: key,
            start: uint48(block.timestamp),
            end: uint48(block.timestamp) + endsIn,
            salt: 0,
            calls: r,
            spends: l
        });
    }

    function _issue(string memory label, uint48 endsIn) internal returns (bytes32) {
        Grant memory g = _grant(bytes32(0), label, agentKey, endsIn);
        Grant memory none;
        vm.prank(device);
        return root.grant(g, none);
    }

    // --- the name is real ---------------------------------------------------

    function test_granting_mints_a_name_owned_by_the_tenant() public {
        assertEq(
            uint8(root.getState(LibLabel.id("acme")).status),
            uint8(IPermissionedRegistry.Status.AVAILABLE),
            "nothing before the grant"
        );

        _issue("acme", 30 days);

        IPermissionedRegistry.State memory s = root.getState(LibLabel.id("acme"));
        assertEq(uint8(s.status), uint8(IPermissionedRegistry.Status.REGISTERED));
        assertEq(root.ownerOf(s.tokenId), tenant, "the Tenant holds the name");
        assertEq(root.balanceOf(tenant, s.tokenId), 1, "and holds exactly one");
    }

    /// The Grant's end *is* the registration's expiry. Not copied, not kept in
    /// step by a second write — there is only one number.
    function test_the_name_expires_exactly_when_the_grant_does() public {
        _issue("acme", 7 days);
        assertEq(root.getState(LibLabel.id("acme")).expiry, uint64(block.timestamp) + 7 days);
    }

    function test_an_expired_grant_leaves_the_name_available_again() public {
        _issue("acme", 7 days);
        vm.warp(block.timestamp + 8 days);
        assertEq(
            uint8(root.getState(LibLabel.id("acme")).status),
            uint8(IPermissionedRegistry.Status.AVAILABLE)
        );
    }

    function test_revoking_burns_the_name() public {
        bytes32 id = _issue("acme", 30 days);
        uint256 tokenId = root.getState(LibLabel.id("acme")).tokenId;
        assertEq(root.ownerOf(tokenId), tenant);

        vm.prank(device);
        root.revoke(id);

        assertEq(root.ownerOf(tokenId), address(0), "the token is gone");
        assertEq(
            uint8(root.getState(LibLabel.id("acme")).status),
            uint8(IPermissionedRegistry.Status.AVAILABLE),
            "and the name is free again"
        );
    }

    /// An Agent may stand itself down, which must burn its name too — otherwise
    /// a self-revoked Agent keeps a name it has no authority behind.
    function test_an_agent_can_stand_itself_down() public {
        bytes32 id = _issue("acme", 30 days);
        vm.prank(agentKey);
        root.revoke(id);
        assertEq(root.ownerOf(root.getState(LibLabel.id("acme")).tokenId), address(0));
    }

    // --- and it cannot be taken away ---------------------------------------

    /// The registration withholds ROLE_CAN_TRANSFER_ADMIN, so ENSv2 itself
    /// refuses the transfer. A sellable name would outlive the Grant it stands
    /// for, and could end up with someone the Grant never mentioned.
    function test_an_agent_name_cannot_be_transferred() public {
        _issue("acme", 30 days);
        uint256 tokenId = root.getState(LibLabel.id("acme")).tokenId;

        vm.prank(tenant);
        vm.expectRevert();
        root.safeTransferFrom(tenant, stranger, tokenId, 1, "");

        assertEq(root.ownerOf(tokenId), tenant, "still the Tenant's");
    }

    /// The records an Agent is admitted by are not the Agent's to change.
    ///
    /// This is the claim the ssh story rests on: sshd asks ENS for the
    /// fingerprint, so an Agent that could repoint its own name at a resolver
    /// of its choosing could admit any key it liked. EAC is what stops it —
    /// the name is registered to the Tenant, and the Agent's key is granted
    /// `ROLE_UNREGISTER` on that one name and nothing else.
    function test_an_agent_cannot_repoint_its_own_resolver() public {
        _issue("acme", 30 days);
        uint256 id = LibLabel.id("acme");
        address before = address(root.getResolver("acme"));

        vm.prank(agentKey);
        vm.expectRevert();
        root.setResolver(id, address(0xDEAD));

        vm.prank(stranger);
        vm.expectRevert();
        root.setResolver(id, address(0xDEAD));

        // Nor the Tenant, though it owns the token. It is the account spending
        // pulls from, so it is the warmer key of the two; the device's root
        // roles are what may repoint a resolver, and the device is the Ledger.
        vm.prank(tenant);
        vm.expectRevert();
        root.setResolver(id, address(0xDEAD));

        assertEq(address(root.getResolver("acme")), before, "unchanged");
    }

    /// The one power an Agent does hold over its own name: ending it.
    function test_an_agent_may_only_unregister_its_own_name() public {
        _issue("acme", 30 days);

        // A different Agent, with a key of its own.
        Grant memory g = _grant(bytes32(0), "other", address(0x2002), 30 days);
        Grant memory none;
        vm.prank(device);
        root.grant(g, none);

        vm.prank(agentKey);
        vm.expectRevert();
        root.unregister(LibLabel.id("other"));

        assertEq(
            uint8(root.getState(LibLabel.id("other")).status),
            uint8(IPermissionedRegistry.Status.REGISTERED),
            "the sibling is untouched"
        );
    }

    function test_a_stranger_cannot_register_a_name() public {
        Grant memory g = _grant(bytes32(0), "acme", agentKey, 30 days);
        Grant memory none;
        vm.prank(stranger);
        // Refused by the role, not by an address comparison of ours.
        vm.expectRevert(
            abi.encodeWithSignature(
                "EACUnauthorizedAccountRoles(uint256,uint256,address)",
                0,
                RegistryRolesLib.ROLE_REGISTRAR,
                stranger
            )
        );
        root.grant(g, none);
    }

    // --- the roles are the authority ----------------------------------------

    /// Issuing is a role check, not an address comparison, so a person holding
    /// the device can admit a second one. A ring has more than one member; a
    /// tree with one irreplaceable issuer does not.
    ///
    /// Revoking is deliberately left alone — see `revoke`. The off switch
    /// should never be gated on something a manager UI can take away.
    function test_the_device_can_admit_a_second_device() public {
        address spare = address(0x5A4E);

        // Until it is granted, the spare is a stranger.
        Grant memory g = _grant(bytes32(0), "acme", agentKey, 30 days);
        Grant memory none;
        vm.prank(spare);
        vm.expectRevert();
        root.grant(g, none);

        vm.prank(device);
        root.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR, spare);

        vm.prank(spare);
        bytes32 id = root.grant(g, none);
        assertEq(root.ownerOf(root.getState(LibLabel.id("acme")).tokenId), tenant);

        // The original device can still end what the spare started.
        vm.prank(device);
        root.revoke(id);
        assertEq(
            uint8(root.getState(LibLabel.id("acme")).status),
            uint8(IPermissionedRegistry.Status.AVAILABLE)
        );
    }

    /// And a device that is taken back out cannot issue any more.
    function test_a_removed_device_stops_being_able_to_issue() public {
        address spare = address(0x5A4E);
        vm.prank(device);
        root.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR, spare);

        vm.prank(device);
        root.revokeRootRoles(RegistryRolesLib.ROLE_REGISTRAR, spare);

        Grant memory g = _grant(bytes32(0), "acme", agentKey, 30 days);
        Grant memory none;
        vm.prank(spare);
        vm.expectRevert();
        root.grant(g, none);
    }

    // --- the hierarchy is the real one -------------------------------------

    function test_a_child_registry_is_the_real_subregistry_pointer() public {
        bytes32 id = _issue("acme", 30 days);
        vm.prank(device);
        AgentRegistry child = root.attachChildRegistry(id, "acme");

        assertEq(address(root.getSubregistry("acme")), address(child));

        (IRegistry parent, string memory label) = child.getParent();
        assertEq(address(parent), address(root));
        assertEq(label, "acme");
    }

    function test_declares_the_ensv2_interfaces() public view {
        assertTrue(root.supportsInterface(type(IRegistry).interfaceId), "IRegistry");
        assertTrue(
            root.supportsInterface(type(IPermissionedRegistry).interfaceId), "IPermissionedRegistry"
        );
    }
}
