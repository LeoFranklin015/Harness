import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native binding: cannot be bundled, must be required at runtime.
  // Native binding: cannot be bundled, must be required at runtime. The Ledger
  // packages stay bundled — their ESM builds use extensionless imports that
  // only a bundler resolves.
  serverExternalPackages: ["@napi-rs/keyring"],
  /* config options here */
};

export default nextConfig;
