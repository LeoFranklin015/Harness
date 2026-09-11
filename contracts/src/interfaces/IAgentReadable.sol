// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice What the resolver asks each registry as it walks down a name.
///
/// Every level answers the same three questions, so the walk never branches on
/// how far down it has got. What differs is the answers: the platform level has
/// no host and no keys, because a Tenant is a customer rather than a machine.
interface IAgentReadable {
    /// The key that acts for `label`, or zero if it may not act.
    function agentKeyOf(string calldata label) external view returns (address);

    /// The id of the live Agent for `label`, or zero if there is none.
    /// ENSIP-25 keys a verification record on it.
    function agentIdOf(string calldata label) external view returns (bytes32);

    /// Where the host behind *this* registry's own name can be reached.
    /// Agents beneath it inherit this, because an address belongs to a machine
    /// and every Agent on that machine shares it.
    function selfEndpoint() external view returns (bytes4);

    /// The ed25519 SSH host key that host answers with.
    function selfHostKey() external view returns (bytes32);

    /// SHA-256 fingerprint of the key allowed to log into that host.
    function selfOperator() external view returns (bytes32);
}
