// Command harness-dns answers DNS for Agent names by asking the chain.
//
// A name resolves only while its Agent still holds authority. That check is the
// same one the spend path runs — the registry computes it rather than storing an
// answer — so a revoked Agent stops being reachable at the moment it stops being
// able to spend, without anything having to be deleted or synchronised.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net"
	"os"
	"strings"
	"time"

	"github.com/miekg/dns"
)

type server struct {
	rpc       string
	universal string // ENS UniversalResolver
	suffixes  []string
	ttl       uint32
}

func main() {
	var (
		addr      = flag.String("addr", ":5354", "listen address")
		rpc       = flag.String("rpc", envOr("RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com"), "JSON-RPC endpoint")
		universal = flag.String("universal-resolver", envOr("UNIVERSAL_RESOLVER", "0xd26f2040d083af1cd2962ba303f4bea0c4faf142"), "ENS UniversalResolver address")
		suffixes  = flag.String("suffixes", envOr("SUFFIXES", "harness.eth."), "comma-separated zones to serve")
		ttl       = flag.Uint("ttl", 30, "answer TTL in seconds")
	)
	flag.Parse()

	r := &server{rpc: *rpc, universal: *universal, ttl: uint32(*ttl)}
	for _, s := range strings.Split(*suffixes, ",") {
		r.suffixes = append(r.suffixes, dns.Fqdn(strings.TrimSpace(s)))
	}

	dns.HandleFunc(".", r.handle)

	// Both transports: a truncated UDP answer makes a client retry over TCP,
	// and a resolver that only listens on UDP simply hangs at that point.
	for _, net := range []string{"udp", "tcp"} {
		go func(network string) {
			srv := &dns.Server{Addr: *addr, Net: network}
			log.Printf("listening on %s %s, serving %v via ENS at %s", network, *addr, r.suffixes, *universal)
			if err := srv.ListenAndServe(); err != nil {
				log.Fatalf("%s: %v", network, err)
			}
		}(net)
	}
	select {}
}

func (r *server) handle(w dns.ResponseWriter, req *dns.Msg) {
	m := new(dns.Msg)
	m.SetReply(req)
	m.Authoritative = true

	if len(req.Question) != 1 {
		m.SetRcode(req, dns.RcodeFormatError)
		_ = w.WriteMsg(m)
		return
	}
	q := req.Question[0]

	zone, ok := r.zoneFor(q.Name)
	if !ok {
		m.SetRcode(req, dns.RcodeRefused)
		_ = w.WriteMsg(m)
		return
	}

	if strings.EqualFold(dns.Fqdn(q.Name), zone) {
		// The zone apex names no Agent. NODATA, not NXDOMAIN: the zone exists.
		r.nodata(m, zone)
		_ = w.WriteMsg(m)
		return
	}

	ip, err := r.lookup(q.Name)
	if err != nil {
		log.Printf("lookup %s: %v", q.Name, err)
		// Fail closed: an unreachable chain must not become an open door.
		m.SetRcode(req, dns.RcodeServerFailure)
		_ = w.WriteMsg(m)
		return
	}
	if ip == nil {
		// The name exists in the zone but has no authority, so it has no
		// address. NXDOMAIN would be a lie about the *name*.
		r.nodata(m, zone)
		_ = w.WriteMsg(m)
		return
	}

	// Answer A. Everything else gets NODATA rather than NXDOMAIN: macOS
	// resolves A and AAAA in parallel and, per RFC 8020, treats NXDOMAIN as
	// "this name does not exist" — which would break ssh while dig still worked.
	if q.Qtype == dns.TypeA {
		m.Answer = append(m.Answer, &dns.A{
			Hdr: dns.RR_Header{Name: q.Name, Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: r.ttl},
			A:   ip,
		})
	} else {
		r.nodata(m, zone)
	}

	m.Truncate(advertisedSize(req))
	_ = w.WriteMsg(m)
}

// lookup asks ENS for the Agent's address the way any client would: one
// `resolve` against the Universal Resolver, which finds our resolver through
// the registries and calls it.
//
// The walk down the tree, and the authority check at every step of it, happen
// inside that call. Reimplementing either here would be a second copy of the
// rule, free to drift from the one the spend path enforces.
func (r *server) lookup(name string) (net.IP, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	out, err := r.ethCall(ctx, r.universal, endpointCall(name))
	if err != nil {
		if errors.As(err, new(revertError)) {
			// ENS found no resolver, or ours refused the name. A definite no,
			// not a failure to ask.
			return nil, nil
		}
		return nil, err
	}

	raw := decodeEndpoint(out)
	if raw == nil || raw[0]|raw[1]|raw[2]|raw[3] == 0 {
		return nil, nil
	}
	return net.IPv4(raw[0], raw[1], raw[2], raw[3]), nil
}

// --- DNS helpers ---------------------------------------------------------

func (r *server) zoneFor(name string) (string, bool) {
	n := strings.ToLower(dns.Fqdn(name))
	for _, s := range r.suffixes {
		if strings.HasSuffix(n, s) {
			return s, true
		}
	}
	return "", false
}

func (r *server) soa(zone string) *dns.SOA {
	return &dns.SOA{
		Hdr:     dns.RR_Header{Name: zone, Rrtype: dns.TypeSOA, Class: dns.ClassINET, Ttl: r.ttl},
		Ns:      "ns." + zone,
		Mbox:    "hostmaster." + zone,
		Serial:  uint32(time.Now().Unix()),
		Refresh: 3600, Retry: 600, Expire: 86400,
		// Bounds how long a negative answer is cached, which is how quickly a
		// revocation becomes visible to a client that asked a moment too early.
		Minttl: r.ttl,
	}
}

// nodata: the name exists, this type does not. NOERROR with an empty answer.
func (r *server) nodata(m *dns.Msg, zone string) {
	m.Ns = append(m.Ns, r.soa(zone))
}

func (r *server) nxdomain(m *dns.Msg, zone string) {
	m.Rcode = dns.RcodeNameError
	m.Ns = append(m.Ns, r.soa(zone))
}

func advertisedSize(req *dns.Msg) int {
	if opt := req.IsEdns0(); opt != nil {
		if s := int(opt.UDPSize()); s > 512 {
			return s
		}
	}
	return dns.MinMsgSize
}

func envOr(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}
