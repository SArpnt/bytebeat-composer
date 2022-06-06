#!/bin/sh
cargo build --release
wasm-bindgen target/wasm32-unknown-unknown/debug/*.wasm --out-dir ../web_build --out-name rustWasm --target web --no-typescript
wasm-opt ../web_build/rustWasm_bg.wasm -Os -o ../web_build/rustWasm_bg.wasm
