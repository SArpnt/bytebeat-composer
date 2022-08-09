#!/bin/sh

rm -r tmp
mkdir tmp

# minify js
# TODO directories
# TODO .js
npx swc src/*.mjs -s true -d tmp

# minify css
# TODO minify
cp src/*.css tmp

zola build

mv tmp/* build
rm -r tmp

python -m "http.server" -d build 8080
