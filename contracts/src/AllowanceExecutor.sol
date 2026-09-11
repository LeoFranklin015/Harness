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

/// @title AllowanceExecutor
/// @notice Carries out whatever the registry has already permitted, out of the
///         Tenant's own account, under an approval they granted once at
///         onboarding.
///
/// No custody between transactions: funds live in the Tenant's account and
/// this contract can only move what the approval permits, when the registry
/// says so. That constraint is not a choice. The Tenant's account is an EOA
/// delegated via EIP-7702 and the device's delegate allowlist has exactly one
/// entry, so no executor module can be installed on it. An allowance is the
/// one lever available.
///
/// **Calls are opaque.** The Grant already names a contract and a function,
/// and the registry has already decided this Agent may call it. Teaching this
/// contract about Uniswap, then Aave, then whatever is next, would mean every
/// new protocol is a redeploy — and would quietly make the Grant language a
/// lie, since a Grant could permit what the executor could not perform. So
/// only two selectors are understood, and they are understood because the
/// allowance mechanism itself requires it:
///
/// - **`transfer(address,uint256)`** on a token is rewritten as
///   `transferFrom`, straight from the Tenant to the recipient. Nothing is
///   held, because nothing needs to be.
///
/// - **`approve(address,uint256)`** cannot be forwarded, because an approval
///   is made by the holder and the holder is the Tenant. So the batch's
///   approvals are read first, the tokens they cover are pulled in, and the
///   approval is made by this contract instead. It is zeroed before the
///   transaction ends.
///
/// Everything else is executed verbatim. A swap is the two calls anyone would
/// write — `approve(router, n)` then `exactInputSingle(...)` — and this
/// contract has no idea which is which.
///
/// **What bounds the damage.** Not an inspection of arguments, which cannot
/// generalise. The registry snapshots the Tenant's balance of every token the
/// Grant tracks, runs the batch, and charges the difference against the
/// ceiling — reverting the whole batch if it does not fit. An Agent that
/// directs a swap's output to itself has spent the input, and that spend is
/// counted and capped exactly as if it had simply sent itself the money. The
/// ceiling is the answer to every variation of the question.
///
/// Output should be directed at the Tenant, as any sane call would. Anything
/// a call pays to this contract in a token the batch never approved stays
/// here, so a Grant whose calls return a second token should list that token
/// among its spend limits and have the call name the Tenant as recipient.
contract AllowanceExecutor is IExecutor {
    /// Only this registry may direct funds. Authority is checked there.
    address public immutable registry;

    error NotRegistry();
    error UnsupportedCall();
    error TransferFailed();
    error CallFailed();

    /// `transfer(address,uint256)`
    bytes4 private constant TRANSFER = 0xa9059cbb;
    /// `approve(address,uint256)`
    bytes4 private constant APPROVE = 0x095ea7b3;
    /// Both are `(address,uint256)`, so both are 4 + 32 + 32.
    uint256 private constant ERC20_ARGS = 68;

    constructor(address registry_) {
        registry = registry_;
    }

    /// @inheritdoc IExecutor
    function execute(address tenant, Call[] calldata calls) external payable {
        if (msg.sender != registry) revert NotRegistry();

        uint256 n = calls.length;
        // What this batch approves, so it can be taken back afterwards. At
        // most one per call, which is the only bound that is always true.
        address[] memory tokens = new address[](n);
        address[] memory spenders = new address[](n);
        uint256 approvals;

        // Pass one: bring in what the batch's approvals will hand out. An
        // approval this contract makes is worthless unless it is holding the
        // tokens, and it has to hold them before the call that spends them.
        for (uint256 i; i < n; ++i) {
            bytes calldata data = calls[i].data;
            if (data.length != ERC20_ARGS || bytes4(data[:4]) != APPROVE) continue;

            (address spender, uint256 amount) = abi.decode(data[4:], (address, uint256));
            address token = calls[i].to;
            tokens[approvals] = token;
            spenders[approvals] = spender;
            ++approvals;

            // An infinite approval is the ordinary way to write this, and
            // pulling infinity would only revert. Take what there is; the
            // ceiling is what decides whether that was too much.
            uint256 held = IERC20(token).balanceOf(tenant);
            if (amount > held) amount = held;
            if (amount != 0 && !IERC20(token).transferFrom(tenant, address(this), amount)) {
                revert TransferFailed();
            }
        }

        // Pass two: do the work.
        for (uint256 i; i < n; ++i) {
            address to = calls[i].to;
            bytes calldata data = calls[i].data;

            if (data.length == ERC20_ARGS) {
                bytes4 selector = bytes4(data[:4]);

                if (selector == TRANSFER) {
                    (address dst, uint256 amount) = abi.decode(data[4:], (address, uint256));
                    if (!IERC20(to).transferFrom(tenant, dst, amount)) revert TransferFailed();
                    continue;
                }
                if (selector == APPROVE) {
                    (address spender, uint256 amount) = abi.decode(data[4:], (address, uint256));
                    IERC20(to).approve(spender, amount);
                    continue;
                }
            }

            (bool ok, bytes memory returned) = to.call{value: calls[i].value}(data);
            if (!ok) _bubble(returned);
        }

        // Pass three: leave nothing behind. An approval that outlives the
        // transaction is a standing invitation, and a token left here is the
        // Tenant's money in a contract with no way to ask for it.
        for (uint256 i; i < approvals; ++i) {
            IERC20 token = IERC20(tokens[i]);
            token.approve(spenders[i], 0);

            uint256 left = token.balanceOf(address(this));
            if (left != 0 && !token.transfer(tenant, left)) revert TransferFailed();
        }

        uint256 change = address(this).balance;
        if (change != 0) {
            (bool sent,) = tenant.call{value: change}("");
            if (!sent) revert TransferFailed();
        }
    }

    /// @dev Rethrows a failed call's own revert, so a protocol's reason
    ///      reaches the Agent instead of being flattened into ours.
    function _bubble(bytes memory returned) private pure {
        if (returned.length == 0) revert CallFailed();
        assembly {
            revert(add(returned, 0x20), mload(returned))
        }
    }

    /// @inheritdoc IExecutor
    function balanceOf(address tenant, address token) external view returns (uint256) {
        return IERC20(token).balanceOf(tenant);
    }

    /// @dev Native change from a call that took less than it was sent.
    receive() external payable {}
}
