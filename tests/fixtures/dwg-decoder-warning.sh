#!/bin/sh
printf '%s\n' 'Warning: Unsupported auxiliary metadata' >&2
printf '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nEOF\n' > "$5"
exit 0
