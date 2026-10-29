#!/bin/sh
set -eu
converter_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
# Private Linux converter, never a user-provided executable or command string.
ulimit -v 524288
ulimit -t 30
ulimit -f 8192
exec /usr/bin/nice -n 10 /usr/bin/timeout --signal=TERM --kill-after=5s 30s "$converter_dir/dwg2dxf.bin" "$@"
