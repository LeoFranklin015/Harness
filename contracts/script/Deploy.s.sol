// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IAgentReadable} from "../src/interfaces/IAgentReadable.sol";
import {AgentResolver} from "../src/AgentResolver.sol";
import {AllowanceExecutor} from "../src/AllowanceExecutor.sol";
import {CallRule, Grant, Period, SpendLimit} from "../src/Types.sol";
import {IExecutor} from "../src/interfaces/IExecutor.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";
import {ISubregistrySetter} from "../src/interfaces/IRegistry.sol";

/// Stands up the whole live tree: the root of a Tenant's authority, the
/// resolver that answers for it, `harness.eth` pointed at both, and one
/// reachable Agent two levels down for the nameserver to serve.
///
/// One script rather than three, because the pieces only mean anything
/// together — a registry with no resolver answers nobody, and a resolver
/// against a stale registry reverts.
///
/// Run with `--slow`: the deployer carries an EIP-7702 delegation, and public
/// RPCs reject more than one pending transaction from a delegated account.
contract Deploy is Script {
    // Read from RootRegistry.getSubregistry("eth"); see docs/verified.md.
    address constant ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;
    // keccak256("harness")
    uint256 constant HARNESS_TOKEN_ID =
        34242220326914401326081474619275755897613800915715962179300266456126544936960;
    // harness.eth in DNS wire format, which is how ENSIP-10 passes a name.
    bytes constant ZONE = hex"076861726e6573730365746800";

    /// The ed25519 host key of the box serving the demo Agent.
    bytes32 constant HOST_KEY =
        0x4d86674e02de300f905ceb0b712f3323a14447fa7516dbad2094dca747e1cb74;
    /// SHA-256 fingerprint of the key allowed to log in. The fingerprint, not
    /// the key: this is an access roster, and a roster on chain is permanent.
    bytes32 constant OPERATOR = 0xcd44cf1d7609fb909293929ccafa0b477b2eb86dfd3691eb12770d5881865b2f;

    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    /// The shared label database every ENSv2 registry writes labels into.
    ILabelStore constant LABEL_STORE = ILabelStore(0xD7351F76866123A7E49381F38a30a96AdBa7E855);

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        address agentKey = vm.addr(uint256(keccak256("research-agent-key")));
        console.log("deployer / harness.eth owner:", owner);

        vm.startBroadcast(pk);

        // The root registry issues the Tenants. Its own Agent id is zero: it has
        // no parent, and only the device may grant beneath it.
        AgentRegistry root = new AgentRegistry(
            LABEL_STORE,
            bytes32(0),
            owner, // Tenant whose funds back the tree, for now the deployer
            owner, // the device that signs Grants; swapped for the Ledger later
            IExecutor(address(0)),
            AgentRegistry(address(0))
        );

        AllowanceExecutor executor = new AllowanceExecutor(address(root));
        root.setExecutor(IExecutor(address(executor)));

        // Set before any child registry is attached: a child copies the
        // resolver at the moment it is attached, not on every lookup.
        AgentResolver resolver = new AgentResolver(IAgentReadable(address(root)), ZONE);
        root.setChildResolver(address(resolver));

        // Point harness.eth at the tree. From here every name beneath it
        // resolves through our authority checks, for any ENS client.
        ISubregistrySetter(ETH_REGISTRY).setSubregistry(HARNESS_TOKEN_ID, IRegistry(address(root)));

        // A Tenant, and one Agent beneath it that is actually reachable.
        Grant memory none;
        bytes32 demoId = root.grant(_grant(bytes32(0), "demo", owner, 100e6), none);
        AgentRegistry demoReg = root.attachChildRegistry(demoId, "demo");
        bytes32 researchId =
            demoReg.grant(_grant(demoId, "research", agentKey, 10e6), _grant(bytes32(0), "demo", owner, 100e6));
        demoReg.setHost(bytes4(hex"8d94d14d"), HOST_KEY, OPERATOR); // 141.148.209.77

        vm.stopBroadcast();

        console.log("AgentRegistry (root):", address(root));
        console.log("AllowanceExecutor:   ", address(executor));
        console.log("AgentResolver:       ", address(resolver));
        console.log("demo registry:       ", address(demoReg));
        console.log("research agent key:  ", agentKey);
    }

    function _grant(bytes32 parent, string memory label, address key, uint160 cap)
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
            end: uint48(block.timestamp) + 30 days,
            salt: 0,
            calls: rules,
            spends: limits
        });
    }
}
