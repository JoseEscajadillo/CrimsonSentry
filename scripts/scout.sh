#!/usr/bin/env bash
# Runs cargo scout-audit (CoinFabrik) on the Policy Vault. Linux/WSL/macOS only.
#
#   cargo install --locked cargo-dylint dylint-link cargo-scout-audit   # once
#   bash scripts/scout.sh
#
# Two workarounds for scout 0.3.16 + soroban-sdk 28 (neither touches the contract):
#  1. `--target=<host>`: scout otherwise forces wasm32-unknown-unknown, which
#     soroban-sdk refuses to build with Rust >= 1.82. The detectors analyse
#     the source (MIR), so the host target gives the same findings.
#  2. RUSTC_WRAPPER: scout's pinned nightly-2025-08-07 predates Rust 1.91,
#     where str::floor_char_boundary (used by soroban-sdk-macros) became
#     stable; the wrapper enables that feature for that one crate only.
set -euo pipefail
cd "$(dirname "$0")/.."
chmod +x scripts/scout-rustc-wrap.sh
cd contracts/policy-vault
RUSTC_WRAPPER="$PWD/../../scripts/scout-rustc-wrap.sh" cargo scout-audit \
  --output-format md --output-path ../../docs/scout-report.md \
  -- --target="$(rustc -vV | sed -n 's/^host: //p')"
