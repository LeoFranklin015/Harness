// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IStandardRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IStandardRegistry.sol";

import {AgentResolver} from "../src/AgentResolver.sol";
import {IAgentReadable} from "../src/interfaces/IAgentReadable.sol";

/// Deploys a fresh `AgentResolver` over the existing registries and points
/// `harness.eth` at it.
///
/// The resolver holds no state — every answer is computed from the registries
/// it walks — so replacing it is safe in a way replacing a registry would not
/// be. Nothing is migrated because there is nothing stored to migrate.
contract RepointResolver is Script {
    /// `\x07harness\x03eth\x00`
    bytes constant ZONE = hex"076861726e6573730365746800";

    /// ENSv2's `.eth` registry, which holds the `harness` name.
    IStandardRegistry constant ETH_REGISTRY =
        IStandardRegistry(0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e);

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address platform = vm.envAddress("PLATFORM_REGISTRY");

        vm.startBroadcast(pk);

        AgentResolver resolver = new AgentResolver(IAgentReadable(platform), ZONE);

        // The label id, which is what the registry keys a name on. The lower
        // 32 bits carry a version the registry itself resolves, so the bare
        // labelhash is the right thing to pass.
        uint256 labelId = uint256(keccak256(bytes("harness")));
        ETH_REGISTRY.setResolver(labelId, address(resolver));

        vm.stopBroadcast();

        console.log("AGENT_RESOLVER=%s", address(resolver));
    }
}
