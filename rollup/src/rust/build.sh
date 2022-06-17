#!/bin/sh

outPath=$PWD/$1
scriptPath=$(dirname "$(readlink -f "$0")")

cd "$scriptPath"
cargo +nightly build -Z build-std=core,std,proc_macro,panic_abort -Z build-std-features=panic_immediate_abort --target wasm32-unknown-unknown --release
wasm-bindgen "target/wasm32-unknown-unknown/release/"*".wasm" --out-dir "$outPath" --target web --no-typescript
for file in "$outPath/"*".wasm"; do
	wasm-opt "$file" -Os -o "$file"
done
