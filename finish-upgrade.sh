#!/usr/bin/env bash
# Run AFTER uploading the updated code over /root/aispeakpro (FileZilla, overwrite).
# Usage:  DB_PASSWORD='your-db-password' bash /root/aispeakpro/finish-upgrade.sh
set -euo pipefail

DB_PASSWORD="${DB_PASSWORD:-PUT_A_PASSWORD_HERE}"
cd /root/aispeakpro

echo ">> Install + build"
pnpm install
pnpm --filter @aispeakpro/shared build
pnpm --filter @aispeakpro/api build
pnpm --filter @aispeakpro/web build

echo ">> Migrate (adds onboarding columns + courses tables) + seed courses"
export DATABASE_URL="postgresql://aispeak:${DB_PASSWORD}@localhost:5432/aispeak"
export JWT_ACCESS_SECRET="deploybootstrapaccesssecret000000" JWT_REFRESH_SECRET="deploybootstraprefreshsecret1111"
node apps/api/dist/db/migrate.js
node apps/api/dist/db/seed.js

echo ">> Publish web build"
mkdir -p /var/www/aispeak
rm -rf /var/www/aispeak/*
cp -r apps/web/dist/* /var/www/aispeak/

echo ">> Restart API (keeps your existing LLM key/config)"
pm2 restart aispeak-api

echo ">> Done. Reload the site — new users get the onboarding flow + a course."
