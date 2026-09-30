#!/bin/bash
# Local stand-in for Supabase used by the e2e tests: Postgres 16 + GoTrue (auth) +
# PostgREST + a gateway on :54321 that also catches outgoing mail (codes at /__mail).
# Usage: app/tools/local-backend/up.sh   (idempotent; first run downloads the binaries)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DIR=${LOCALSB_DIR:-/home/claude/localsb}
PGBIN=/usr/lib/postgresql/16/bin
PSQL="psql -q -h 127.0.0.1 -p 54322 -U postgres"
mkdir -p "$DIR/bin" "$DIR/mail"
cd "$DIR"

# binaries
[ -x bin/postgrest ] || curl -sL https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz | tar -xJ -C bin
[ -x bin/auth ] || curl -sL https://github.com/supabase/auth/releases/download/v2.180.0/auth-v2.180.0-x86.tar.gz | tar -xz -C bin
[ -d node_modules/smtp-server ] || { npm init -y >/dev/null; npm i smtp-server mailparser jsonwebtoken >/dev/null 2>&1; }
cp "$HERE/gateway.mjs" gateway.mjs

# keys
if [ ! -f keys.env ]; then
node -e '
const jwt=require("jsonwebtoken"); const s="local-dev-jwt-secret-with-at-least-32-characters"; const now=Math.floor(Date.now()/1000);
const k=(role)=>jwt.sign({role,iss:"supabase",iat:now,exp:now+10*365*86400},s);
require("fs").writeFileSync("keys.env",`JWT_SECRET=${s}\nANON_KEY=${k("anon")}\nSERVICE_KEY=${k("service_role")}\n`);'
fi
source keys.env

# postgres
FRESH=0
if [ ! -f pgdata/PG_VERSION ]; then
  mkdir -p pgdata && chown postgres pgdata
  runuser -u postgres -- $PGBIN/initdb -D "$DIR/pgdata" -U postgres --auth=trust >/dev/null
  FRESH=1
fi
$PSQL -tc "select 1" >/dev/null 2>&1 || { runuser -u postgres -- $PGBIN/pg_ctl -D "$DIR/pgdata" -o "-p 54322 -k /tmp -c listen_addresses=127.0.0.1" -l "$DIR/pgdata/pg.log" start >/dev/null; sleep 2; }

if [ "$FRESH" = 1 ]; then
  $PSQL <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login password 'postgres' noinherit;
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login password 'postgres' createrole noinherit;
create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;
alter role supabase_auth_admin set search_path = auth;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
fi

# GoTrue schema, then the app migrations not applied yet
DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:54322/postgres" GOTRUE_DB_DRIVER=postgres GOTRUE_DB_MIGRATIONS_PATH="$DIR/bin" \
  GOTRUE_JWT_SECRET=$JWT_SECRET API_EXTERNAL_URL=http://localhost:54321/auth/v1 GOTRUE_SITE_URL=http://localhost:4173 bin/auth migrate >/dev/null 2>&1
$PSQL -c "create schema if not exists private; create table if not exists private.applied_migrations (name text primary key);"
for f in "$REPO"/supabase/migrations/*.sql; do
  n=$(basename "$f")
  if [ -z "$($PSQL -tAc "select 1 from private.applied_migrations where name='$n'")" ]; then
    $PSQL -v ON_ERROR_STOP=1 -f "$f" && $PSQL -c "insert into private.applied_migrations values ('$n')" && echo "applied $n"
  fi
done
$PSQL -c "notify pgrst, 'reload schema'"

# services (restart)
pkill -f "node gateway.mjs" 2>/dev/null || true
pkill -x auth 2>/dev/null || true
pkill -x postgrest 2>/dev/null || true
sleep 1
setsid nohup node gateway.mjs > gateway.log 2>&1 < /dev/null &
sleep 1
T=http://127.0.0.1:54321/__tpl
env GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:54322/postgres" GOTRUE_DB_MIGRATIONS_PATH="$DIR/bin" \
GOTRUE_SITE_URL=http://localhost:4173 GOTRUE_URI_ALLOW_LIST="http://localhost:4173/**,http://localhost:5173/**" \
GOTRUE_JWT_SECRET=$JWT_SECRET GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=${AUTOCONFIRM:-false} GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true \
GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=false GOTRUE_MAILER_OTP_LENGTH=6 GOTRUE_MAILER_OTP_EXP=3600 \
GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_USER=x GOTRUE_SMTP_PASS=x GOTRUE_SMTP_ADMIN_EMAIL=no-reply@veyrarc.online GOTRUE_SMTP_MAX_FREQUENCY=1s \
GOTRUE_RATE_LIMIT_EMAIL_SENT=10000 GOTRUE_RATE_LIMIT_ANONYMOUS_USERS=10000 GOTRUE_RATE_LIMIT_VERIFY=10000 GOTRUE_RATE_LIMIT_OTP=10000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 \
GOTRUE_MAILER_TEMPLATES_CONFIRMATION=$T/confirmation GOTRUE_MAILER_TEMPLATES_RECOVERY=$T/recovery GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=$T/email_change GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=$T/magic_link \
GOTRUE_PASSWORD_MIN_LENGTH=8 setsid nohup bin/auth serve > auth.log 2>&1 < /dev/null &
env PGRST_DB_URI="postgres://authenticator:postgres@127.0.0.1:54322/postgres" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET=$JWT_SECRET PGRST_SERVER_PORT=3000 PGRST_SERVER_HOST=127.0.0.1 setsid nohup bin/postgrest > postgrest.log 2>&1 < /dev/null &
sleep 3
curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null && echo "local backend up: http://localhost:54321 (anon key in $DIR/keys.env)"
