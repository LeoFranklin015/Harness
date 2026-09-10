// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @dev ENSv2's registry interface, verbatim from ensdomains/contracts-v2 at
///      48b3e2d39513b9dd32ef1850877a29009bc807b9. Pinned rather than tracking
///      main: the surface has already moved under us once.
///
/// Deliberately minimal — three view functions are all UniversalResolverV2
/// needs to traverse a name. ENS's own docs put it plainly: "a custom registry
/// could implement IRegistry with entirely different ownership and access
/// models."
interface IRegistry {
    function getSubregistry(string calldata label) external view returns (IRegistry);
    function getResolver(string calldata label) external view returns (address);
    function getParent() external view returns (IRegistry parent, string memory label);
}

/// @dev The parts of IStandardRegistry we call on the registry above us, to
///      point `harness.eth` at our own tree.
interface ISubregistrySetter {
    function setSubregistry(uint256 anyId, IRegistry registry) external;
    function setResolver(uint256 anyId, address resolver) external;
}
