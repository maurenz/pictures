#!/bin/sh
set -e
cd "$(dirname "$0")"
npx esbuild src/app.js --bundle --minify --format=iife --target=es2020 --outfile=website/assets/app.js --log-level=warning
npx esbuild src/app.css --minify --outfile=website/assets/app.css --log-level=warning
if [ -f src/admin.js ]; then npx esbuild src/admin.js --bundle --minify --format=iife --target=es2020 --outfile=website/admin/admin.js --log-level=warning; fi
if [ -f src/admin.css ]; then npx esbuild src/admin.css --minify --outfile=website/admin/admin.css --log-level=warning; fi
echo gebaut
