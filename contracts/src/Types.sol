// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev Recurring window a SpendLimit resets on. Aligned to the grant's start,
///      never to the unix epoch: epoch alignment hands a grant issued at 23:59
///      two daily budgets within two minutes.
enum Period {
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Forever
}

/// @dev One entry in an Agent's call allowlist.
struct CallRule {
    /// Contract this rule permits. `ANY_TARGET` matches all.
    address target;
    /// Function it permits. `ANY_SELECTOR` matches all.
    bytes4 selector;
    /// Per-call ceiling on native value. Zero forbids attaching value.
    uint128 maxValue;
    /// Optional argument-level policy. `address(0)` for none.
    address checker;
    /// `extcodehash` of `checker` when the Grant was signed.
    /// A checker reached by proxy or redeployed at the same address is a
    /// different program; pinning the hash means the rule still means what the
    /// signer approved.
    bytes32 checkerCodeHash;
}

/// @dev A recurring budget in one token.
struct SpendLimit {
    /// `NATIVE_TOKEN` for the chain's own currency.
    address token;
    uint160 allowance;
    Period unit;
    /// Multiplies `unit`, so "every 6 hours" is (Hour, 6). Ignored for Forever.
    uint16 multiplier;
}

/// @dev Authority delegated to one Agent. Signed by the Tenant's device.
///
/// The Grant is never stored decomposed: only its EIP-712 hash and a status
/// word are kept, and the caller resupplies the struct on every use. That keeps
/// issuing cheap and revocation a single storage write.
struct Grant {
    /// The Agent this derives from. `bytes32(0)` names the Tenant root, which
    /// only the root device may issue.
    bytes32 parent;
    /// ENS label minted beneath the parent.
    string label;
    /// The key permitted to exercise this Grant. Holds no authority itself —
    /// it proves which Agent is asking, and nothing more.
    address agentKey;
    uint48 start;
    uint48 end;
    /// Distinguishes otherwise identical Grants, and lets a revoked one be
    /// re-issued rather than permanently burning the tuple.
    uint256 salt;
    CallRule[] calls;
    SpendLimit[] spends;
}

/// @dev One call in a batch an Agent asks to perform.
struct Call {
    address to;
    uint256 value;
    bytes data;
}

/// @dev Consumption of one SpendLimit within its current window.
struct PeriodSpend {
    uint48 start;
    uint48 end;
    uint160 spend;
}

/// @dev Why a check failed. Returned rather than reverted where the caller is a
///      view — a dashboard has to tell "no headroom" from "ancestor revoked",
///      and a bare revert cannot.
enum Reason {
    Ok,
    NotStarted,
    Expired,
    Revoked,
    AncestorGone,
    CallNotPermitted,
    ValueTooHigh,
    CheckerRejected,
    CheckerChanged,
    NoSpendLimit,
    OverSpendLimit
}

library Constants {
    /// ERC-7528: the chain's native currency as an address.
    address internal constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// Wildcards. Deliberately not `address(0)` / `bytes4(0)`, which are real
    /// values a caller could mean.
    address internal constant ANY_TARGET = 0x3232323232323232323232323232323232323232;
    bytes4 internal constant ANY_SELECTOR = 0x32323232;
    /// Matches a call carrying no calldata, which has no selector to match on.
    bytes4 internal constant EMPTY_CALLDATA = 0xe0e0e0e0;
}
