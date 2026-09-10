package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// A deliberately small JSON-RPC client: this only ever makes `eth_call`, and a
// full Ethereum library would be several megabytes to do one thing.

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type rpcResponse struct {
	Result string `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// revertError marks a call the chain answered by reverting — ENS found no
// resolver, or ours refused the name. That is a definite "no", and must be told
// apart from a failure to reach the chain at all, which is not.
type revertError struct{ msg string }

func (e revertError) Error() string { return "reverted: " + e.msg }

func (r *server) ethCall(ctx context.Context, to, data string) ([]byte, error) {
	body, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0", ID: 1, Method: "eth_call",
		Params: []any{map[string]string{"to": to, "data": data}, "latest"},
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.rpc, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var out rpcResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if out.Error != nil {
		// -32000 and 3 are both used for execution reverted, depending on the
		// node; the message is the reliable part.
		if strings.Contains(out.Error.Message, "revert") {
			return nil, revertError{out.Error.Message}
		}
		return nil, fmt.Errorf("eth_call: %s", out.Error.Message)
	}
	return hex.DecodeString(strings.TrimPrefix(out.Result, "0x"))
}
