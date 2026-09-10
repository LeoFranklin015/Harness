// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Call} from "../../src/Types.sol";
import {IExecutor} from "../../src/interfaces/IExecutor.sol";

/// @dev Stands in for a funding backend. Tracks a balance per token and lets a
///      test say how much a batch moves, so spend accounting can be exercised
///      without a real token or account.
contract MockExecutor is IExecutor {
    mapping(address tenant => mapping(address token => uint256)) public balances;
    /// How much the next `execute` should move, per token.
    mapping(address token => uint256) public willMove;
    uint256 public executions;

    function fund(address tenant, address token, uint256 amount) external {
        balances[tenant][token] += amount;
    }

    function setWillMove(address token, uint256 amount) external {
        if (willMove[token] == 0) queued.push(token);
        willMove[token] = amount;
    }

    /// Tokens a test has queued a movement for.
    address[] internal queued;

    function execute(address tenant, Call[] calldata calls) external payable {
        executions += calls.length;
        // What a batch moves has nothing to do with what it is addressed to —
        // the point of measuring balances is that the two can differ.
        for (uint256 i; i < queued.length; ++i) {
            address token = queued[i];
            uint256 move = willMove[token];
            if (move != 0) {
                balances[tenant][token] -= move;
                willMove[token] = 0;
            }
        }
        delete queued;
    }

    function balanceOf(address tenant, address token) external view returns (uint256) {
        return balances[tenant][token];
    }
}
