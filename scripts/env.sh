#!/usr/bin/env bash
# Toolchain environment for this Windows machine (Rust + stellar-cli live on D:).
# On Linux/macOS with a normal rustup install this file is a no-op.
#
#   source scripts/env.sh

if [ -d /d/Rust/cargo/bin ]; then
  export RUSTUP_HOME='D:\Rust\rustup'
  export CARGO_HOME='D:\Rust\cargo'
  # self-contained/ provides dlltool.exe, needed to build cargo-scout-audit
  # with the GNU toolchain.
  export PATH="/d/Rust/cargo/bin:/d/Rust/rustup/toolchains/stable-x86_64-pc-windows-gnu/lib/rustlib/x86_64-pc-windows-gnu/bin/self-contained:$PATH"
  # wasm-opt (inside `stellar contract build`) cannot write to a temp path with
  # non-ASCII characters such as C:\Users\José\... -> use an ASCII temp dir.
  mkdir -p /d/Rust/tmp
  export TMP='D:\Rust\tmp'
  export TEMP='D:\Rust\tmp'
fi

export STELLAR_NETWORK=testnet
