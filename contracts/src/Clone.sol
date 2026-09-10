// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title Clone
/// @notice EIP-1167 minimal proxies, written out rather than pulling a library
///         in for twenty bytes of initcode.
library Clone {
    error CloneFailed();

    function make(address impl) internal returns (address addr) {
        bytes20 target = bytes20(impl);
        assembly {
            let p := mload(0x40)
            mstore(p, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(p, 0x14), target)
            mstore(add(p, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            addr := create(0, p, 0x37)
        }
        if (addr == address(0)) revert CloneFailed();
    }
}
