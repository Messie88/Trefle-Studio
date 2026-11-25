#!/bin/sh
# Lives on the VPS at /docker/trefle-studio-nextjs/deploy.sh and is the only
# command the GitHub Actions deploy key may run (authorized_keys `command=`).
#
# Builds the new image while the current container keeps serving, then swaps
# containers. Caddy retries during the few seconds of the swap, so visitors
# never see an error.
set -eu

cd /docker/trefle-studio-nextjs

docker compose build --pull app
docker compose up -d --no-deps --wait --wait-timeout 120 app
docker image prune -f
