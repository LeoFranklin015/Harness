// @ledgerhq/speculos-transport depends on this, but it was never published to
// npm, so @ledgerhq/ledger-key-ring-protocol 404s on install without an
// override. We drive real hardware; the Speculos path is never taken.
module.exports = {};
