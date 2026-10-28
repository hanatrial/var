#!/data/data/com.termux/files/usr/bin/bash
# var — screener saham (IDX + Crypto) → terbit ke GitHub Pages (branch gh-pages).
# Dijalankan cron Termux setiap 18.00 WITA (= 17.00 WIB), sekali sehari.
# Crypto ikut: baris CRYPTO dipakai tab Crypto untuk menempel harga live Coinpaprika.
# Kalau gagal (mis. Yahoo menolak), diulang otomatis sampai 3 kali.

set -u
# cron menjalankan job dengan PATH minimal — paksa PATH Termux
export PATH="/data/data/com.termux/files/usr/bin:/data/data/com.termux/files/usr/sbin:$PATH"
export HOME="/data/data/com.termux/files/home"
export TZ="Asia/Makassar"
# Crypto IKUT diambil: tab Crypto butuh baris DATA-nya untuk menempel harga live Coinpaprika.
# Dulu SKIP_CRYPTO=1 di sini → DATA tidak punya satu pun baris CRYPTO, jadi harga live
# "gagal" (tidak ada kartu yang bisa di-update) dan tab Crypto kosong.
# Kalau cron sempat lambat karena kripto, set SKIP_CRYPTO=1 lagi — tapi live-nya ikut mati.

DIR="/data/data/com.termux/files/home/var"
LOG="$DIR/cron.log"
CRED="/data/data/com.termux/files/home/nutrifood-stock/.git-credentials"
MAX_COBA=3
JEDA=300   # detik antar percobaan

cd "$DIR" || exit 1

# Batasi ukuran log (sisakan 500 baris terakhir)
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 500 ]; then
  tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

log() { echo "[$(date '+%F %T %Z')] $*" >> "$LOG"; }
run() { echo "$1" | while IFS= read -r line; do log "  $line"; done; }

# Token GitHub diambil dari file kredensial (tidak ditulis ke mana-mana)
GH_TOKEN=$(sed -n 's#https://[^:]*:\([^@]*\)@github.com#\1#p' "$CRED" 2>/dev/null)
if [ -z "${GH_TOKEN:-}" ]; then
  log "GAGAL: token GitHub tidak ditemukan di $CRED"
  exit 1
fi
export GH_TOKEN

satu_kali() {
  # 1. Ambil data Yahoo Finance
  OUT=$(node stock-scraper.js 2>&1); local RC=$?
  run "$OUT"
  if [ $RC -ne 0 ]; then log "  scraper gagal (exit $RC)"; return $RC; fi

  # 2. Jaga-jaga: jangan terbitkan halaman kalau datanya kosong/terlalu sedikit
  local N
  N=$(node -e 'try{const j=require("./saham-screener.json");const a=Array.isArray(j)?j:j.stocks;console.log(a?a.length:0)}catch(e){console.log(0)}')
  log "  instrumen: $N"
  if [ "${N:-0}" -lt 100 ]; then
    log "  instrumen cuma $N (batas minimal 100) — dibatalkan"
    return 1
  fi

  # 2b. Jaga-jaga: marketplace crypto sudah punya harga live, tapi laporan tanpa satu pun baris
  # crypto berarti tab Crypto kosong (skor/label tidak di-update). Coba lagi daripada terbit separuh.
  local NC
  NC=$(node -e 'try{const j=require("./saham-screener.json");const a=Array.isArray(j)?j:j.stocks;console.log(a.filter(r=>r.market==="CRYPTO").length)}catch(e){console.log(0)}')
  log "  crypto: $NC koin"
  if [ "${NC:-0}" -lt 10 ]; then
    log "  crypto cuma $NC koin (batas minimal 10) — dibatalkan, ulangi"
    return 1
  fi

  # 3. Bangun halaman laporan
  OUT=$(node generate-report.js 2>&1); RC=$?
  run "$OUT"
  if [ $RC -ne 0 ] || [ ! -s saham-laporan.html ]; then log "  halaman laporan tidak jadi"; return 1; fi

  # 4. Terbitkan ke branch gh-pages
  OUT=$(node publish-gh.js saham-laporan.html 2>&1); RC=$?
  run "$OUT"
  if [ $RC -ne 0 ]; then log "  terbit ke gh-pages gagal (exit $RC)"; return $RC; fi
  return 0
}

for i in $(seq 1 $MAX_COBA); do
  log "--- mulai (percobaan $i/$MAX_COBA) ---"
  if satu_kali; then
    log "SELESAI — https://hanatrial.github.io/var/saham-laporan.html"
    exit 0
  fi
  if [ "$i" -lt "$MAX_COBA" ]; then
    log "  ulangi dalam $((JEDA/60)) menit…"
    sleep $JEDA
  fi
done

log "GAGAL setelah $MAX_COBA percobaan"
exit 1
