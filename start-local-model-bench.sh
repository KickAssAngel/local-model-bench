#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden."
  echo "Bitte installiere Node.js 18 oder neuer und starte danach erneut."
  echo "Ubuntu-Beispiel: sudo apt update && sudo apt install -y nodejs"
  exit 1
fi

NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Die installierte Node.js-Version ist zu alt."
  echo "Gefunden: $(node --version)"
  echo "Bitte installiere Node.js 18 oder neuer."
  exit 1
fi

exec node ./start_ui.mjs "$@"
