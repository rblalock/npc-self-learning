#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"
cargo build --release -p tactical-air-ffi

# Respect Cargo's configured target directory, including CARGO_TARGET_DIR overrides.
target_dir="$(cargo metadata --format-version 1 --no-deps | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')"
library_dir="$target_dir/release"
smoke_binary="$library_dir/tactical-air-ffi-smoke"
case "$(uname -s)" in
  Darwin|Linux) ;;
  *) echo 'This smoke script supports macOS and Linux; use the C source with your Windows toolchain.' >&2; exit 1 ;;
esac

"${CC:-cc}" -std=c11 -Wall -Wextra -Werror \
  -I "$repo_dir/crates/tactical-air-ffi/include" \
  "$repo_dir/scripts/ffi-smoke.c" \
  -L "$library_dir" -ltactical_air_ffi \
  -Wl,-rpath,"$library_dir" \
  -o "$smoke_binary"
"$smoke_binary"
