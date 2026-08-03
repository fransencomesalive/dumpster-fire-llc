#!/usr/bin/env bash
# Renders public/og-share.png from the design-system compose source.
# The compose file is the design source of truth; this script is the only way the
# shipped PNG should be produced. Re-run it after any edit to og-share-compose.html.
#
# Chrome is required because the wordmark overprint uses mix-blend-mode:multiply,
# which next/og (Satori) cannot render.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/design-system/components/og-share-compose.html"
OUT="$ROOT/public/og-share.png"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

[ -f "$SOURCE" ] || { echo "missing compose source: $SOURCE" >&2; exit 1; }
[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (set CHROME_BIN)" >&2; exit 1; }

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 \
  --screenshot="$OUT" --window-size=1200,630 \
  "file://$SOURCE" >/dev/null 2>&1

[ -f "$OUT" ] || { echo "render failed: no output at $OUT" >&2; exit 1; }
echo "rendered $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
