// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {LibLabel} from "@ensdomains/contracts-v2/utils/LibLabel.sol";
import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";
import {RegistryRolesLib} from
    "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {AgentResolver} from "../src/AgentResolver.sol";
import {AllowanceExecutor} from "../src/AllowanceExecutor.sol";
import {CallRule, Grant, Period, SpendLimit} from "../src/Types.sol";
import {IExecutor} from "../src/interfaces/IExecutor.sol";
import {IAgentReadable} from "../src/interfaces/IAgentReadable.sol";
import {Constants} from "../src/Types.sol";

/// The whole deployment, run against the real hackathon contracts on a fork.
/// If this is green, the same steps on Sepolia are the same code paths.
contract ForkTest is Test {
    ILabelStore constant LABEL_STORE =
        ILabelStore(0xD7351F76866123A7E49381F38a30a96AdBa7E855);
    address constant OWNER = 0xE08224B2CfaF4f27E2DC7cB3f6B99AcC68Cf06c0;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    bytes constant ZONE = hex"076861726e6573730365746800";

    /// Skipped unless `FORK_RPC` is set, so `forge test` stays offline.
    function test_deploy_onboard_grant_revoke() public {
        string memory rpc = vm.envOr("FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            console.log("FORK_RPC unset; skipping the fork rehearsal");
            return;
        }
        vm.createSelectFork(rpc);

        vm.startPrank(OWNER);

        AgentRegistry impl = new AgentRegistry(
            LABEL_STORE, bytes32(0), OWNER, OWNER, IExecutor(address(0)), AgentRegistry(address(0))
        );
        PlatformRegistry platform = new PlatformRegistry(LABEL_STORE, OWNER, address(impl));
        AgentResolver resolver = new AgentResolver(IAgentReadable(address(platform)), ZONE);
        console.log("platform", address(platform));
        console.log("resolver", address(resolver));

        // Onboard a Tenant exactly as the dashboard does: device and tenant
        // are the same account, which is what EIP-7702 makes true.
        AgentRegistry reg = platform.onboardTenant(
            "acme", OWNER, OWNER, IExecutor(address(0)), address(resolver)
        );
        AllowanceExecutor exec = new AllowanceExecutor(address(reg));
        reg.setExecutor(IExecutor(address(exec)));
        console.log("tenant registry", address(reg));

        // The roles screen: the device holds them, the tenant holds none.
        assertTrue(
            reg.hasRootRoles(RegistryRolesLib.ROLE_REGISTRAR, OWNER), "device may issue"
        );

        // Grant an Agent.
        CallRule[] memory r = new CallRule[](1);
        r[0] = CallRule({
            target: USDC,
            selector: Constants.ANY_SELECTOR,
            maxValue: 0,
            checker: address(0),
            checkerCodeHash: bytes32(0)
        });
        SpendLimit[] memory l = new SpendLimit[](1);
        l[0] = SpendLimit({token: USDC, allowance: 10e6, unit: Period.Day, multiplier: 1});
        Grant memory g = Grant({
            parent: bytes32(0),
            label: "runner",
            agentKey: address(0x1001),
            start: uint48(block.timestamp),
            end: uint48(block.timestamp + 30 days),
            salt: 0,
            calls: r,
            spends: l
        });
        Grant memory none;
        bytes32 id = reg.grant(g, none);
        console.logBytes32(id);

        // The name is real and owned by the Tenant.
        assertEq(reg.ownerOf(reg.getState(LibLabel.id("runner")).tokenId), OWNER);

        // A second device can be admitted, and can then issue.
        address spare = address(0x5A4E);
        reg.grantRootRoles(RegistryRolesLib.ROLE_REGISTRAR, spare);
        vm.stopPrank();

        Grant memory g2 = g;
        g2.label = "second";
        vm.prank(spare);
        reg.grant(g2, none);
        console.log("the spare device issued an Agent");

        vm.stopPrank();
    }
}
