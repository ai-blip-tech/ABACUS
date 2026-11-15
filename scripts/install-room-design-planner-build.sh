#!/bin/sh
set -eu

source_sha="$1"
case "$PLANNER_BUILD_ID" in ''|*[!0-9]*) exit 1;; esac
case "$PLANNER_BUILD_DIGEST" in ''|*[!0-9a-f]*) exit 1;; esac
test "${#PLANNER_BUILD_DIGEST}" -eq 64
test -n "$PLANNER_BUILD_TOKEN"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

curl --fail --silent --show-error --location --max-time 120 --config - \
  --output "$work/artifact.zip" \
  "https://api.github.com/repos/ai-blip-tech/ABACUS/actions/artifacts/$PLANNER_BUILD_ID/zip" <<EOF_TOKEN
header = "Authorization: Bearer $PLANNER_BUILD_TOKEN"
EOF_TOKEN

python3 - "$work" <<'PY'
from pathlib import Path
from zipfile import ZipFile
import shutil
import sys

work = Path(sys.argv[1])
name = "planner-build.tar.gz"
with ZipFile(work / "artifact.zip") as archive:
    entry = archive.getinfo(name)
    if entry.file_size > 64 * 1024 * 1024:
        raise SystemExit("Planner build exceeds size limit")
    with archive.open(entry) as source, (work / name).open("wb") as target:
        shutil.copyfileobj(source, target)
PY

printf '%s  %s\n' "$PLANNER_BUILD_DIGEST" "$work/planner-build.tar.gz" | sha256sum -c -
mkdir -p .next
tar --extract --gzip --no-same-owner --no-same-permissions --file "$work/planner-build.tar.gz" --directory .next
test "$(cat .next/room-design-planner-tools/SOURCE_SHA)" = "$source_sha"
