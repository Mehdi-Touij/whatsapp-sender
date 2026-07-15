#!/usr/bin/env bash
#
# add-number.sh — create one Evolution instance with its own STICKY proxy
# wired in BEFORE the first QR scan, then print the QR to link the number.
#
# Usage: ./add-number.sh course-number-1
# (reads proxy from proxies/course-number-1.env)
#
set -euo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi

BASE_URL="${SERVER_URL:-http://localhost:8080}"
APIKEY="${GLOBAL_API_KEY:?GLOBAL_API_KEY not set in .env}"

INSTANCE="${1:?Usage: ./add-number.sh <instance-name>}"
PROXY_ENV="proxies/${INSTANCE}.env"

if [[ ! -f "$PROXY_ENV" ]]; then
  echo "Missing $PROXY_ENV — create it from proxies/EXAMPLE.env first."
  exit 1
fi
set -a; source "$PROXY_ENV"; set +a

: "${PROXY_HOST:?PROXY_HOST missing in $PROXY_ENV}"
: "${PROXY_PORT:?PROXY_PORT missing in $PROXY_ENV}"
: "${PROXY_PROTOCOL:=http}"
: "${PROXY_USERNAME:=}"
: "${PROXY_PASSWORD:=}"
: "${INSTANCE_WEBHOOK:=${WEBHOOK_URL:-}}"

echo "==> Creating instance '$INSTANCE' via proxy $PROXY_HOST:$PROXY_PORT ($PROXY_PROTOCOL)"

# 1. Create instance WITH proxy
CREATE_PAYLOAD=$(cat <<JSON
{
  "instanceName": "${INSTANCE}",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS",
  "proxyHost": "${PROXY_HOST}",
  "proxyPort": "${PROXY_PORT}",
  "proxyProtocol": "${PROXY_PROTOCOL}",
  "proxyUsername": "${PROXY_USERNAME}",
  "proxyPassword": "${PROXY_PASSWORD}"
}
JSON
)

curl -s -X POST "${BASE_URL}/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: ${APIKEY}" \
  -d "${CREATE_PAYLOAD}" | tee /tmp/${INSTANCE}_create.json
echo

# 2. Re-assert proxy
curl -s -X POST "${BASE_URL}/proxy/set/${INSTANCE}" \
  -H "Content-Type: application/json" \
  -H "apikey: ${APIKEY}" \
  -d "{
    \"enabled\": true,
    \"host\": \"${PROXY_HOST}\",
    \"port\": \"${PROXY_PORT}\",
    \"protocol\": \"${PROXY_PROTOCOL}\",
    \"username\": \"${PROXY_USERNAME}\",
    \"password\": \"${PROXY_PASSWORD}\"
  }" >/dev/null && echo "==> Proxy confirmed on ${INSTANCE}"

# 3. Set webhook
if [[ -n "${INSTANCE_WEBHOOK}" ]]; then
  curl -s -X POST "${BASE_URL}/webhook/set/${INSTANCE}" \
    -H "Content-Type: application/json" \
    -H "apikey: ${APIKEY}" \
    -d "{
      \"webhook\": {
        \"enabled\": true,
        \"url\": \"${INSTANCE_WEBHOOK}\",
        \"byEvents\": true,
        \"base64\": true,
        \"events\": [\"MESSAGES_UPSERT\",\"CONNECTION_UPDATE\",\"QRCODE_UPDATED\"]
      }
    }" >/dev/null && echo "==> Webhook set -> ${INSTANCE_WEBHOOK}"
fi

# 4. Fetch QR
echo "==> Scan this QR to link the number:"
echo "    ${BASE_URL}/instance/connect/${INSTANCE}"
curl -s -X GET "${BASE_URL}/instance/connect/${INSTANCE}" \
  -H "apikey: ${APIKEY}" | tee /tmp/${INSTANCE}_qr.json
echo
echo "==> Done. Scan within 1-2 minutes."