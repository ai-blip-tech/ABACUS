#!/bin/sh
set -eu

if [ -x /usr/bin/bsdtar ] && /usr/bin/bsdtar --version; then
  exit 0
fi

destination="$(pwd)/.next/room-design-planner-tools/archive"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
plan="$(LC_ALL=C apt-get --simulate --no-install-recommends install libarchive-tools)"
printf '%s\n' "$plan" | awk '$1=="Inst" {print $2}' | sort -u > packages.txt
grep -qx libarchive-tools packages.txt
while IFS= read -r package; do
  apt-get download "$package"
done < packages.txt
for deb in ./*.deb; do
  dpkg-deb -x "$deb" "$destination"
done

cat > "$destination/bsdtar" <<'WRAPPER'
#!/bin/sh
set -eu
root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
libraries="$root/usr/lib:$root/lib"
for directory in "$root"/usr/lib/*-linux-gnu "$root"/lib/*-linux-gnu; do
  if [ -d "$directory" ]; then libraries="$libraries:$directory"; fi
done
LD_LIBRARY_PATH="$libraries" exec "$root/usr/bin/bsdtar" "$@"
WRAPPER
chmod 0755 "$destination/bsdtar"
"$destination/bsdtar" --version
