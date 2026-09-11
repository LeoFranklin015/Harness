// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MockToken} from "./MockToken.sol";

/// Uniswap v3's single-hop swap, exactly as the router declares it. It lives
/// here rather than in the executor because the executor does not know what a
/// swap is — only a test that wants to build one needs the shape.
struct ExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}

/// A router that trades at a fixed rate, so a test can assert on amounts
/// rather than on a pool's behaviour. It pulls under an allowance, which is
/// what makes it a real exercise of the approve-then-call path.
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
