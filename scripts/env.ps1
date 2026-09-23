# Toolchain environment for PowerShell on this machine.
#   . .\scripts\env.ps1
$env:RUSTUP_HOME = 'D:\Rust\rustup'
$env:CARGO_HOME  = 'D:\Rust\cargo'
$env:Path        = "D:\Rust\cargo\bin;$env:Path"
# wasm-opt cannot write to a temp path with non-ASCII characters (C:\Users\José\...).
New-Item -ItemType Directory -Force D:\Rust\tmp | Out-Null
$env:TMP  = 'D:\Rust\tmp'
$env:TEMP = 'D:\Rust\tmp'
$env:STELLAR_NETWORK = 'testnet'
