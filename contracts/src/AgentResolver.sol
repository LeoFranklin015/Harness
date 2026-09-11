// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";

import {IAgentReadable} from "./interfaces/IAgentReadable.sol";

/// @title AgentResolver
/// @notice Answers ENS lookups for every Agent in the tree by computing them,
///         rather than by storing records.
///
/// One resolver serves the whole subtree through ENSIP-10 wildcard resolution,
/// so there is nothing to deploy or configure per Agent. It holds no records: it
/// walks the registries, runs the same authority check the spend path runs, and
/// answers only if that check passes.
///
/// A revoked Agent therefore stops resolving for every ENS client, not only for
/// our own nameserver — because the answer is a computation whose result became
/// "no", not a record somebody has to remember to delete.
contract AgentResolver {
    /// The registry that the zone apex points at — the `PlatformRegistry`,
    /// which issues Tenants. Every level below it answers the same questions,
    /// so the walk never has to know how far down it has got.
    IAgentReadable public immutable root;

    /// The zone this resolver speaks for, in DNS wire format — for
    /// `harness.eth` that is `\x07harness\x03eth\x00`.
    ///
    /// Pinned, and checked on every query. Nothing stops a stranger pointing
    /// their own ENS name at this contract; without this check `agent.attacker.eth`
    /// would answer with a real Agent's address, and the name would read as
    /// that Agent's to every wallet that resolved it.
    bytes public zone;

    /// How many labels of a queried name belong to the zone rather than to the
    /// path through the tree.
    uint256 public immutable zoneLabels;

    constructor(IAgentReadable root_, bytes memory zone_) {
        root = root_;
        zone = zone_;
        zoneLabels = _countLabels(zone_);
    }

    /// @notice ERC-165, so a client knows to call `resolve` rather than `addr`.
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x9061b923 // IExtendedResolver — ENSIP-10 wildcard
            || id == 0x01ffc9a7; // ERC-165
    }

    /// @notice Resolves `data` for `name`, per ENSIP-10.
    /// @param name the queried name, in DNS wire format
    /// @param data the ABI-encoded call the client originally wanted to make
    ///
    /// @dev Answers empty for an Agent that may not act. ENSIP-10 clients read
    ///      an empty result as "no record", which is the honest answer: the
    ///      Agent has no published address because it has no authority.
    ///      Reverting would instead surface as a resolution *failure*, which
    ///      clients retry as though the network were at fault.
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory)
    {
        if (data.length < 4) return "";

        (IAgentReadable registry, string memory label, Host memory host) = _walk(name);
        if (address(registry) == address(0)) return "";

        bytes4 selector = bytes4(data[:4]);

        // addr(bytes32) — the Agent Key. What a wallet asks for.
        if (selector == 0x3b3b57de) {
            return abi.encode(registry.agentKeyOf(label));
        }

        // addr(bytes32,uint256) — the multicoin form, ENSIP-9.
        if (selector == 0xf1cb7e06) {
            (, uint256 coinType) = abi.decode(data[4:], (bytes32, uint256));
            if (coinType != 60) return abi.encode(bytes(""));
            address key = registry.agentKeyOf(label);
            return abi.encode(key == address(0) ? bytes("") : abi.encodePacked(key));
        }

        // text(bytes32,string) — ENSIP-5.
        if (selector == 0x59d1d43c) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            // ENSIP-25 keys carry the registry and the id inside the key
            // itself, neither of which `_text` is given.
            if (_looksLikeRegistration(key)) {
                return abi.encode(_registration(registry, label, key));
            }
            return abi.encode(_text(host, key, _join(name)));
        }

        // data(bytes32,string) — ENSIP-24 arbitrary bytes. Carries the raw
        // endpoint, so a client can have the four bytes rather than a string it
        // has to parse back.
        if (selector == 0xecbfada3) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            bytes32 k = keccak256(bytes(key));
            if (k == keccak256("endpoint")) {
                return abi.encode(
                    host.ipv4 == bytes4(0) ? bytes("") : abi.encodePacked(host.ipv4)
                );
            }
            if (k == keccak256("ssh-hostkey")) {
                return abi.encode(
                    host.key == bytes32(0) ? bytes("") : abi.encodePacked(host.key)
                );
            }
            return abi.encode(bytes(""));
        }

        return "";
    }

    /// @dev Where the Agent runs and what it is, as text, so an ENS client shows
    ///      something useful while knowing nothing about this system.
    function _text(Host memory host, string memory key, string memory name)
        internal
        pure
        returns (string memory)
    {
        bytes32 k = keccak256(bytes(key));

        // ENSIP-26 — agent records. The entry point a client reads first to
        // learn what this name is and how to reach it.
        if (k == keccak256("agent-context")) {
            if (host.ipv4 == bytes4(0)) return "";
            return string.concat(
                "# ",
                name,
                "\n\nAn autonomous agent running on its own machine, inside a spending "
                "ceiling set on a hardware wallet. It holds a capability, not a key: it may "
                "call only what its Grant permits, up to that ceiling, and the whole of it "
                "ends on one transaction.\n\nReach it over SSH - see agent-endpoint[ssh]. "
                "The fingerprint admitted at the door is published as ssh-operator, and the "
                "host key as ssh-hostkey, so a visitor can verify both ends before "
                "connecting.\n"
            );
        }

        // ENSIP-26 — `agent-endpoint[<protocol>]`. The spec names mcp, a2a and
        // web, and allows more as the ecosystem grows. A shell is how you reach
        // this kind of agent, so ssh is the protocol that matters here.
        if (k == keccak256("agent-endpoint[ssh]")) {
            return host.ipv4 == bytes4(0) ? "" : string.concat("ssh://runner@", name);
        }

        if (k == keccak256("url")) {
            return host.ipv4 == bytes4(0) ? "" : string.concat("ssh://", _ipv4(host.ipv4));
        }
        // The known_hosts line, ready to paste or pipe. Published as text so any
        // ENS client shows it: the key a host is recognised by should be as
        // public and as checkable as the address it lives at.
        if (k == keccak256("ssh-hostkey")) {
            return host.key == bytes32(0) ? "" : string.concat("ssh-ed25519 ", _sshEd25519(host.key));
        }
        // Who may log in, as the exact string `ssh-keygen -l` prints and sshd
        // hands to AuthorizedKeysCommand as `%f`. Matching formats keeps the
        // check a string comparison rather than a re-encoding.
        if (k == keccak256("ssh-operator")) {
            return host.operator == bytes32(0)
                ? ""
                : string.concat("SHA256:", _base64NoPad(host.operator));
        }
        if (k == keccak256("description")) {
            return "An agent acting within a hardware-rooted spending limit.";
        }
        return "";
    }

    // --- ENSIP-25 -----------------------------------------------------------

    /*
     * `agent-registration[<registry>][<agentId>]`, answered for this Agent's
     * own registry and id and nothing else.
     *
     * Worth being straight about what this is worth here. ENSIP-25 exists to
     * bridge two systems: a registry that *claims* a name, and the name
     * confirming the claim from the other side. In this design the
     * registration and the name are the same write — `grant` mints the name —
     * so the record cannot be false and cannot be missing while the name
     * resolves. It carries no information a client did not already have.
     *
     * It is implemented because it costs little and because the moment an
     * Agent here is also listed in an external registry — ERC-8004 — the
     * handshake has two real sides and the record starts doing work.
     *
     * The key is rebuilt from scratch and compared whole, rather than parsed.
     * A comparison cannot accept a key it was not built for; a parser can.
     */
    function _looksLikeRegistration(string memory key) internal pure returns (bool) {
        bytes memory k = bytes(key);
        bytes memory prefix = "agent-registration[";
        if (k.length <= prefix.length) return false;
        for (uint256 i; i < prefix.length; i++) {
            if (k[i] != prefix[i]) return false;
        }
        return true;
    }

    function _registration(IAgentReadable registry, string memory label, string memory key)
        internal
        view
        returns (string memory)
    {
        bytes32 id = registry.agentIdOf(label);
        if (id == bytes32(0)) return "";

        string memory expected = string.concat(
            "agent-registration[",
            _erc7930(address(registry)),
            "][",
            _hex(abi.encodePacked(id)),
            "]"
        );
        // A non-empty value is the whole signal; ENSIP-25 recommends "1".
        return keccak256(bytes(key)) == keccak256(bytes(expected)) ? "1" : "";
    }

    /// @dev ERC-7930 interoperable address: version, eip155 chain type, the
    ///      chain id in as few bytes as it needs, then the 20-byte address.
    function _erc7930(address a) internal view returns (string memory) {
        bytes memory ref = _trim(block.chainid);
        return _hex(
            abi.encodePacked(
                bytes2(0x0001), bytes2(0x0000), uint8(ref.length), ref, uint8(20), a
            )
        );
    }

    /// @dev A chain id with its leading zero bytes removed.
    function _trim(uint256 v) internal pure returns (bytes memory out) {
        uint256 len;
        for (uint256 t = v; t != 0; t >>= 8) len++;
        if (len == 0) len = 1;
        out = new bytes(len);
        for (uint256 i; i < len; i++) {
            out[len - 1 - i] = bytes1(uint8(v >> (8 * i)));
        }
    }

    /// @dev `0x` and lower-case hex, which is the form ENSIP-25 keys use.
    function _hex(bytes memory raw) internal pure returns (string memory) {
        bytes memory digits = "0123456789abcdef";
        bytes memory out = new bytes(2 + raw.length * 2);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i; i < raw.length; i++) {
            out[2 + i * 2] = digits[uint8(raw[i]) >> 4];
            out[3 + i * 2] = digits[uint8(raw[i]) & 0x0f];
        }
        return string(out);
    }

    // --- walking the name ---------------------------------------------------

    /// Where a name's host is, and how to recognise it. Carried down the walk
    /// because it belongs to the machine, not to each Agent on it.
    struct Host {
        bytes4 ipv4;
        bytes32 key;
        bytes32 operator;
    }

    /// @dev Descends to the registry holding the queried name, collecting the
    ///      host record on the way. Returns a zero registry if the name is
    ///      outside the zone or if any link has lost authority — the registries
    ///      do that checking, and a dead link returns zero, which stops the walk.
    ///
    ///      The last label is followed too, if it has a registry of its own.
    ///      That is how `leo.harness.eth` answers with leo's own address while
    ///      `agent.leo.harness.eth` answers with the same one: the address was
    ///      published once, by the machine it belongs to.
    function _walk(bytes calldata name)
        internal
        view
        returns (IAgentReadable registry, string memory label, Host memory host)
    {
        if (!_inZone(name)) return (IAgentReadable(address(0)), "", host);

        string[] memory labels = _labels(name);
        if (labels.length <= zoneLabels) return (IAgentReadable(address(0)), "", host);

        // Labels arrive outermost-first and the tree runs the other way, so
        // descend them in reverse, starting just inside the zone.
        registry = root;
        for (uint256 i = labels.length - zoneLabels; i > 1; --i) {
            registry = IAgentReadable(
                address(IRegistry(address(registry)).getSubregistry(labels[i - 1]))
            );
            if (address(registry) == address(0)) return (IAgentReadable(address(0)), "", host);
            _inherit(host, registry);
        }
        label = labels[0];

        // The queried name may itself have a registry — a Tenant always does,
        // an Agent does once it has children of its own. If so, its host record
        // is more specific than anything inherited so far.
        IRegistry leaf = IRegistry(address(registry)).getSubregistry(label);
        bool live = address(leaf) != address(0);
        if (live) _inherit(host, IAgentReadable(address(leaf)));

        // A leaf with no registry is a plain Agent: it is live if it still has a
        // key to act with, which is the same authority check the spend path runs.
        if (!live && registry.agentKeyOf(label) == address(0)) {
            return (IAgentReadable(address(0)), "", host);
        }
    }

    /// @dev A record set closer to the name wins; one never set leaves the
    ///      inherited value standing.
    function _inherit(Host memory host, IAgentReadable registry) internal view {
        bytes4 ip = registry.selfEndpoint();
        if (ip != bytes4(0)) {
            host.ipv4 = ip;
            host.key = registry.selfHostKey();
            host.operator = registry.selfOperator();
        }
    }

    function _inZone(bytes calldata name) internal view returns (bool) {
        bytes memory z = zone;
        if (name.length < z.length) return false;
        return keccak256(name[name.length - z.length:]) == keccak256(z);
    }

    /// @dev Splits a DNS wire-format name into its labels, outermost first.
    /// @dev The queried name as text, for records that have to say what they
    ///      are — ENSIP-26's `agent-context` reads poorly without it.
    function _join(bytes calldata name) internal pure returns (string memory out) {
        uint256 i;
        while (i < name.length && name[i] != 0) {
            uint256 len = uint8(name[i]);
            out = bytes(out).length == 0
                ? string(name[i + 1:i + 1 + len])
                : string.concat(out, ".", string(name[i + 1:i + 1 + len]));
            i += len + 1;
        }
    }

    function _labels(bytes calldata name) internal pure returns (string[] memory out) {
        out = new string[](_countLabels(name));
        uint256 n;
        uint256 i;
        while (i < name.length && name[i] != 0) {
            uint256 len = uint8(name[i]);
            out[n++] = string(name[i + 1:i + 1 + len]);
            i += len + 1;
        }
    }

    function _countLabels(bytes memory name) internal pure returns (uint256 n) {
        uint256 i;
        while (i < name.length && name[i] != 0) {
            i += uint8(name[i]) + 1;
            ++n;
        }
    }

    /// @dev The base64 half of a `known_hosts` line for a raw ed25519 key.
    ///
    /// SSH wraps a key in its own wire format before encoding it — the string
    /// "ssh-ed25519", then the 32 key bytes, each with a four-byte length. Both
    /// lengths are fixed here, so the blob is a constant prefix and the key,
    /// and 51 bytes encode to exactly 68 base64 characters with no padding.
    function _sshEd25519(bytes32 hostKey) internal pure returns (string memory) {
        return _base64(
            abi.encodePacked(uint32(11), "ssh-ed25519", uint32(32), hostKey)
        );
    }

    /// @dev SSH prints fingerprints unpadded; 32 bytes is 43 characters.
    function _base64NoPad(bytes32 value) internal pure returns (string memory) {
        bytes memory padded = bytes(_base64(abi.encodePacked(value)));
        bytes memory out = new bytes(43);
        for (uint256 i; i < 43; ++i) out[i] = padded[i];
        return string(out);
    }

    bytes internal constant B64 =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function _base64(bytes memory data) internal pure returns (string memory) {
        uint256 len = data.length;
        if (len == 0) return "";
        bytes memory out = new bytes(4 * ((len + 2) / 3));
        uint256 o;
        for (uint256 i; i < len; i += 3) {
            uint256 chunk = uint256(uint8(data[i])) << 16;
            if (i + 1 < len) chunk |= uint256(uint8(data[i + 1])) << 8;
            if (i + 2 < len) chunk |= uint256(uint8(data[i + 2]));

            out[o++] = B64[(chunk >> 18) & 63];
            out[o++] = B64[(chunk >> 12) & 63];
            out[o++] = i + 1 < len ? B64[(chunk >> 6) & 63] : bytes1("=");
            out[o++] = i + 2 < len ? B64[chunk & 63] : bytes1("=");
        }
        return string(out);
    }

    function _ipv4(bytes4 ip) internal pure returns (string memory) {
        return string.concat(
            _u8(uint8(ip[0])), ".", _u8(uint8(ip[1])), ".", _u8(uint8(ip[2])), ".", _u8(uint8(ip[3]))
        );
    }

    function _u8(uint8 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b = new bytes(3);
        uint256 n;
        while (v != 0) {
            b[2 - n++] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        bytes memory out = new bytes(n);
        for (uint256 i; i < n; ++i) out[i] = b[3 - n + i];
        return string(out);
    }
}
