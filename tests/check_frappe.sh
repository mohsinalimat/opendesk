#!/usr/bin/env bash
# Check a Frappe that is not yet pulled for the names Open Desk hangs on (`test_frappe_seams.py`).
#
#   tests/check_frappe.sh                      # upstream/version-16-hotfix, the next v16 release
#   tests/check_frappe.sh upstream/develop     # or any ref apps/frappe knows
#
# Run it from the bench or the app; fetch first (`git -C apps/frappe fetch upstream`) for news. The
# ref's source is copied out with `git archive` into a temporary folder: the Frappe checkout, its
# branch and its working tree are left as they are. A failure names what to read in Frappe's diff.
set -euo pipefail

REF="${1:-upstream/version-16-hotfix}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
BENCH="$(cd "$APP/../.." && pwd)"
SOURCE="$(mktemp -d)"
trap 'rm -rf "$SOURCE"' EXIT

git -C "$BENCH/apps/frappe" archive "$REF" frappe | tar -x -C "$SOURCE"
echo "Frappe at $REF ($(git -C "$BENCH/apps/frappe" log -1 --format='%h, %cs' "$REF"))"
cd "$BENCH/sites"
OPENDESK_FRAPPE_SOURCE="$SOURCE" ../env/bin/python -m unittest opendesk.open_desk.test_frappe_seams
