// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PermissionedRegistry} from "@ensdomains/contracts-v2/registry/PermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";
import {LibLabel} from "@ensdomains/contracts-v2/utils/LibLabel.sol";

import {AgentRegistry} from "./AgentRegistry.sol";
import {Clone} from "./Clone.sol";
import {IAgentReadable} from "./interfaces/IAgentReadable.sol";
import {IExecutor} from "./interfaces/IExecutor.sol";

/// @title PlatformRegistry
/// @notice What `harness.eth` points at: the registry that issues Tenants.
///
/// This level is ordinary ENSv2 name issuance and nothing more. Onboarding a
/// Tenant registers a real subname and gives that Tenant a registry of its own,
/// which is where all authority lives.
///
/// The split matters for one reason above the rest: **a Tenant's device is its
/// own.** Each `AgentRegistry` carries the device that signs Grants inside it,
/// so two Tenants are two trees rooted in two separate pieces of hardware, and
/// neither device can reach into the other's tree. Folding this level into
/// `AgentRegistry` would have given the whole platform a single root device —
/// which reads fine until you have a second customer.
///
/// It also puts the ceiling in the right place. A Tenant's first Grant is signed
/// by that Tenant's own device inside that Tenant's own tree: one tap sets the
/// ceiling, and everything below narrows from it. There is no platform-level
/// authority for a Tenant to be carved out of, because the platform holds none.
contract PlatformRegistry is PermissionedRegistry, IAgentReadable {
    /// The `AgentRegistry` every Tenant's tree is cloned from.
    address public immutable AGENT_IMPL;

    /// How long a Tenant's name is registered for. Renewed, not perpetual, so
    /// an abandoned Tenant eventually stops resolving on its own.
    uint64 public constant TENANT_DURATION = 365 days;

    /// What a Tenant may do with its own name. No transfer role: a Tenant's name
    /// is the root of an authority tree bound to a particular device, and moving
    /// it to another account would leave the tree pointing at the wrong hands.
    uint256 internal constant TENANT_ROLES = RegistryRolesLib.ROLE_SET_RESOLVER;

    event TenantOnboarded(
        string label, address indexed device, address indexed tenant, AgentRegistry registry
    );

    constructor(ILabelStore labelStore_, address admin_, address agentImpl_)
        PermissionedRegistry(labelStore_, admin_, ROOT_ROLES)
    {
        AGENT_IMPL = agentImpl_;
    }

    /// What the platform operator may do here: issue Tenants and take them back.
    uint256 internal constant ROOT_ROLES = RegistryRolesLib.ROLE_REGISTRAR
        | RegistryRolesLib.ROLE_UNREGISTER | RegistryRolesLib.ROLE_SET_SUBREGISTRY
        | RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_RENEW;

    /// @notice Registers `label` as a Tenant and gives it a tree of its own.
    /// @param device the Tenant's hardware wallet — the only account that will
    ///        be able to sign Grants anywhere inside that tree
    /// @param tenant the account whose funds back every Agent beneath it
    /// @param resolver answers for the Tenant's own Agents
    function onboardTenant(
        string calldata label,
        address device,
        address tenant,
        IExecutor executor,
        address resolver
    )
        external
        onlyRootRoles(RegistryRolesLib.ROLE_REGISTRAR)
        returns (AgentRegistry registry)
    {
        registry = AgentRegistry(Clone.make(AGENT_IMPL));
        registry.initialize(
            bytes32(0), tenant, device, executor, AgentRegistry(address(0)), resolver
        );

        _register(
            label,
            tenant,
            IRegistry(address(registry)),
            resolver,
            TENANT_ROLES,
            uint64(block.timestamp) + TENANT_DURATION,
            false
        );
        registry.adoptParent(label);

        emit TenantOnboarded(label, device, tenant, registry);
    }

    // --- what the resolver asks ---------------------------------------------
    //
    // A Tenant is a customer, not a machine and not an Agent. Nothing signs for
    // it here and nothing runs at this level — the Tenant's host record lives in
    // the Tenant's own registry, where its own device can set it without needing
    // permission on a contract shared with every other Tenant.
    //
    // Answering zero is not a gap, it is the fact.

    /// @inheritdoc IAgentReadable
    /// @dev A Tenant is a customer, not an Agent, so there is no id to verify.
    function agentIdOf(string calldata) external pure returns (bytes32) {
        return bytes32(0);
    }

    function agentKeyOf(string calldata) external pure returns (address) {
        return address(0);
    }

    function selfEndpoint() external pure returns (bytes4) {
        return bytes4(0);
    }

    function selfHostKey() external pure returns (bytes32) {
        return bytes32(0);
    }

    function selfOperator() external pure returns (bytes32) {
        return bytes32(0);
    }
}
