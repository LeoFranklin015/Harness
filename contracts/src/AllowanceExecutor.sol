// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Call} from "./Types.sol";
import {IExecutor} from "./interfaces/IExecutor.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @dev Uniswap v3's single-hop swap, exactly as the router declares it.
///      Selector `0x414bf389`.
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

interface ISwapRouter {
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @title AllowanceExecutor
/// @notice Spends a Tenant's ERC-20 out of the Tenant's own account, under an
///         approval they granted once at onboarding.
///
/// No custody between transactions: funds live in the Tenant's account and
/// this contract can only move what the approval permits, when the registry
/// says so. That constraint is not a choice. The Tenant's account is an EOA
/// delegated via EIP-7702 and the device's delegate allowlist has exactly one
/// entry, so no executor module can be installed on it. An allowance is the
/// one lever available.
///
/// Two shapes are understood, and everything else is refused:
///
/// - **`transfer(address,uint256)`** on a token. Settled with `transferFrom`,
///   straight from the Tenant to the recipient. Nothing is ever held.
///
/// - **`exactInputSingle(...)`** on a swap router. A router cannot pull from
///   an allowance it was not given, so this one is settled by pulling the
///   input in, approving the router for exactly that amount, swapping, and
///   resetting the approval. The output never passes through here: the router
///   sends it to the Tenant directly.
///
/// The registry decides *whether* a call is permitted and what it costs
/// against the ceiling; this contract only knows *how* to carry the permitted
/// shapes out. Spend is measured by the registry from the Tenant's actual
/// balance movement, so a swap is accounted by what it really cost rather
/// than by what its calldata claimed.
contract AllowanceExecutor is IExecutor {
    /// Only this registry may direct funds. Authority is checked there.
    address public immutable registry;

    error NotRegistry();
    error UnsupportedCall();
    error TransferFailed();
    error RecipientNotTenant();
    error NothingSwapped();

    /// `transfer(address,uint256)`
    bytes4 private constant TRANSFER = 0xa9059cbb;
    /// `exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))`
    bytes4 private constant EXACT_INPUT_SINGLE = 0x414bf389;

    constructor(address registry_) {
        registry = registry_;
    }

    /// @inheritdoc IExecutor
    function execute(address tenant, Call[] calldata calls) external payable {
        if (msg.sender != registry) revert NotRegistry();

        for (uint256 i; i < calls.length; ++i) {
            bytes calldata data = calls[i].data;
            if (data.length < 4) revert UnsupportedCall();
            bytes4 selector = bytes4(data[:4]);

            if (selector == TRANSFER) {
                _transfer(tenant, calls[i].to, data);
            } else if (selector == EXACT_INPUT_SINGLE) {
                _swap(tenant, calls[i].to, data);
            } else {
                revert UnsupportedCall();
            }
        }
    }

    /// @dev A Call names the token in `to`, and the recipient and amount in
    ///      its calldata, exactly as if the Agent were calling the token
    ///      directly. The Agent never has to know it is spending through an
    ///      approval.
    function _transfer(address tenant, address token, bytes calldata data) private {
        if (data.length != 68) revert UnsupportedCall();
        (address to, uint256 amount) = abi.decode(data[4:], (address, uint256));
        if (!IERC20(token).transferFrom(tenant, to, amount)) revert TransferFailed();
    }

    /**
     * @dev A swap, settled through the allowance.
     *
     * The Tenant approved *this contract*, not the router, so the input has
     * to come here first. It is held for the length of one call and no
     * longer: pulled in, swapped, and gone before the transaction ends.
     *
     * The check that matters is `recipient`. The registry permitted a call to
     * this router with this selector; it does not read the arguments. Without
     * this, an Agent could swap the Tenant's funds and have the router pay the
     * proceeds to the Agent instead, which is a drain dressed as a trade. The
     * output must land in the account it came from.
     *
     * What the Agent still controls is `amountOutMinimum`. It can accept a bad
     * price, and no contract can tell a bad price from a volatile one. That
     * risk is bounded by the ceiling, which is the same bound as any other
     * spending mistake it could make.
     */
    function _swap(address tenant, address router, bytes calldata data) private {
        ExactInputSingleParams memory p = abi.decode(data[4:], (ExactInputSingleParams));
        if (p.recipient != tenant) revert RecipientNotTenant();

        IERC20 tokenIn = IERC20(p.tokenIn);
        if (!tokenIn.transferFrom(tenant, address(this), p.amountIn)) revert TransferFailed();

        // Exactly what this swap needs, and reset afterwards, so a router that
        // misbehaves later cannot reach anything.
        tokenIn.approve(router, p.amountIn);
        uint256 out = ISwapRouter(router).exactInputSingle(p);
        tokenIn.approve(router, 0);

        if (out == 0) revert NothingSwapped();

        // A router that took less than it was given leaves the remainder here.
        // It belongs to the Tenant, not to this contract.
        uint256 dust = tokenIn.balanceOf(address(this));
        if (dust != 0) {
            if (!tokenIn.transfer(tenant, dust)) revert TransferFailed();
        }
    }

    /// @inheritdoc IExecutor
    function balanceOf(address tenant, address token) external view returns (uint256) {
        return IERC20(token).balanceOf(tenant);
    }
}
