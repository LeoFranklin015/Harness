// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Call} from "./Types.sol";
import {IExecutor} from "./interfaces/IExecutor.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title AllowanceExecutor
/// @notice Moves ERC-20 out of the Tenant's own account under an approval they
///         granted once, at onboarding.
///
/// No custody: funds stay in the Tenant's account and this contract can only
/// move what the approval permits, when the registry says so. That matters
/// because the Tenant's account is an EOA delegated via EIP-7702, and the
/// device's delegate allowlist has exactly one entry — so we cannot install an
/// executor module on it. An allowance is the one lever available.
///
/// The cost is that only tokens can move. An agent that needs arbitrary calls
/// wants the account executor instead; the permission engine is indifferent.
contract AllowanceExecutor is IExecutor {
    /// Only this registry may direct funds. Authority is checked there.
    address public immutable registry;

    error NotRegistry();
    error NotATransfer();
    error TransferFailed();

    /// `transfer(address,uint256)` — the only shape this executor understands.
    bytes4 private constant TRANSFER = 0xa9059cbb;

    constructor(address registry_) {
        registry = registry_;
    }

    /// @inheritdoc IExecutor
    /// @dev A Call names the token in `to` and the recipient and amount in its
    ///      calldata, exactly as if the Agent were calling the token directly.
    ///      The Agent does not need to know it is spending through an approval.
    function execute(address tenant, Call[] calldata calls) external payable {
        if (msg.sender != registry) revert NotRegistry();

        for (uint256 i; i < calls.length; ++i) {
            bytes calldata data = calls[i].data;
            if (data.length != 68 || bytes4(data[:4]) != TRANSFER) revert NotATransfer();

            (address to, uint256 amount) = abi.decode(data[4:], (address, uint256));
            if (!IERC20(calls[i].to).transferFrom(tenant, to, amount)) revert TransferFailed();
        }
    }

    /// @inheritdoc IExecutor
    function balanceOf(address tenant, address token) external view returns (uint256) {
        return IERC20(token).balanceOf(tenant);
    }
}
