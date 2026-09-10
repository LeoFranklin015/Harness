// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Call, CallRule, Constants, Grant, Period, SpendLimit} from "./Types.sol";

/// @title GrantLib
/// @notice Hashing a Grant, and deciding whether one Grant is narrower than
///         another.
///
/// Pure logic over calldata, kept out of the registry so it is linked as a
/// separate deployment rather than copied into the registry's bytecode. That is
/// what keeps `AgentRegistry` — which already carries the whole of
/// `PermissionedRegistry` — under the 24,576 byte limit.
library GrantLib {
    error NotNarrower();
    error DuplicateLimit();

    bytes32 internal constant CALL_RULE_TYPEHASH = keccak256(
        "CallRule(address target,bytes4 selector,uint128 maxValue,address checker,bytes32 checkerCodeHash)"
    );
    bytes32 internal constant SPEND_LIMIT_TYPEHASH =
        keccak256("SpendLimit(address token,uint160 allowance,uint8 unit,uint16 multiplier)");
    bytes32 internal constant GRANT_TYPEHASH = keccak256(
        "Grant(bytes32 parent,string label,address agentKey,uint48 start,uint48 end,uint256 salt,CallRule[] calls,SpendLimit[] spends)CallRule(address target,bytes4 selector,uint128 maxValue,address checker,bytes32 checkerCodeHash)SpendLimit(address token,uint160 allowance,uint8 unit,uint16 multiplier)"
    );

    /// @notice The EIP-712 digest that identifies a Grant.
    /// @param domainSeparator the tree's domain, so the same Grant hashes alike
    ///        in the registry that issued it and the registry that must verify
    ///        it against its parent
    function hash(Grant calldata g, bytes32 domainSeparator) public pure returns (bytes32) {
        bytes32[] memory ruleHashes = new bytes32[](g.calls.length);
        for (uint256 i; i < g.calls.length; ++i) {
            CallRule calldata c = g.calls[i];
            ruleHashes[i] = keccak256(
                abi.encode(
                    CALL_RULE_TYPEHASH, c.target, c.selector, c.maxValue, c.checker, c.checkerCodeHash
                )
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
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// @notice Reverts unless `g` grants no more than `parent` holds.
    ///
    /// @dev Every CallRule must already be covered by one of the parent's, and
    ///      every SpendLimit must be no larger than the parent's for the same
    ///      token and window. A parent cannot hand out what it does not hold —
    ///      the invariant the whole system rests on.
    function requireNarrower(Grant calldata g, Grant calldata parent) public pure {
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

    /// @notice Reverts if a Grant names the same token and window twice.
    /// @dev Two limits sharing a window would each be counted against
    ///      separately, so the Agent could spend the sum of them.
    function requireNoDuplicateLimits(Grant calldata g) public pure {
        for (uint256 i; i < g.spends.length; ++i) {
            for (uint256 j = i + 1; j < g.spends.length; ++j) {
                if (limitId(g.spends[i]) == limitId(g.spends[j])) revert DuplicateLimit();
            }
        }
    }

    function limitId(SpendLimit calldata l) public pure returns (bytes32) {
        return keccak256(abi.encode(l.token, uint8(l.unit), l.multiplier));
    }

    /// @notice The window a SpendLimit is currently counted in.
    /// @dev Windows are anchored to the Grant's own start, so an Agent granted
    ///      at noon gets a day that runs noon to noon — not one that resets at
    ///      midnight, which would hand it two full allowances on its first day.
    function window(SpendLimit calldata limit, uint48 gStart, uint48 gEnd)
        public
        view
        returns (uint48 start, uint48 end)
    {
        if (limit.unit == Period.Forever) return (gStart, gEnd);
        uint256 len = periodSeconds(limit.unit) * (limit.multiplier == 0 ? 1 : limit.multiplier);
        uint256 elapsed = block.timestamp - gStart;
        start = uint48(gStart + (elapsed / len) * len);
        end = uint48(uint256(start) + len);
    }

    function periodSeconds(Period unit) public pure returns (uint256) {
        if (unit == Period.Minute) return 60;
        if (unit == Period.Hour) return 3600;
        if (unit == Period.Day) return 86400;
        if (unit == Period.Week) return 604800;
        return 2629746; // average Gregorian month
    }

    /// @notice What an Agent signs to authorise one batch.
    /// @dev Bound to the Agent, the calls, the nonce and the tree's domain, so a
    ///      relayer can carry it but not reuse or redirect it.
    function batchDigest(
        bytes32 agentId,
        Call[] calldata calls,
        uint256 nonce,
        bytes32 domainSeparator
    ) public pure returns (bytes32) {
        bytes32[] memory callHashes = new bytes32[](calls.length);
        for (uint256 i; i < calls.length; ++i) {
            callHashes[i] =
                keccak256(abi.encode(calls[i].to, calls[i].value, keccak256(calls[i].data)));
        }
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Batch(bytes32 agentId,uint256 nonce,bytes32 calls)"),
                agentId,
                nonce,
                keccak256(abi.encodePacked(callHashes))
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function recover(bytes32 digest, bytes calldata sig) public pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }

    function _covers(CallRule calldata wide, CallRule calldata narrow)
        internal
        pure
        returns (bool)
    {
        if (wide.target != Constants.ANY_TARGET && wide.target != narrow.target) return false;
        if (wide.selector != Constants.ANY_SELECTOR && wide.selector != narrow.selector) {
            return false;
        }
        if (narrow.maxValue > wide.maxValue) return false;
        // A child may add a checker, never drop the parent's.
        if (wide.checker != address(0) && wide.checker != narrow.checker) return false;
        return true;
    }
}
