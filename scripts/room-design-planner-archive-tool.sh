#!/bin/sh
set -eu

if [ -x /usr/bin/bsdtar ]; then
  /usr/bin/bsdtar --version
  exit 0
fi

destination="$(pwd)/.next/room-design-planner-tools/archive"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
apt-get download libarchive-tools
dpkg-deb -x ./libarchive-tools_*.deb "$destination"
"$destination/usr/bin/bsdtar" --version
