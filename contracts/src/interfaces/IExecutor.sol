// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Call} from "../Types.sol";

/// @dev Where a Tenant's funds live and how calls reach them.
///
/// Pluggable because the two options differ in what they can do and what they
/// ask of the Tenant, and neither dominates:
///
/// - An allowance executor moves ERC-20 under an approval the Tenant granted.
///   No custody, no account changes, works with a plain EOA — including one
///   delegated via EIP-7702, whose delegate cannot be ours (the device's
///   allowlist has one entry). It can only move tokens.
///
/// - An account executor calls through a smart account that has authorised
///   this registry. Arbitrary calls, at the cost of the Tenant running an
///   account that grants us that right.
///
/// The permission engine does not care which. It decides *whether*; the
/// executor decides *how*.
interface IExecutor {
    /// @notice Performs `calls` on behalf of `tenant`.
    /// @dev MUST revert unless `msg.sender` is the registry it was configured
    ///      for: authority is checked there and nowhere else.
    function execute(address tenant, Call[] calldata calls) external payable;

    /// @notice Balance of `token` held by whatever this executor spends from.
    /// @dev Read before and after a batch to measure what actually moved,
    ///      independently of what the calldata claimed.
    function balanceOf(address tenant, address token) external view returns (uint256);
}
