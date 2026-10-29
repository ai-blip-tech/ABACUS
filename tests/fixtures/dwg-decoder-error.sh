#!/bin/sh
# A decoder can return success while reporting a genuine geometry read error.
printf '%s\n' 'ERROR: Failed to read compressed Objects section' >&2
printf '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nEOF\n' > "$5"
exit 0
