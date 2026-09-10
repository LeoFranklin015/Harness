// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";

/// The shared label database, as far as these tests are concerned.
///
/// The real one is deployed once per network and every registry writes into it;
/// nothing here depends on how it stores things, only that a label put in comes
/// back out. Standing this up locally keeps the tests off ENS's own deployment
/// and away from its build graph.
contract MockLabelStore is ILabelStore {
    mapping(uint256 => string) internal _labels;

    /// Ids are the labelhash with the low 32 bits cleared, matching how the
    /// registries truncate them.
    function _id(string memory label) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label))) & ~uint256(0xffffffff);
    }

    function setLabel(string calldata label) external {
        uint256 id = _id(label);
        if (bytes(_labels[id]).length == 0) {
            _labels[id] = label;
            emit Label(keccak256(bytes(label)), label);
        }
    }

    function getLabel(uint256 anyId) external view returns (string memory) {
        return _labels[anyId & ~uint256(0xffffffff)];
    }
}
