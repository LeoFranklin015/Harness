// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MockToken} from "./MockToken.sol";

/// A pool that takes a deposit and mints the claim on it, so a test can assert
/// who ended up holding the receipt.
contract MockAavePool {
    MockToken public immutable aToken;
    /// Asset to leave unpulled, so the dust path can be exercised.
    uint256 public leaveUnspent;

    constructor(MockToken aToken_) {
        aToken = aToken_;
    }

    function setLeaveUnspent(uint256 amount) external {
        leaveUnspent = amount;
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        uint256 taken = amount - leaveUnspent;
        MockToken(asset).transferFrom(msg.sender, address(this), taken);
        aToken.mint(onBehalfOf, taken);
    }
}
