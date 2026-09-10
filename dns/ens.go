package main

import (
	"encoding/hex"
	"strings"

	"golang.org/x/crypto/sha3"
)

// Encoding just enough ABI and ENS to be an ordinary client. A full Ethereum
// library is several megabytes to make one `eth_call`, and everything below is
// fixed-shape: the nameserver only ever asks one question.

// resolveSelector is IUniversalResolver.resolve(bytes,bytes) — ENSIP-10.
const resolveSelector = "9061b923"

// dataSelector is data(bytes32,string) — ENSIP-24, arbitrary bytes by key.
// The Agent's endpoint comes back as the raw four bytes rather than a string
// the nameserver would have to parse back into an address.
const dataSelector = "ecbfada3"

// namehash is the node id every ENS resolver call carries, per ENSIP-1.
//
// Our own resolver ignores it and reads the name instead, since one resolver
// answers for names that were never individually registered. It is computed
// properly all the same: the nameserver should send what any wallet would
// send, so that what it proves is what a wallet gets.
func namehash(name string) []byte {
	node := make([]byte, 32)
	name = strings.TrimSuffix(name, ".")
	if name == "" {
		return node
	}
	labels := strings.Split(name, ".")
	for i := len(labels) - 1; i >= 0; i-- {
		node = keccak(append(node, keccak([]byte(labels[i]))...))
	}
	return node
}

func keccak(b []byte) []byte {
	h := sha3.NewLegacyKeccak256()
	h.Write(b)
	return h.Sum(nil)
}

// wireName encodes a domain in DNS wire format, which is how ENSIP-10 passes a
// name to a wildcard resolver.
func wireName(name string) []byte {
	var out []byte
	for _, label := range strings.Split(strings.TrimSuffix(name, "."), ".") {
		if label == "" {
			continue
		}
		out = append(out, byte(len(label)))
		out = append(out, label...)
	}
	return append(out, 0)
}

// endpointCall builds the whole nested call: ask the Universal Resolver to
// resolve `name`, by making the `data(node, "endpoint")` call against whatever
// resolver ENS says is responsible for it.
func endpointCall(name string) string {
	inner := "0x" + dataSelector +
		hex.EncodeToString(namehash(name)) +
		word(0x40) + // offset to the string
		word(8) + // len("endpoint")
		pad([]byte("endpoint"))

	return "0x" + resolveSelector +
		word(0x40) + // offset to `name`
		word(uint64(0x40+32+len(padBytes(wireName(name))))) + // offset to `data`
		dynBytes(wireName(name)) +
		dynBytes(mustHex(inner))
}

// dynBytes encodes a `bytes` argument: its length, then its padded content.
func dynBytes(b []byte) string {
	return word(uint64(len(b))) + pad(b)
}

func pad(b []byte) string {
	return hex.EncodeToString(padBytes(b))
}

func padBytes(b []byte) []byte {
	if n := len(b) % 32; n != 0 {
		return append(b, make([]byte, 32-n)...)
	}
	return b
}

func word(n uint64) string {
	var b [32]byte
	for i := 0; i < 8; i++ {
		b[31-i] = byte(n >> (8 * i))
	}
	return hex.EncodeToString(b[:])
}

func mustHex(s string) []byte {
	b, err := hex.DecodeString(strings.TrimPrefix(s, "0x"))
	if err != nil {
		panic(err)
	}
	return b
}

// decodeEndpoint reads the Agent's four address bytes out of a Universal
// Resolver answer, or nil if the Agent published none.
//
// The value is wrapped twice. `resolve` returns `(bytes value, address
// resolver)`, and `value` is the inner call's return data passed through
// untouched — so it still has to be decoded as the `bytes` that
// `data(bytes32,string)` returns. Reading one layer yields the inner offset
// word, which is all zeroes, and looks exactly like an Agent with no endpoint.
//
// An empty result at the inner layer is the real "no": the resolver computed
// that this Agent has no address, rather than a record having been deleted.
func decodeEndpoint(out []byte) []byte {
	value := dynamicAt(out, 0)
	if value == nil {
		return nil
	}
	inner := dynamicAt(value, 0)
	if len(inner) < 4 {
		return nil
	}
	return inner[:4]
}

// dynamicAt reads the `bytes` whose offset word sits at `slot` in `b`.
func dynamicAt(b []byte, slot int) []byte {
	if len(b) < (slot+1)*32 {
		return nil
	}
	off := int(be(b[slot*32 : (slot+1)*32]))
	if off < 0 || off+32 > len(b) {
		return nil
	}
	n := int(be(b[off : off+32]))
	if n < 0 || off+32+n > len(b) {
		return nil
	}
	return b[off+32 : off+32+n]
}

func be(b []byte) uint64 {
	var n uint64
	for _, c := range b[24:] {
		n = n<<8 | uint64(c)
	}
	return n
}
