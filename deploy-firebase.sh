#!/data/data/com.termux/files/usr/bin/bash
# deploy-firebase.sh — segarkan web/ lalu rilis ke Firebase Hosting (multibagger-screener).
# Dipakai cron bersama live-shares.sh, atau manual:
#     FB_TOKEN="<token>" ./deploy-firebase.sh
# Token disimpan di ~/var/.firebase-token (chmod 600) supaya bisa dipakai cron.
#
# Token yang benar = token dari `npx firebase-tools login:ci`, yaitu refresh token dan
# BUKAN access token 1 jam. firebase-deploy.js menukarnya jadi access token dulu.
set -u
DIR="/data/data/com.termux/files/home/var"
cd "$DIR" || exit 1
export PATH="/data/data/com.termux/files/usr/bin:/data/data/com.termux/files/usr/sbin:$PATH"
LOG="$DIR/firebase.log"
TOKENFILE="$DIR/.firebase-token"
log() { echo "[$(TZ=Asia/Jakarta date '+%F %H:%M WIB')] $*" >> "$LOG"; }

if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 300 ]; then tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi

TOKEN="${FB_TOKEN:-}"
[ -z "$TOKEN" ] && [ -f "$TOKENFILE" ] && TOKEN=$(tr -d '\r\n' < "$TOKENFILE")
# Belum ada token = belum diaktifkan, bukan error → keluar diam-diam (cron aman dipasang duluan)
if [ -z "$TOKEN" ]; then exit 0; fi

# Jangan menumpuk
LOCK="/data/data/com.termux/files/home/tmp/.deploy-fb.lock"
if [ -e "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then exit 0; fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Sumber terbaru wajib ada
for f in saham-laporan.html quotes-live.json sw.js manifest.webmanifest icon-192.png icon-512.png; do
  [ -f "$f" ] || { log "GAGAL: $f tidak ada"; exit 1; }
done

mkdir -p web
cp saham-laporan.html web/saham-laporan.html
cp quotes-live.json   web/quotes-live.json
cp sw.js              web/sw.js
cp manifest.webmanifest web/manifest.webmanifest
cp icon-192.png icon-512.png web/
chmod 644 web/* 2>/dev/null

OUT=$(node firebase-deploy.js "$TOKEN" 2>&1); RC=$?
if [ $RC -ne 0 ]; then log "GAGAL deploy: $(echo "$OUT" | tail -2 | tr '\n' ' ')"; exit $RC; fi
echo "$OUT" | while IFS= read -r l; do log "  $l"; done
exit 0
