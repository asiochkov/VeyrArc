#!/bin/bash
# Local edge functions for the e2e: the billing function (Deno) on :54400 against the mock YooKassa
# on :54401. Needs up.sh first. Idempotent.
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DIR=${LOCALSB_DIR:-/home/claude/localsb}
source "$DIR/keys.env"
DENO="$DIR/bin/deno"
[ -x "$DENO" ] || { curl -sL https://github.com/denoland/deno/releases/download/v2.1.4/deno-x86_64-unknown-linux-gnu.zip -o "$DIR/deno.zip" && python3 -c "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$DIR/deno.zip" "$DIR/bin" && chmod +x "$DENO" && rm "$DIR/deno.zip"; }
curl -s -o /dev/null http://127.0.0.1:54401/ || (setsid nohup node "$HERE/mock-yookassa.mjs" > "$DIR/yookassa.log" 2>&1 < /dev/null &)
if ! curl -s -o /dev/null -X OPTIONS http://127.0.0.1:54400/; then
  env SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY YOOKASSA_API=http://127.0.0.1:54401/v3 \
    YOOKASSA_SHOP_ID=test-shop YOOKASSA_SECRET_KEY=test-secret BILLING_CRON_SECRET=local-cron APP_URL=http://localhost:4173 \
    FN_PORT=54400 FN_FILE="file://$REPO/supabase/functions/billing/index.ts" setsid nohup "$DENO" run --allow-net --allow-env --allow-read "$HERE/serve-shim.ts" > "$DIR/billing.log" 2>&1 < /dev/null &
  for i in $(seq 1 60); do curl -s -o /dev/null -X OPTIONS http://127.0.0.1:54400/ && break; sleep 1; done
fi
curl -s -o /dev/null -w "billing %{http_code}\n" -X OPTIONS http://127.0.0.1:54400/
