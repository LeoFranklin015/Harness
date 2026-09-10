// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AllowanceExecutor} from "../src/AllowanceExecutor.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {IExecutor} from "../src/interfaces/IExecutor.sol";

/// Onboards a Tenant: a machine, and the device that speaks for it.
///
/// The host record is set here, in the Tenant's own registry, by the Tenant's
/// own device — never in the platform registry above, which is shared with
/// every other Tenant.
contract Onboard is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        PlatformRegistry platform = PlatformRegistry(vm.envAddress("PLATFORM"));
        string memory label = vm.envString("LABEL");

        vm.startBroadcast(pk);

        AgentRegistry tenant = platform.onboardTenant(
            label, owner, owner, IExecutor(address(0)), vm.envAddress("RESOLVER")
        );
        AllowanceExecutor executor = new AllowanceExecutor(address(tenant));
        tenant.setExecutor(IExecutor(address(executor)));

        tenant.setHost(
            bytes4(vm.envBytes32("IPV4")),
            vm.envBytes32("HOST_KEY"),
            vm.envBytes32("OPERATOR")
        );

        vm.stopBroadcast();

        console.log("TENANT_REGISTRY=%s", address(tenant));
        console.log("EXECUTOR=%s", address(executor));
    }
}
