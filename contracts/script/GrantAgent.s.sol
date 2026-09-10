// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CallRule, Grant, Period, SpendLimit} from "../src/Types.sol";

/// Issues one Agent and writes the Grant out as JSON.
///
/// Writing it out is not a convenience. A Grant lives on-chain only as a hash,
/// so anything that later wants to spend under it — the Agent, a relayer, a
/// dashboard — has to resupply the struct byte for byte. The chain will not
/// hand it back. Whoever issues a Grant is the only party who can record it,
/// so issuing and recording belong in the same step.
contract GrantAgent is Script {
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        AgentRegistry registry = AgentRegistry(vm.envAddress("REGISTRY"));
        string memory label = vm.envString("LABEL");
        uint160 cap = uint160(vm.envUint("CAP"));
        address agentKey = vm.addr(uint256(keccak256(bytes(vm.envString("AGENT_SEED")))));

        uint48 start = uint48(block.timestamp - 60);
        uint48 end = uint48(block.timestamp) + 30 days;

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

        Grant memory g = Grant({
            parent: bytes32(0),
            label: label,
            agentKey: agentKey,
            start: start,
            end: end,
            salt: 0,
            calls: rules,
            spends: limits
        });

        vm.startBroadcast(pk);
        Grant memory none;
        bytes32 agentId = registry.grant(g, none);
        vm.stopBroadcast();

        string memory json = string.concat(
            '{"label":"', label,
            '","agentKey":"', vm.toString(agentKey),
            '","start":', vm.toString(start),
            ',"end":', vm.toString(end),
            ',"cap":"', vm.toString(uint256(cap)),
            '","registry":"', vm.toString(address(registry)),
            '","agentId":"', vm.toString(agentId), '"}'
        );
        vm.writeFile(string.concat("../x402/grants/", label, ".json"), json);
        console.log(json);
    }
}
