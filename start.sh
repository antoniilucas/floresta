#!/usr/bin/env sh
# Sobe um servidor local e abre o navegador. Requer Python 3 (ou Node.js como alternativa).
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}"
URL="http://localhost:$PORT"
echo "Servidor em $URL  (Ctrl+C para parar)"
( sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  elif command -v open >/dev/null 2>&1; then open "$URL"; fi ) >/dev/null 2>&1 &
if command -v python3 >/dev/null 2>&1; then exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then exec python -m http.server "$PORT"
elif command -v node >/dev/null 2>&1; then exec node tools/serve.mjs
else echo "Instale Python 3 ou Node.js 18+ para iniciar o servidor local." >&2; exit 1; fi
