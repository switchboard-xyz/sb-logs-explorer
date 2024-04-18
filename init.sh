#!/usr/bin/env sh
# set -x

if grep -q docker /proc/1/cgroup || test -f /.dockerenv; then
	echo "" # "Running in Docker"
else
	echo "ERROR: This script is meant to be run in a Docker container! exiting."
	exit
fi

apt update && apt install -y ca-certificates && apt dist-upgrade -y

npm i -g pnpm turbo typescript

rm -rf .pnpm-store node_modules/
pnpm config set store-dir /tmp/pnpm/store

pnpm i && pnpm build && npm link
