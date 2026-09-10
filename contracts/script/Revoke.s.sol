// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CallRule, Grant, Period, SpendLimit} from "../src/Types.sol";

/// Grants a throwaway Agent, then revokes it — the point being what the *rest
/// of the world* sees between the two. Run it and query ENS in between.
contract Revoke is Script {
    AgentRegistry constant DEMO = AgentRegistry(0x04Bb3a9FeF214581bc56Ac3b60b5b890DffdCd0B);
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        bytes32 demoId = DEMO.self();

        Grant memory parent = _demoGrant(owner);
        Grant memory g = _grant(
            demoId,
            "throwaway",
            vm.addr(uint256(keccak256("throwaway"))),
            uint48(vm.envUint("START")),
            uint48(vm.envUint("START")) + 1 days
        );

        if (vm.envOr("REVOKE", false)) {
            vm.startBroadcast(pk);
            DEMO.revoke(DEMO.hashGrant(g));
            vm.stopBroadcast();
            console.log("revoked throwaway.demo.harness.eth");
        } else {
            vm.startBroadcast(pk);
            bytes32 id = DEMO.grant(g, parent);
            DEMO.setHost(bytes4(hex"0a0a0a0a"), bytes32(uint256(1)), bytes32(0));
            vm.stopBroadcast();
            console.log("granted throwaway.demo.harness.eth -> 10.10.10.10");
            console.logBytes32(id);
        }
    }

    /// The `demo` Grant exactly as it was issued.
    ///
    /// A Grant is stored only as a hash, so anyone who needs to prove parentage
    /// has to resupply the struct byte for byte — timestamps included. That is
    /// what makes issuance cheap, and it is why the platform keeps every Grant
    /// it signs: the chain will not hand it back.
    function _demoGrant(address owner) internal pure returns (Grant memory g) {
        g = _grant(bytes32(0), "demo", owner, 1788623448, 1791215508);
        g.spends[0].allowance = 100e6;
    }

    function _grant(bytes32 parent, string memory label, address key, uint48 start, uint48 end)
        internal
        pure
        returns (Grant memory)
    {
        CallRule[] memory rules = new CallRule[](1);
        rules[0] = CallRule({
            target: USDC,
            selector: 0xa9059cbb,
            maxValue: 0,
            checker: address(0),
            checkerCodeHash: bytes32(0)
        });
        SpendLimit[] memory limits = new SpendLimit[](1);
        limits[0] = SpendLimit({token: USDC, allowance: 10e6, unit: Period.Day, multiplier: 1});
        return Grant({
            parent: parent,
            label: label,
            agentKey: key,
            start: start,
            end: end,
            salt: 0,
            calls: rules,
            spends: limits
        });
    }
}
