#!/usr/bin/env bash
# Audit-only shim: scout pins nightly-2025-08-07, where str::floor_char_boundary
# (used by soroban-sdk-macros 28, stable since Rust 1.91) is still feature-gated.
prev=""
for a in "$@"; do
  if [ "$prev" = "--crate-name" ] && [ "$a" = "soroban_sdk_macros" ]; then
    exec "$@" '-Zcrate-attr=feature(round_char_boundary)'
  fi
  prev="$a"
done
exec "$@"
