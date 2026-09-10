// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";

/// @notice The one call we make against ENS's own `.eth` registry: pointing
///         `harness.eth` at our tree. Declared here rather than pulling in the
///         full `IPermissionedRegistry`, which we never otherwise call.
interface ISubregistrySetter {
    function setSubregistry(uint256 anyId, IRegistry registry) external;
}
