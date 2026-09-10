import type { Address, Hex } from "viem";
import { USDC } from "@/lib/tenant";

/**
 * What an Agent may be allowed to do, offered as choices rather than a blank
 * field.
 *
 * A Grant's `calls` are (target, selector) pairs, which is a precise thing to
 * write and an unfriendly thing to ask someone for. So the common ones are
 * named here and the raw form stays available underneath, because the point
 * of the Grant language is that it is more general than whatever list we
 * happened to think of.
 *
 * Two layers decide whether a capability actually works, and they are not the
 * same layer. The registry checks calls against the Grant and will happily
 * permit anything listed here. `AllowanceExecutor` then has to *perform* the
 * call, and today it understands exactly one shape: `transfer(address,uint256)`
 * on an ERC-20, which it settles with `transferFrom` out of the Tenant's own
 * account. Anything else is authorised on chain and reverts on execution.
 *
 * Rather than hide that, `executable` says so per capability. Offering a swap
 * that the chain permits and the executor refuses would be a worse lie than
 * not offering it at all — and the gap is the honest state of the work: the
 * grant language is general, this executor implements payments.
 */

export type Capability = {
  id: string;
  /** What it lets the agent do, in the words someone would use. */
  name: string;
  detail: string;
  group: "payments" | "defi" | "custom";
  target: Address;
  /** The 4-byte function selector this permits. */
  selector: Hex;
  /** Whether `AllowanceExecutor` can carry it out today. */
  executable: boolean;
  /** Counts against the ceiling. Only spend-shaped calls do. */
  spends: boolean;
};

/** `transfer(address,uint256)`, the only shape the executor settles. */
export const TRANSFER: Hex = "0xa9059cbb";
/** `approve(address,uint256)`. */
export const APPROVE: Hex = "0x095ea7b3";
/** Uniswap v3 `exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))`. */
export const EXACT_INPUT_SINGLE: Hex = "0x414bf389";
/** Aave v3 `supply(address,uint256,address,uint16)`. */
export const AAVE_SUPPLY: Hex = "0x617ba037";

/** Sepolia. The tokens an Agent might plausibly be pointed at. */
export const TOKENS: { symbol: string; address: Address; decimals: number }[] = [
  { symbol: "USDC", address: USDC, decimals: 6 },
  { symbol: "WETH", address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18 },
  { symbol: "DAI", address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357", decimals: 18 },
];

const UNISWAP_ROUTER: Address = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
const AAVE_POOL: Address = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";

export const CATALOGUE: Capability[] = [
  {
    id: "usdc-transfer",
    name: "Pay in USDC",
    detail: "Send USDC to any address, up to the ceiling.",
    group: "payments",
    target: USDC,
    selector: TRANSFER,
    executable: true,
    spends: true,
  },
  {
    id: "weth-transfer",
    name: "Pay in WETH",
    detail: "Send WETH to any address, up to the ceiling.",
    group: "payments",
    target: TOKENS[1]!.address,
    selector: TRANSFER,
    executable: true,
    spends: true,
  },
  {
    id: "dai-transfer",
    name: "Pay in DAI",
    detail: "Send DAI to any address, up to the ceiling.",
    group: "payments",
    target: TOKENS[2]!.address,
    selector: TRANSFER,
    executable: true,
    spends: true,
  },
  {
    id: "usdc-approve",
    name: "Approve spenders",
    detail: "Let a named contract draw USDC. Authorised on chain; the executor cannot settle it yet.",
    group: "payments",
    target: USDC,
    selector: APPROVE,
    executable: false,
    spends: false,
  },
  {
    id: "uniswap-swap",
    name: "Swap on Uniswap v3",
    detail: "exactInputSingle on the Sepolia router. Authorised on chain; needs a swap executor.",
    group: "defi",
    target: UNISWAP_ROUTER,
    selector: EXACT_INPUT_SINGLE,
    executable: false,
    spends: false,
  },
  {
    id: "aave-supply",
    name: "Supply to Aave v3",
    detail: "supply() on the Sepolia pool. Authorised on chain; needs a lending executor.",
    group: "defi",
    target: AAVE_POOL,
    selector: AAVE_SUPPLY,
    executable: false,
    spends: false,
  },
];

/** A rule somebody wrote out by hand, because the list is never complete. */
export type CustomRule = { target: string; selector: string; note: string };

export const byId = (id: string) => CATALOGUE.find((c) => c.id === id);

/** The ids a new machine starts with: the one thing that certainly works. */
export const DEFAULT_CAPABILITIES = ["usdc-transfer"];

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR = /^0x[0-9a-fA-F]{8}$/;

export function validateCustom(r: CustomRule): string | null {
  if (!ADDRESS.test(r.target)) return "Target must be a 20-byte address.";
  if (!SELECTOR.test(r.selector)) return "Selector must be 4 bytes, like 0xa9059cbb.";
  return null;
}

/** Whether anything chosen can actually be carried out. */
export function anyExecutable(ids: string[]): boolean {
  return ids.some((id) => byId(id)?.executable);
}
