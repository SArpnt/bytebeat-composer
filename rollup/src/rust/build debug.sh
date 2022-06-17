#!/bin/sh
trap "exit" INT TERM ERR
trap "kill 0" EXIT

oldPWD=$PWD
outPath=$PWD/$1
scriptPath=$(dirname "$(readlink -f "$0")")

cd "$scriptPath"
cargo watch\
	-x "build --target wasm32-unknown-unknown"\
	-s "wasm-bindgen target/wasm32-unknown-unknown/debug/*.wasm --debug --out-dir \"$outPath\" --target web --no-typescript"\
	-s "cd \"$oldPWD\" && $2" &

wait
