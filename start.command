#!/bin/bash
# Double-click to run the portfolio on http://localhost:5173 (close this window to stop it).
# Everything printed here is also saved to start.log in this folder.
cd "$(dirname "$0")" || exit 1
exec > >(tee start.log) 2>&1
echo "== start.command $(date) =="
echo "folder: $(pwd)"
NODE="$(command -v node)"
[ -z "$NODE" ] && NODE="$(/bin/zsh -lic 'command -v node' 2>/dev/null | tail -n1)"
for d in /opt/homebrew/bin /usr/local/bin "$HOME"/.nvm/versions/node/*/bin "$HOME"/.volta/bin "$HOME"/miniconda3/bin "$HOME"/.anaconda/bin; do
  [ -z "$NODE" ] && [ -x "$d/node" ] && NODE="$d/node"
done
if [ -z "$NODE" ]; then
  echo "ERROR: Node.js not found. Install it from https://nodejs.org (or: brew install node), then double-click this again."
  read -n1 -p "Press any key to close."; exit 1
fi
echo "node: $NODE ($("$NODE" -v))"
(sleep 2; open "http://localhost:5173") &
"$NODE" server.mjs
echo "Server exited with code $?"
read -n1 -p "Press any key to close."
