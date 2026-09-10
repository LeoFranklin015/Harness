// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev Argument-level policy for a CallRule.
///
/// A rule matches on target and selector, which cannot express "may swap, but
/// only into USDC" or "may call this, but only under this size". A checker
/// sees the whole call and decides.
///
/// Checkers are pinned by `extcodehash` in the Grant they appear in, so a
/// checker that is later redeployed or reached through a repointed proxy stops
/// matching rather than silently changing what the signer approved.
interface ICallChecker {
    /// @notice Whether this call is permitted.
    /// @dev MUST be view and SHOULD be cheap: it runs on every matching call.
    ///      Returning false is a refusal; reverting is a failure. Prefer false.
    function canExecute(
        bytes32 agentId,
        address agentKey,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (bool);
}
