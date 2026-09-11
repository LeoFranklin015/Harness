// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PermissionedRegistry} from "@ensdomains/contracts-v2/registry/PermissionedRegistry.sol";
import {IPermissionedRegistry} from
    "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";
import {LibLabel} from "@ensdomains/contracts-v2/utils/LibLabel.sol";

import {Call, CallRule, Constants, Grant, Period, PeriodSpend, Reason, SpendLimit} from "./Types.sol";
import {Clone} from "./Clone.sol";
import {GrantLib} from "./GrantLib.sol";
import {ICallChecker} from "./interfaces/ICallChecker.sol";
import {IExecutor} from "./interfaces/IExecutor.sol";

/// @title AgentRegistry
/// @notice The tree and the permissions in one contract: an Agent's name, the
///         authority delegated to it, and what it has spent all live together.
///
/// One instance per Agent that has children, deployed as a clone. A Grant lives
/// in the registry of the parent that issued it, so walking up to check
/// ancestors is walking up to check grantors.
///
/// Keeping the tree and the permissions in one place is deliberate. ENSv2
/// already stores existence, expiry, ownership and the parent edge; holding
/// permissions elsewhere means maintaining the same tree twice, keyed
/// differently — and ENSv2's resource ids rotate on expiry with no transaction,
/// so the second copy silently orphans itself. Here expiry is the Agent's
/// expiry and revocation is one write.
///
/// Grants are never stored decomposed. Only a status word is kept and the
/// caller resupplies the struct, so issuing is cheap and revocation is a single
/// storage write.
///
/// It extends `PermissionedRegistry`, so every Agent is a real ENSv2 name: a
/// token, with an expiry and roles, registered in the same registry type the
/// rest of the namespace uses. Granting authority mints the name and revoking
/// burns it. Two properties fall out of that rather than being invented here:
///
///   - The name expires exactly when the Grant does, because the Grant's end is
///     the registration's expiry. There is no second clock to keep in step.
///   - An Agent's name cannot be transferred away from the authority that
///     issued it, because the registration withholds `ROLE_CAN_TRANSFER_ADMIN`.
///     A name that could be sold would outlive the Grant it stands for.
///
/// The authority layer sits on top: narrowing, spend limits, and the walk up to
/// ancestors, none of which ENSv2 can express.
contract AgentRegistry is PermissionedRegistry {
    /// What this registry may do to itself: register Agents, unregister them,
    /// and point names at subregistries and resolvers.
    uint256 internal constant ROOT_ROLES = RegistryRolesLib.ROLE_REGISTRAR
        | RegistryRolesLib.ROLE_UNREGISTER | RegistryRolesLib.ROLE_SET_SUBREGISTRY
        | RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_PARENT
        | RegistryRolesLib.ROLE_RENEW;

    /// What an Agent's owner gets over its own name.
    ///
    /// Deliberately not `ROLE_CAN_TRANSFER_ADMIN`: an Agent's name is a
    /// statement about delegated authority, and a transferable one could be
    /// sold to someone the Grant never mentioned. `_update` refuses a transfer
    /// without that role, so withholding it is the whole enforcement.
    uint256 internal constant AGENT_ROLES =
        RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_SUBREGISTRY;

    // --- identity of this instance -----------------------------------------

    /// Storage rather than immutable: instances are deployed as minimal-proxy
    /// clones, one per Agent that has children, and a clone cannot carry
    /// immutables of its own.
    ///
    /// The Agent this registry issues on behalf of. `bytes32(0)` at the root.
    bytes32 public self;
    /// Where funds live and how calls reach them.
    IExecutor public executor;
    /// The Tenant whose funds back every Agent beneath this registry.
    address public tenant;
    /// The registry of `self`'s own parent. `address(0)` at the root.
    AgentRegistry public parentRegistry;
    /// Signs Grants at the root of this Tenant's tree.
    address public rootDevice;
    /// The registry at the top of this Tenant's tree.
    ///
    /// EIP-712 binds a signature to a verifying contract. Binding to each
    /// instance would make a Grant's hash differ between the registry that
    /// issued it and the registry of the child that must verify it against its
    /// parent — so the whole tree shares one domain. That is the right scope:
    /// the tree is one trust domain, and `Grant.parent` already pins where a
    /// Grant sits inside it.
    address public rootOfTree;
    /// Answers lookups for the Agents beneath this registry.
    address public childResolver;
    bool private _initialised;

    // --- per-Agent state ----------------------------------------------------

    struct Agent {
        bytes32 parent;
        address agentKey;
        uint48 start;
        uint48 end;
        bool exists;
        bool revoked;
        /// Which name this Agent holds, so revoking can burn it.
        bytes32 labelHash;
    }

    /// Everything needed to walk and to authorise. The Grant's rules and limits
    /// are resupplied by the caller and checked against `agentId`.
    mapping(bytes32 agentId => Agent) public agents;

    /// The live Agent for a label, so a name resolves to current authority.
    mapping(bytes32 labelHash => bytes32 agentId) public current;

    /// Where the host behind *this* registry can be reached, as raw IPv4
    /// bytes, and the ed25519 SSH host key it answers with.
    ///
    /// One record, about this registry's own name, not one per Agent. An
    /// address and a host key are properties of a machine: every Agent running
    /// on it shares them, and storing them per Agent would be the same two
    /// facts written N times with nothing keeping them equal.
    bytes4 public selfEndpoint;
    bytes32 public selfHostKey;

    /// The SHA-256 fingerprint of the key allowed to log into this host.
    ///
    /// The fingerprint, not the key. Publishing the key would publish a roster:
    /// who may log in, and precisely which private key is worth stealing. A
    /// fingerprint verifies a key that is offered without naming one that is
    /// not — sshd hands `AuthorizedKeysCommand` the key the client presents, so
    /// nothing here ever has to enumerate.
    ///
    /// Its own host key is the opposite case and is published whole: there the
    /// machine is identifying itself, which is what SSHFP is for.
    bytes32 public selfOperator;

    /// Consumption per Agent, per SpendLimit, within the current window.
    mapping(bytes32 agentId => mapping(bytes32 limitId => PeriodSpend)) internal _spent;

    /// Next batch number an Agent may submit. Stops a relayed batch being
    /// replayed by whoever carried it.
    mapping(bytes32 agentId => uint256) public nonces;

    // --- EIP-712 ------------------------------------------------------------


    // --- events -------------------------------------------------------------

    event Granted(bytes32 indexed agentId, bytes32 indexed parent, string label, address agentKey);
    event Revoked(bytes32 indexed agentId);
    event Executed(bytes32 indexed agentId, uint256 calls);
    event Spent(bytes32 indexed agentId, address indexed token, uint160 amount, PeriodSpend period);

    // --- errors -------------------------------------------------------------

    error NotAgentKey();
    error NotAuthorised(Reason reason);
    error GrantMismatch();
    error AlreadyGranted();
    error BadWindow();
    /// Only the Tenant's device may issue or revoke a Grant.
    error NotRootDevice();
    /// The batch was not signed by the Agent's key.
    error BadSignature();
    error BadNonce();

    constructor(
        ILabelStore labelStore_,
        bytes32 self_,
        address tenant_,
        address rootDevice_,
        IExecutor executor_,
        AgentRegistry parentRegistry_
    ) PermissionedRegistry(labelStore_, rootDevice_, ROOT_ROLES) {
        initialize(self_, tenant_, rootDevice_, executor_, parentRegistry_, address(0));
    }

    /// @notice Configures a clone. Callable once.
    function initialize(
        bytes32 self_,
        address tenant_,
        address rootDevice_,
        IExecutor executor_,
        AgentRegistry parentRegistry_,
        address childResolver_
    ) public {
        if (_initialised) revert AlreadyGranted();
        _initialised = true;

        // Clones run no constructor, so the root roles it would have granted
        // are granted here instead — to the device, which is already the only
        // account allowed to issue or revoke anywhere in this tree. Giving them
        // to the contract itself would not work: `grant` and
        // `attachChildRegistry` reach the inherited registry functions by
        // internal call, which leaves `msg.sender` as the device.
        _grantRoles(ROOT_RESOURCE, ROOT_ROLES, rootDevice_, false);

        self = self_;
        tenant = tenant_;
        rootDevice = rootDevice_;
        executor = executor_;
        parentRegistry = parentRegistry_;
        childResolver = childResolver_;
        rootOfTree = address(parentRegistry_) == address(0)
            ? address(this)
            : parentRegistry_.rootOfTree();
    }

    // --- ENSv2 IRegistry ----------------------------------------------------
    //
    // Authority and resolution answer to the same state. An Agent that is
    // revoked, expired, or whose parent is gone stops resolving here — through
    // standard ENS tooling, not only through ours — because these return zero
    // rather than because a record was deleted.

    /// @inheritdoc IRegistry
    /// @dev Registration expiry already stops an expired name here. This adds
    ///      what ENSv2 cannot see: revocation, and the death of an ancestor in
    ///      a registry above this one.
    function getSubregistry(string calldata label)
        public
        view
        override
        returns (IRegistry)
    {
        if (!_live(label)) return IRegistry(address(0));
        return super.getSubregistry(label);
    }

    /// @inheritdoc IRegistry
    function getResolver(string calldata label) public view override returns (address) {
        if (!_live(label)) return address(0);
        return super.getResolver(label);
    }

    /// @dev Whether the Agent behind a label still holds authority.
    function _live(string calldata label) internal view returns (bool) {
        bytes32 id = current[keccak256(bytes(label))];
        return id != bytes32(0) && _checkAuthority(id) == Reason.Ok;
    }

    /// @notice Records where this host is and how to recognise it.
    /// @param ipv4 the host's address on the mesh
    /// @param sshHostKey its raw ed25519 SSH host key — exactly 32 bytes, which
    ///        is the whole key
    ///
    /// @dev Set by the Tenant's own device. A host may move, and moving is not a
    ///      change of authority, so this needs no Grant.
    ///
    ///      Both together, never separately. They are one fact: a host that
    ///      moves gets a new address *and* a new key, and publishing the address
    ///      first leaves the name pointing at the new machine while the key
    ///      still names the old one — which is indistinguishable, to whoever
    ///      connects, from being handed the wrong host.
    function setHost(bytes4 ipv4, bytes32 sshHostKey, bytes32 operator) external {
        if (msg.sender != rootDevice) revert NotRootDevice();
        selfEndpoint = ipv4;
        selfHostKey = sshHostKey;
        selfOperator = operator;
    }

    /// @notice An Agent's key, or zero if it may not act.
    /// @dev What `addr()` answers with. Same computation as `endpointOf`: an
    ///      Agent that cannot act has no address to publish.
    function agentKeyOf(string calldata label) external view returns (address) {
        bytes32 id = current[keccak256(bytes(label))];
        if (id == bytes32(0) || _checkAuthority(id) != Reason.Ok) return address(0);
        return agents[id].agentKey;
    }

    /// @notice The live Agent's id for a label, or zero if it may not act.
    /// @dev Same gate as `agentKeyOf`: an Agent that cannot act is not one
    ///      anybody should be able to verify against a registry entry.
    function agentIdOf(string calldata label) external view returns (bytes32) {
        bytes32 id = current[keccak256(bytes(label))];
        if (id == bytes32(0) || _checkAuthority(id) != Reason.Ok) return bytes32(0);
        return id;
    }

    /// @notice Names the funding backend, once.
    /// @dev The executor must know the registry and the registry the executor,
    ///      so one of them is set after deployment rather than predicting an
    ///      address. Set-once, device-only.
    function setExecutor(IExecutor executor_) external {
        if (msg.sender != rootDevice) revert NotRootDevice();
        if (address(executor) != address(0)) revert AlreadyGranted();
        executor = executor_;
    }

    /// @notice Names the resolver that answers for Agents beneath this registry.
    function setChildResolver(address resolver_) external {
        if (msg.sender != rootDevice) revert NotRootDevice();
        childResolver = resolver_;
    }

    /// @notice Gives an Agent a registry of its own, so it can hold children.
    /// @dev Deployed as an EIP-1167 clone of this contract.
    function attachChildRegistry(bytes32 agentId, string calldata label)
        external
        returns (AgentRegistry child)
    {
        if (msg.sender != rootDevice) revert NotRootDevice();
        Agent storage a = agents[agentId];
        if (!a.exists) revert NotAuthorised(Reason.AncestorGone);
        if (current[keccak256(bytes(label))] != agentId) revert GrantMismatch();

        child = AgentRegistry(Clone.make(address(this)));
        child.initialize(agentId, tenant, rootDevice, executor, this, childResolver);
        // The real ENSv2 pointer, so a standard client descends into the child.
        setSubregistry(LibLabel.id(label), IRegistry(address(child)));
        child.adoptParent(label);
    }

    /// @notice Records this registry's place under its parent, for `getParent`.
    /// @dev Callable once, by whichever registry created this one: an
    ///      `AgentRegistry` above it, or the `PlatformRegistry` if this is a
    ///      Tenant's root. It writes the inherited parent edge directly, because
    ///      `setParent` is gated on a root role the creator does not hold.
    ///
    ///      A Tenant root has no `parentRegistry` to check against, so the first
    ///      caller wins. There is no race to lose: creation, initialisation and
    ///      this call happen in one transaction.
    function adoptParent(string calldata label) external {
        if (address(_parentRegistry) != address(0)) revert AlreadyGranted();
        if (address(parentRegistry) != address(0) && msg.sender != address(parentRegistry)) {
            revert NotRootDevice();
        }
        _parentRegistry = IRegistry(msg.sender);
        _childLabel = label;
    }


    // --- issuing ------------------------------------------------------------

    /// @notice Issues a Grant beneath `self`, if it is narrower than its parent.
    /// @param g the Grant to issue
    /// @param parentGrant the parent's Grant, resupplied so its rules can be
    ///        compared; must hash to `g.parent`. Ignored at the root.
    ///
    /// @dev Sent directly by the device. A signature-and-relay path was
    ///      considered and dropped: the device has to be present to sign either
    ///      way, so relaying buys nothing here and costs a relayer, a replay
    ///      defence, and a liveness dependency on whoever submits.
    ///
    /// @dev Authority narrows here and only here. Every CallRule must already
    ///      exist in the parent's set and every SpendLimit must be no larger
    ///      than the parent's for the same token and window. A parent cannot
    ///      hand out what it does not hold — which is the invariant the whole
    ///      system rests on, and the one thing neither prior art enforces.
    function grant(Grant calldata g, Grant calldata parentGrant)
        external
        returns (bytes32 agentId)
    {
        if (msg.sender != rootDevice) revert NotRootDevice();
        if (g.start >= g.end) revert BadWindow();

        // A registry issues children for exactly one Agent: itself.
        if (g.parent != self) revert GrantMismatch();

        if (self != bytes32(0)) {
            // The parent's Grant is resupplied so its rules can be compared;
            // it lives in the registry above, not here.
            if (hashGrant(parentGrant) != self) revert GrantMismatch();
            if (parentRegistry.checkReason(self) != Reason.Ok) {
                revert NotAuthorised(Reason.AncestorGone);
            }
            if (g.start < parentGrant.start || g.end > parentGrant.end) revert GrantLib.NotNarrower();
            GrantLib.requireNarrower(g, parentGrant);
        }

        agentId = hashGrant(g);
        if (agents[agentId].exists) revert AlreadyGranted();
        GrantLib.requireNoDuplicateLimits(g);

        agents[agentId] = Agent({
            parent: g.parent,
            agentKey: g.agentKey,
            start: g.start,
            end: g.end,
            exists: true,
            revoked: false,
            labelHash: keccak256(bytes(g.label))
        });
        current[keccak256(bytes(g.label))] = agentId;

        // The Agent becomes a real ENSv2 name, owned by the Tenant, expiring
        // exactly when its authority does. `checkRoles` is false because the
        // caller was already checked against `rootDevice` above; the roles this
        // contract holds over itself are what let it register at all.
        _register(g.label, tenant, IRegistry(address(0)), childResolver, AGENT_ROLES, g.end, false);

        // An Agent may stand itself down, so it needs the role that burns its
        // own name. Granted on that name only — never at the root.
        _grantRoles(
            getResource(LibLabel.id(g.label)),
            RegistryRolesLib.ROLE_UNREGISTER,
            g.agentKey,
            false
        );

        emit Granted(agentId, g.parent, g.label, g.agentKey);
    }

    /// @notice Ends an Agent's authority. Descendants die with it, because every
    ///         check walks up and finds the gap — nothing cascades.
    function revoke(bytes32 agentId) external {
        Agent storage a = agents[agentId];
        if (!a.exists) revert NotAuthorised(Reason.AncestorGone);
        // The device, or the Agent standing itself down.
        if (msg.sender != rootDevice && msg.sender != a.agentKey) revert NotRootDevice();
        a.revoked = true;

        // Burn the name with the authority. The token goes, the roles attached
        // to it are invalidated by the version bump, and the entry expires — so
        // an ENS client sees the name end for the same reason the spend path
        // does, without being told about revocation as a separate idea.
        //
        // Only if this Agent still holds the label: a later Grant for the same
        // name supersedes this one, and revoking the superseded Agent must not
        // take the live one's name with it.
        if (current[a.labelHash] == agentId) {
            unregister(uint256(a.labelHash));
        }

        emit Revoked(agentId);
    }

    // --- exercising ---------------------------------------------------------

    /// @notice Performs `calls` under `g`, if every one of them is permitted and
    ///         the spend they cause fits within the limits.
    ///
    /// @dev The Agent signs; anyone may relay. An Agent is a machine that runs
    ///      constantly and must never need gas — requiring it to send its own
    ///      transaction would mean funding every Agent key and stranding the
    ///      dust. The broker relays and pays.
    ///
    ///      Spend is measured as the larger of what the calldata declared and
    ///      what the balances actually moved, so a contract that transfers more
    ///      than it says is still counted, and a borrow-and-return is not.
    ///      Counters are written before the funds move.
    function execute(Grant calldata g, Call[] calldata calls, uint256 nonce, bytes calldata agentSig)
        external
    {
        bytes32 agentId = hashGrant(g);
        if (nonce != nonces[agentId]) revert BadNonce();
        if (GrantLib.recover(GrantLib.batchDigest(agentId, calls, nonce, _domainSeparator()), agentSig) != g.agentKey) revert BadSignature();
        nonces[agentId] = nonce + 1;

        Reason r = _checkAuthority(agentId);
        if (r != Reason.Ok) revert NotAuthorised(r);

        for (uint256 i; i < calls.length; ++i) {
            Reason cr = _checkCall(agentId, g, calls[i]);
            if (cr != Reason.Ok) revert NotAuthorised(cr);
        }

        // Snapshot every token this Grant tracks, so the delta is measurable.
        uint256[] memory before = new uint256[](g.spends.length);
        for (uint256 i; i < g.spends.length; ++i) {
            before[i] = executor.balanceOf(tenant, g.spends[i].token);
        }

        executor.execute(tenant, calls);

        for (uint256 i; i < g.spends.length; ++i) {
            uint256 nowBal = executor.balanceOf(tenant, g.spends[i].token);
            uint256 moved = nowBal >= before[i] ? 0 : before[i] - nowBal;
            if (moved != 0) _account(agentId, g, g.spends[i], uint160(moved));
        }

        emit Executed(agentId, calls.length);
    }

    // --- views --------------------------------------------------------------

    /// @notice Whether this Agent may act at all, right now.
    /// @dev The one question the resolver, the dashboard and `execute` all ask.
    ///      Returns a reason rather than reverting: a dashboard has to tell
    ///      "expired" from "revoked" from "the parent is gone".
    function check(bytes32 agentId) external view returns (bool ok, Reason reason) {
        reason = _checkAuthority(agentId);
        ok = reason == Reason.Ok;
    }

    /// @notice What an Agent has consumed of one limit in the current window.
    function spentOf(bytes32 agentId, SpendLimit calldata limit)
        external
        view
        returns (PeriodSpend memory)
    {
        return _spent[agentId][GrantLib.limitId(limit)];
    }

    /// @notice The EIP-712 digest that identifies a Grant.
    function hashGrant(Grant calldata g) public view returns (bytes32) {
        return GrantLib.hash(g, _domainSeparator());
    }

    // --- internals ----------------------------------------------------------

    /// @notice Why an Agent may or may not act. Public so the registry below can
    ///         ask about the Agent this one represents.
    function checkReason(bytes32 agentId) public view returns (Reason) {
        return _checkAuthority(agentId);
    }

    /// @dev Each registry knows only its own children, so the walk crosses
    ///      contracts: check the Agent here, then ask the registry above
    ///      whether *we* are still live. One dead link anywhere up the chain
    ///      kills everything beneath it, without anything cascading.
    function _checkAuthority(bytes32 agentId) internal view returns (Reason) {
        Agent storage a = agents[agentId];
        if (!a.exists || a.revoked) return Reason.Revoked;
        if (block.timestamp < a.start) return Reason.NotStarted;
        if (block.timestamp >= a.end) return Reason.Expired;

        if (address(parentRegistry) == address(0)) return Reason.Ok;
        return parentRegistry.checkReason(self) == Reason.Ok ? Reason.Ok : Reason.AncestorGone;
    }

    function _checkCall(bytes32 agentId, Grant calldata g, Call calldata c)
        internal
        view
        returns (Reason)
    {
        bytes4 sel = c.data.length == 0 ? Constants.EMPTY_CALLDATA : bytes4(c.data[:4]);
        bool matched;

        for (uint256 i; i < g.calls.length; ++i) {
            CallRule calldata rule = g.calls[i];
            if (rule.target != Constants.ANY_TARGET && rule.target != c.to) continue;
            if (rule.selector != Constants.ANY_SELECTOR && rule.selector != sel) continue;
            matched = true;

            if (c.value > rule.maxValue) return Reason.ValueTooHigh;

            if (rule.checker != address(0)) {
                // A checker reached by proxy or redeployed is a different
                // program than the one signed for.
                if (rule.checker.codehash != rule.checkerCodeHash) return Reason.CheckerChanged;
                if (!ICallChecker(rule.checker).canExecute(agentId, g.agentKey, c.to, c.value, c.data)) {
                    return Reason.CheckerRejected;
                }
            }
        }
        return matched ? Reason.Ok : Reason.CallNotPermitted;
    }

    function _account(bytes32 agentId, Grant calldata g, SpendLimit calldata limit, uint160 amount)
        internal
    {
        bytes32 lid = GrantLib.limitId(limit);
        PeriodSpend memory p = _spent[agentId][lid];

        (uint48 wStart, uint48 wEnd) = GrantLib.window(limit, g.start, g.end);
        if (p.start != wStart) p = PeriodSpend({start: wStart, end: wEnd, spend: 0});

        uint256 total = uint256(p.spend) + amount;
        if (total > limit.allowance) revert NotAuthorised(Reason.OverSpendLimit);

        p.spend = uint160(total);
        _spent[agentId][lid] = p;
        emit Spent(agentId, limit.token, amount, p);
    }

    /// @dev Windows are aligned to the Grant's own start, never to the epoch.


    /// @dev Every rule and limit in `g` must already be permitted by `parent`.


    /// @notice EIP-712 domain separator, so an Agent can build a batch digest.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AgentRegistry"),
                keccak256("1"),
                block.chainid,
                rootOfTree
            )
        );
    }
}
