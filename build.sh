#!/bin/sh

# clean build directory
find ../dist -mindepth 1 -maxdepth 1 ! -name 'assets' -exec rm -r '{}' \\

npx swc src/*.mjs -s false -d dist

python -m "http.server" -d dist 8080
