package main

import (
	"encoding/hex"
	"net"
	"testing"
)

// A real answer from the Universal Resolver on Sepolia for
// research.demo.harness.eth, captured 2026-09-05.
//
// It is here because the shape is the part that is easy to get wrong: the
// endpoint is wrapped twice, and reading one layer too few yields all zeroes —
// which is indistinguishable from an Agent that has no endpoint. That failure
// is silent, and it takes the whole nameserver down while every call still
// succeeds.
const liveAnswer = "0000000000000000000000000000000000000000000000000000000000000040" +
	"000000000000000000000000d8a2ce774daf9aeab5d40e3f2158ed1e047fdd8e" +
	"0000000000000000000000000000000000000000000000000000000000000060" +
	"0000000000000000000000000000000000000000000000000000000000000020" +
	"0000000000000000000000000000000000000000000000000000000000000004" +
	"8d94d14d00000000000000000000000000000000000000000000000000000000"

func TestDecodeEndpoint(t *testing.T) {
	got := decodeEndpoint(unhex(t, liveAnswer))
	if want := net.IPv4(141, 148, 209, 77).To4(); !net.IP(got).Equal(net.IP(want)) {
		t.Fatalf("got %v, want %v", net.IP(got), net.IP(want))
	}
}

func TestDecodeEndpointRejectsMalformed(t *testing.T) {
	for name, in := range map[string]string{
		"empty":     "",
		"truncated": "0000000000000000000000000000000000000000000000000000000000000040",
		"offset past end": "00000000000000000000000000000000000000000000000000000000000000ff" +
			"000000000000000000000000d8a2ce774daf9aeab5d40e3f2158ed1e047fdd8e",
		"no endpoint published": "0000000000000000000000000000000000000000000000000000000000000040" +
			"000000000000000000000000d8a2ce774daf9aeab5d40e3f2158ed1e047fdd8e" +
			"0000000000000000000000000000000000000000000000000000000000000000",
	} {
		if got := decodeEndpoint(unhex(t, in)); got != nil {
			t.Errorf("%s: got %x, want nil", name, got)
		}
	}
}

func TestNamehash(t *testing.T) {
	// cast namehash research.demo.harness.eth
	want := "2475725509949777620722d286f8fb6169895dc120c486edf35a0ae7efd01c58"
	if got := hex.EncodeToString(namehash("research.demo.harness.eth")); got != want {
		t.Errorf("got %s, want %s", got, want)
	}
	if got := hex.EncodeToString(namehash("")); got != hex.EncodeToString(make([]byte, 32)) {
		t.Errorf("the root node is zero, got %s", got)
	}
}

func TestWireName(t *testing.T) {
	want := "0872657365617263680464656d6f076861726e6573730365746800"
	if got := hex.EncodeToString(wireName("research.demo.harness.eth.")); got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func unhex(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
