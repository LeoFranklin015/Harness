// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {LibLabel} from "@ensdomains/contracts-v2/utils/LibLabel.sol";
import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {PlatformRegistry} from "../src/PlatformRegistry.sol";
import {IAgentReadable} from "../src/interfaces/IAgentReadable.sol";
import {AgentResolver} from "../src/AgentResolver.sol";
import {AllowanceExecutor} from "../src/AllowanceExecutor.sol";
import {CallRule, Grant, Period, SpendLimit} from "../src/Types.sol";
import {IExecutor} from "../src/interfaces/IExecutor.sol";
import {ISubregistrySetter} from "../src/interfaces/IRegistry.sol";

interface IERC20 {
    function approve(address, uint256) external returns (bool);
}

interface IETHRegistrar {
    function commit(bytes32 commitment) external;
    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        IRegistry subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);
    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        IRegistry subregistry,
        address resolver,
        uint64 duration,
        address paymentToken,
        bytes32 referrer
    ) external returns (uint256);
}

/// Stands the whole thing up on the ETHOnline 2026 hackathon ENSv2 deployment,
/// which is a separate namespace from the standard Sepolia beta.
///
/// Registration is commit-reveal with a mandatory 60 second gap, so this runs in
/// two passes: `STAGE=commit`, wait, then `STAGE=register`. The addresses the
/// first pass prints are deterministic for the deployer's nonce, and the
/// commitment binds them — so the second pass must be given the same ones.
contract Hackathon is Script {
    IETHRegistrar constant REGISTRAR = IETHRegistrar(0x7d1B7f586a62Ac3F54b9A396849757814283270b);
    address constant ETH_REGISTRY = 0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    ILabelStore constant LABEL_STORE = ILabelStore(0xD7351F76866123A7E49381F38a30a96AdBa7E855);

    /// harness.eth in DNS wire format, which is how ENSIP-10 passes a name.
    bytes constant ZONE = hex"076861726e6573730365746800";
    /// The ed25519 host key of the box serving the demo Agent.
    bytes32 constant HOST_KEY =
        0x4d86674e02de300f905ceb0b712f3323a14447fa7516dbad2094dca747e1cb74;
    /// SHA-256 fingerprint of the key allowed to log in. The fingerprint, not
    /// the key: this is an access roster, and a roster on chain is permanent.
    bytes32 constant OPERATOR = 0xcd44cf1d7609fb909293929ccafa0b477b2eb86dfd3691eb12770d5881865b2f;

    uint64 constant DURATION = 365 days;

    function _secret() internal view returns (bytes32) {
        return keccak256(abi.encodePacked("harness", vm.envUint("SALT")));
    }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        string memory stage = vm.envString("STAGE");

        if (keccak256(bytes(stage)) == keccak256("commit")) {
            _commit(pk, owner);
        } else if (keccak256(bytes(stage)) == keccak256("redeploy")) {
            _redeploy(pk, owner);
        } else {
            _register(pk, owner);
        }
    }

    /// Deploy the platform, then commit to registering `harness` pointed at it.
    function _commit(uint256 pk, address owner) internal {
        vm.startBroadcast(pk);

        // The template every Tenant's tree is cloned from. Never used directly,
        // but its constructor still grants root roles, so they need a real
        // account to land on.
        AgentRegistry agentImpl = new AgentRegistry(
            LABEL_STORE, bytes32(0), owner, owner, IExecutor(address(0)), AgentRegistry(address(0))
        );

        PlatformRegistry platform =
            new PlatformRegistry(LABEL_STORE, owner, address(agentImpl));
        AgentResolver resolver =
            new AgentResolver(IAgentReadable(address(platform)), ZONE);

        // The registrar pulls the fee, so it needs an allowance first.
        IERC20(USDC).approve(address(REGISTRAR), 100e6);

        REGISTRAR.commit(
            REGISTRAR.makeCommitment(
                "harness",
                owner,
                _secret(),
                IRegistry(address(platform)),
                address(resolver),
                DURATION,
                bytes32(0)
            )
        );
        vm.stopBroadcast();

        console.log("committed. wait 60s, then run with STAGE=register");
        console.log("PLATFORM=%s", address(platform));
        console.log("RESOLVER=%s", address(resolver));
        console.log("AGENT_IMPL=%s", address(agentImpl));
    }

    /// Stand the contracts up again under a `harness.eth` we already own.
    ///
    /// Registration is a one-time purchase; the tree beneath it is not. Because
    /// we hold `ROLE_SET_SUBREGISTRY` on the name, a new PlatformRegistry can be
    /// pointed at without buying anything again.
    function _redeploy(uint256 pk, address owner) internal {
        vm.startBroadcast(pk);

        AgentRegistry agentImpl = new AgentRegistry(
            LABEL_STORE, bytes32(0), owner, owner, IExecutor(address(0)), AgentRegistry(address(0))
        );
        PlatformRegistry platform = new PlatformRegistry(LABEL_STORE, owner, address(agentImpl));
        AgentResolver resolver = new AgentResolver(IAgentReadable(address(platform)), ZONE);

        ISubregistrySetter(address(ETH_REGISTRY)).setSubregistry(
            LibLabel.id("harness"), IRegistry(address(platform))
        );

        AgentRegistry demo =
            platform.onboardTenant("demo", owner, owner, IExecutor(address(0)), address(resolver));
        AllowanceExecutor executor = new AllowanceExecutor(address(demo));
        demo.setExecutor(IExecutor(address(executor)));
        demo.setHost(bytes4(hex"8d94d14d"), HOST_KEY, OPERATOR);

        vm.stopBroadcast();

        console.log("PLATFORM=%s", address(platform));
        console.log("RESOLVER=%s", address(resolver));
        console.log("DEMO=%s", address(demo));
        console.log("EXECUTOR=%s", address(executor));
    }

    /// Reveal the commitment, then onboard a Tenant and give it one Agent.
    function _register(uint256 pk, address owner) internal {
        PlatformRegistry platform = PlatformRegistry(vm.envAddress("PLATFORM"));
        AgentResolver resolver = AgentResolver(vm.envAddress("RESOLVER"));
        address agentKey = vm.addr(uint256(keccak256("research-agent-key")));

        vm.startBroadcast(pk);

        uint256 tokenId = REGISTRAR.register(
            "harness",
            owner,
            _secret(),
            IRegistry(address(platform)),
            address(resolver),
            DURATION,
            USDC,
            bytes32(0)
        );

        // demo.harness.eth — the Tenant: a machine and the device that speaks
        // for it. Its host record is published once, here.
        AgentRegistry demo =
            platform.onboardTenant("demo", owner, owner, IExecutor(address(0)), address(resolver));

        // One executor per Tenant, bound to that Tenant's registry. A shared one
        // would let any Tenant's tree direct any other Tenant's funds, which is
        // exactly the isolation the per-Tenant device is there to give.
        AllowanceExecutor executor = new AllowanceExecutor(address(demo));
        demo.setExecutor(IExecutor(address(executor)));

        demo.setHost(bytes4(hex"8d94d14d"), HOST_KEY, OPERATOR); // 141.148.209.77

        // research.demo.harness.eth — an Agent inside the Tenant's tree. The
        // device's own Grant is the ceiling; nothing above it grants anything.
        Grant memory none;
        bytes32 researchId = demo.grant(_grant(bytes32(0), "research", agentKey, 10e6), none);

        vm.stopBroadcast();

        console.log("harness.eth tokenId:", tokenId);
        console.log("demo registry:      ", address(demo));
        console.log("demo executor:      ", address(executor));
        console.log("research agent key: ", agentKey);
        console.logBytes32(researchId);
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
