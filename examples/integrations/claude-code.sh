#!/usr/bin/env sh
set -eu

BRALI_REPO="${BRALI_REPO:-/ABSOLUTE/PATH/TO/brali-lifeos.github.io}"

claude mcp add brali --scope user -- node "$BRALI_REPO/mcp/server.mjs"
claude mcp get brali
