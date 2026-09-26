#!/usr/bin/env bash
# One-minute live demo for the Demo Day talk.
#
#   bash scripts/demo-corta.sh prep   # BEFORE the talk (~1 min): fresh agent + vault, surplus returned
#   bash scripts/demo-corta.sh live   # ON STAGE (~20 s): approved payment + attack rejected on-chain;
#                                     # the rejected tx opens by itself in the browser
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh >/dev/null

NET=testnet
STATE=evidence/demo-corta.env

case "${1:-}" in
  prep)
    RUN=$(date +%Y%m%d-%H%M%S)
    AGENT_ID="cs-demo-agent-$RUN"
    echo "==> Preparando agente y vault nuevos (esto no se muestra en la charla)…"
    stellar keys generate "$AGENT_ID" >/dev/null
    AGENT=$(stellar keys address "$AGENT_ID")
    stellar tx new create-account --source-account cs-owner --destination "$AGENT" \
      --starting-balance 30000000 --network "$NET" >/dev/null    # 3 XLM: reserve + fees only
    AGENT_ID="$AGENT_ID" VAULT_ALIAS="crimson-corta-$RUN" OUT="$STATE" \
      bash scripts/deploy-testnet.sh > "evidence/.deploy-corta.log" 2>&1 \
      || { tail -20 evidence/.deploy-corta.log; exit 1; }
    rm -f evidence/.deploy-corta.log
    echo "AGENT_ID=$AGENT_ID" >> "$STATE"
    source "$STATE"
    echo "Listo. Vault: $VAULT"
    echo "      https://stellar.expert/explorer/testnet/contract/$VAULT"
    echo "En el escenario ejecuta: bash scripts/demo-corta.sh live"
    ;;
  live)
    [ -f "$STATE" ] || { echo "Primero ejecuta: bash scripts/demo-corta.sh prep"; exit 1; }
    source "$STATE"
    clear
    (cd tools && OPEN_FIRST_REJECTION="${OPEN_FIRST_REJECTION:-1}" node agent/run.js \
      --vault "$VAULT" --identity "$AGENT_ID" --force --scenario agent/scenario-corto.json)
    ;;
  *)
    echo "Uso: bash scripts/demo-corta.sh prep | live"; exit 64 ;;
esac
