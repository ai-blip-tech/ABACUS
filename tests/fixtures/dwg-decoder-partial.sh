#!/bin/sh
printf '%s\n' 'ERROR: Some objects could not be decoded' >&2
printf '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nEOF\n' > "$5"
exit 1
