// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ExactInputSingleParams} from "../../src/AllowanceExecutor.sol";
import {MockToken} from "./MockToken.sol";

/// A router that trades at a fixed rate, so a test can assert on amounts
/// rather than on a pool's behaviour.
contract MockSwapRouter {
    /// Output per unit of input, in basis points. 10000 is one for one.
    uint256 public rate = 10_000;
    /// Input to leave unspent, so the dust path can be exercised.
    uint256 public leaveUnspent;

    function setRate(uint256 bps) external {
        rate = bps;
    }

    function setLeaveUnspent(uint256 amount) external {
        leaveUnspent = amount;
    }

    function exactInputSingle(ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 amountOut)
    {
        uint256 taken = p.amountIn - leaveUnspent;
        MockToken(p.tokenIn).transferFrom(msg.sender, address(this), taken);
        amountOut = (taken * rate) / 10_000;
        MockToken(p.tokenOut).mint(p.recipient, amountOut);
    }
}
