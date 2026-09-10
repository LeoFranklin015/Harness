import { formatUnits } from "viem";
import { REGISTRY, RESEARCH_GRANT, ROOT_OF_TREE } from "./grant.ts";
import { headroom } from "./headroom.ts";
const h = await headroom(REGISTRY, ROOT_OF_TREE, RESEARCH_GRANT);
console.log(
  `cap ${formatUnits(h.cap, 6)}  spent ${formatUnits(h.spent, 6)}  left ${formatUnits(h.left, 6)}  window ends ${h.windowEnds?.toISOString() ?? "(fresh)"}`,
);
