// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Call, CallRule, Constants, Grant, Period, PeriodSpend, Reason, SpendLimit} from "./Types.sol";
import {ICallChecker} from "./interfaces/ICallChecker.sol";
import {IExecutor} from "./interfaces/IExecutor.sol";
import {IRegistry} from "./interfaces/IRegistry.sol";

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
contract AgentRegistry is IRegistry {
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
    /// This registry's own label under its parent, for `getParent`.
    string public selfLabel;
    /// Answers lookups for the Agents beneath this registry.
    address public childResolver;
    /// Where a child's own children live, once it has any.
    mapping(bytes32 labelHash => AgentRegistry) public childRegistry;

    bool private _initialised;

    // --- per-Agent state ----------------------------------------------------

    struct Agent {
        bytes32 parent;
        address agentKey;
        uint48 start;
        uint48 end;
        bool exists;
        bool revoked;
    }

    /// Everything needed to walk and to authorise. The Grant's rules and limits
    /// are resupplied by the caller and checked against `agentId`.
    mapping(bytes32 agentId => Agent) public agents;

    /// The live Agent for a label, so a name resolves to current authority.
    mapping(bytes32 labelHash => bytes32 agentId) public current;

    /// Consumption per Agent, per SpendLimit, within the current window.
    mapping(bytes32 agentId => mapping(bytes32 limitId => PeriodSpend)) internal _spent;

    /// Next batch number an Agent may submit. Stops a relayed batch being
    /// replayed by whoever carried it.
    mapping(bytes32 agentId => uint256) public nonces;

    // --- EIP-712 ------------------------------------------------------------

    bytes32 private constant CALL_RULE_TYPEHASH = keccak256(
        "CallRule(address target,bytes4 selector,uint128 maxValue,address checker,bytes32 checkerCodeHash)"
    );
    bytes32 private constant SPEND_LIMIT_TYPEHASH =
        keccak256("SpendLimit(address token,uint160 allowance,uint8 unit,uint16 multiplier)");
    bytes32 private constant GRANT_TYPEHASH = keccak256(
        "Grant(bytes32 parent,string label,address agentKey,uint48 start,uint48 end,uint256 salt,CallRule[] calls,SpendLimit[] spends)CallRule(address target,bytes4 selector,uint128 maxValue,address checker,bytes32 checkerCodeHash)SpendLimit(address token,uint160 allowance,uint8 unit,uint16 multiplier)"
    );

    // --- events -------------------------------------------------------------

    event Granted(bytes32 indexed agentId, bytes32 indexed parent, string label, address agentKey);
    event Revoked(bytes32 indexed agentId);
    event Executed(bytes32 indexed agentId, uint256 calls);
    event Spent(bytes32 indexed agentId, address indexed token, uint160 amount, PeriodSpend period);

    // --- errors -------------------------------------------------------------

    error NotAgentKey();
    error NotAuthorised(Reason reason);
    error GrantMismatch();
    error NotNarrower();
    error AlreadyGranted();
    error BadWindow();
    error DuplicateLimit();
    /// Only the Tenant's device may issue or revoke a Grant.
    error NotRootDevice();
    /// The batch was not signed by the Agent's key.
    error BadSignature();
    error BadNonce();

    constructor(
        bytes32 self_,
        address tenant_,
        address rootDevice_,
        IExecutor executor_,
        AgentRegistry parentRegistry_
    ) {
        initialize(self_, "", tenant_, rootDevice_, executor_, parentRegistry_, address(0));
    }

    /// @notice Configures a clone. Callable once.
    function initialize(
        bytes32 self_,
        string memory selfLabel_,
        address tenant_,
        address rootDevice_,
        IExecutor executor_,
        AgentRegistry parentRegistry_,
        address childResolver_
    ) public {
        if (_initialised) revert AlreadyGranted();
        _initialised = true;
        self = self_;
        selfLabel = selfLabel_;
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
    function getSubregistry(string calldata label) external view returns (IRegistry) {
        bytes32 id = current[keccak256(bytes(label))];
        if (id == bytes32(0) || _checkAuthority(id) != Reason.Ok) return IRegistry(address(0));
        return IRegistry(address(childRegistry[keccak256(bytes(label))]));
    }

    /// @inheritdoc IRegistry
    function getResolver(string calldata label) external view returns (address) {
        bytes32 id = current[keccak256(bytes(label))];
        if (id == bytes32(0) || _checkAuthority(id) != Reason.Ok) return address(0);
        return childResolver;
    }

    /// @inheritdoc IRegistry
    function getParent() external view returns (IRegistry parent, string memory label) {
        return (IRegistry(address(parentRegistry)), selfLabel);
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

        child = AgentRegistry(_clone(address(this)));
        child.initialize(agentId, label, tenant, rootDevice, executor, this, childResolver);
        childRegistry[keccak256(bytes(label))] = child;
    }

    /// @dev EIP-1167 minimal proxy, written out rather than pulling a library
    ///      in for twenty bytes of initcode.
    function _clone(address impl) internal returns (address addr) {
        bytes20 target = bytes20(impl);
        assembly {
            let p := mload(0x40)
            mstore(p, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(p, 0x14), target)
            mstore(add(p, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            addr := create(0, p, 0x37)
        }
        require(addr != address(0), "clone failed");
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
            if (g.start < parentGrant.start || g.end > parentGrant.end) revert NotNarrower();
            _requireNarrower(g, parentGrant);
        }

        agentId = hashGrant(g);
        if (agents[agentId].exists) revert AlreadyGranted();
        _requireNoDuplicateLimits(g);

        agents[agentId] = Agent({
            parent: g.parent,
            agentKey: g.agentKey,
            start: g.start,
            end: g.end,
            exists: true,
            revoked: false
        });
        current[keccak256(bytes(g.label))] = agentId;

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
        if (_recover(_batchDigest(agentId, calls, nonce), agentSig) != g.agentKey) revert BadSignature();
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
        return _spent[agentId][_limitId(limit)];
    }

    function hashGrant(Grant calldata g) public view returns (bytes32) {
        bytes32[] memory ruleHashes = new bytes32[](g.calls.length);
        for (uint256 i; i < g.calls.length; ++i) {
            CallRule calldata c = g.calls[i];
            ruleHashes[i] = keccak256(
                abi.encode(CALL_RULE_TYPEHASH, c.target, c.selector, c.maxValue, c.checker, c.checkerCodeHash)
            );
        }
        bytes32[] memory limitHashes = new bytes32[](g.spends.length);
        for (uint256 i; i < g.spends.length; ++i) {
            SpendLimit calldata s = g.spends[i];
            limitHashes[i] = keccak256(
                abi.encode(SPEND_LIMIT_TYPEHASH, s.token, s.allowance, uint8(s.unit), s.multiplier)
            );
        }
        bytes32 structHash = keccak256(
            abi.encode(
                GRANT_TYPEHASH,
                g.parent,
                keccak256(bytes(g.label)),
                g.agentKey,
                g.start,
                g.end,
                g.salt,
                keccak256(abi.encodePacked(ruleHashes)),
                keccak256(abi.encodePacked(limitHashes))
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
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
        bytes32 lid = _limitId(limit);
        PeriodSpend memory p = _spent[agentId][lid];

        (uint48 wStart, uint48 wEnd) = _window(limit, g.start, g.end);
        if (p.start != wStart) p = PeriodSpend({start: wStart, end: wEnd, spend: 0});

        uint256 total = uint256(p.spend) + amount;
        if (total > limit.allowance) revert NotAuthorised(Reason.OverSpendLimit);

        p.spend = uint160(total);
        _spent[agentId][lid] = p;
        emit Spent(agentId, limit.token, amount, p);
    }

    /// @dev Windows are aligned to the Grant's own start, never to the epoch.
    function _window(SpendLimit calldata limit, uint48 gStart, uint48 gEnd)
        internal
        view
        returns (uint48 start, uint48 end)
    {
        if (limit.unit == Period.Forever) return (gStart, gEnd);
        uint256 len = _periodSeconds(limit.unit) * (limit.multiplier == 0 ? 1 : limit.multiplier);
        uint256 elapsed = block.timestamp - gStart;
        start = uint48(gStart + (elapsed / len) * len);
        end = uint48(uint256(start) + len);
    }

    function _periodSeconds(Period unit) internal pure returns (uint256) {
        if (unit == Period.Minute) return 60;
        if (unit == Period.Hour) return 3600;
        if (unit == Period.Day) return 86400;
        if (unit == Period.Week) return 604800;
        return 2629746; // average Gregorian month
    }

    function _limitId(SpendLimit calldata l) internal pure returns (bytes32) {
        return keccak256(abi.encode(l.token, l.unit, l.multiplier));
    }

    /// @dev Every rule and limit in `g` must already be permitted by `parent`.
    function _requireNarrower(Grant calldata g, Grant calldata parent) internal pure {
        for (uint256 i; i < g.calls.length; ++i) {
            bool covered;
            for (uint256 j; j < parent.calls.length; ++j) {
                if (_covers(parent.calls[j], g.calls[i])) {
                    covered = true;
                    break;
                }
            }
            if (!covered) revert NotNarrower();
        }
        for (uint256 i; i < g.spends.length; ++i) {
            bool covered;
            for (uint256 j; j < parent.spends.length; ++j) {
                SpendLimit calldata ps = parent.spends[j];
                SpendLimit calldata cs = g.spends[i];
                if (ps.token == cs.token && ps.unit == cs.unit && ps.multiplier == cs.multiplier) {
                    if (cs.allowance > ps.allowance) revert NotNarrower();
                    covered = true;
                    break;
                }
            }
            if (!covered) revert NotNarrower();
        }
    }

    function _covers(CallRule calldata wide, CallRule calldata narrow) internal pure returns (bool) {
        if (wide.target != Constants.ANY_TARGET && wide.target != narrow.target) return false;
        if (wide.selector != Constants.ANY_SELECTOR && wide.selector != narrow.selector) return false;
        if (narrow.maxValue > wide.maxValue) return false;
        // A child may add a checker, never drop the parent's.
        if (wide.checker != address(0) && wide.checker != narrow.checker) return false;
        return true;
    }

    function _requireNoDuplicateLimits(Grant calldata g) internal pure {
        for (uint256 i; i < g.spends.length; ++i) {
            for (uint256 j = i + 1; j < g.spends.length; ++j) {
                if (_limitId(g.spends[i]) == _limitId(g.spends[j])) revert DuplicateLimit();
            }
        }
    }

    /// @dev What an Agent signs to authorise one batch. Bound to the Agent, the
    ///      calls, the nonce, this contract and this chain, so a relayer can
    ///      carry it but not reuse or redirect it.
    function _batchDigest(bytes32 agentId, Call[] calldata calls, uint256 nonce)
        internal
        view
        returns (bytes32)
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
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }

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
