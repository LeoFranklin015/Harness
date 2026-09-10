// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CallRule, Constants, Grant, Period, Reason, SpendLimit} from "../src/Types.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";

/// Builds a real tree under harness.eth and then kills it, checking after each
/// step that ENS traversal agrees with the authority state.
///
/// This is the demo's spine, run against the live chain rather than a mock.
contract Tree is Script {
    AgentRegistry constant ROOT = AgentRegistry(0x99cd6656C8e07253771486f1B437705b55390bCe);
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant SELLER = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function _grant(bytes32 parent, string memory label, address key, uint160 cap, uint48 endsIn)
        internal
        view
        returns (Grant memory)
    {
        CallRule[] memory rules = new CallRule[](1);
        rules[0] = CallRule({
            target: USDC,
            selector: 0xa9059cbb, // transfer(address,uint256)
            maxValue: 0,
            checker: address(0),
            checkerCodeHash: bytes32(0)
        });
        SpendLimit[] memory limits = new SpendLimit[](1);
        limits[0] = SpendLimit({token: USDC, allowance: cap, unit: Period.Day, multiplier: 1});

        return Grant({
            parent: parent,
            label: label,
            agentKey: key,
            start: uint48(block.timestamp - 60),
            end: uint48(block.timestamp) + endsIn,
            salt: 0,
            calls: rules,
            spends: limits
        });
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        address agentKey = vm.addr(uint256(keccak256("research-agent-key")));

        vm.startBroadcast(pk);

        // 1. acme.harness.eth — the Tenant, $100/day
        Grant memory acme = _grant(bytes32(0), "acme", me, 100e6, 30 days);
        Grant memory none;
        bytes32 acmeId = ROOT.grant(acme, none);
        console.log("acme.harness.eth granted");
        console.logBytes32(acmeId);

        // 2. give it a registry so it can hold agents of its own
        AgentRegistry acmeReg = ROOT.attachChildRegistry(acmeId, "acme");
        console.log("acme registry:", address(acmeReg));

        // 3. research.acme.harness.eth — narrower: $10/day, expires sooner
        Grant memory research = _grant(acmeId, "research", agentKey, 10e6, 7 days);
        bytes32 researchId = acmeReg.grant(research, acme);
        console.log("research.acme.harness.eth granted");
        console.logBytes32(researchId);

        vm.stopBroadcast();

        // --- what ENS sees, before ---
        console.log("--- live ---");
        console.log("ROOT.getSubregistry('acme'):", address(ROOT.getSubregistry("acme")));
        (, Reason r1) = acmeReg.check(researchId);
        console.log("research authority reason (0 = Ok):", uint8(r1));

        // --- revoke the Tenant, and watch the branch go ---
        vm.startBroadcast(pk);
        ROOT.revoke(acmeId);
        vm.stopBroadcast();

        console.log("--- after revoking acme ---");
        console.log("ROOT.getSubregistry('acme'):", address(ROOT.getSubregistry("acme")));
        (, Reason r2) = acmeReg.check(researchId);
        console.log("research authority reason (4 = AncestorGone):", uint8(r2));
    }
}
