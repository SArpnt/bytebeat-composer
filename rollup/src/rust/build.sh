#!/bin/sh

outPath=$PWD/$1
scriptPath=$(dirname "$(readlink -f "$0")")

cd "$scriptPath"
cargo +nightly build -Z build-std=core,std,proc_macro,panic_abort -Z build-std-features=panic_immediate_abort --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/*.wasm --out-dir "$outPath" --out-name rustWasm --target web --no-typescript
wasm-opt "$outPath/rustWasm_bg.wasm" -Os -o "$outPath/rustWasm_bg.wasm"
