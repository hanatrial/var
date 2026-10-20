#!/data/data/com.termux/files/usr/bin/bash
# live-shares.sh — perbarui quotes-live.json (harga live IDX & US) lalu terbitkan.
# Dipanggil cron tiap 5 menit. TIDAK memanggil Yahoo kalau tidak ada bursa yang buka,
# supaya kuota & baterai tidak habis. Zona waktu dikunci eksplisit — jangan bergantung TZ cron.
#
# Jam bursa (WIB, Sen–Jum):
#   IDX : 09:00–16:00
#   AS  : 15:00–07:00 (pra-bursa 04:00 ET s/d pasca-bursa 20:00 ET; ET = WIB−11 saat EDT,
#         WIB−12 saat EST → 15:00 WIB sudah aman untuk keduanya)
set -u
DIR="/data/data/com.termux/files/home/var"
cd "$DIR" || exit 1
export PATH="/data/data/com.termux/files/usr/bin:/data/data/com.termux/files/usr/sbin:$PATH"
LOG="$DIR/live.log"
CRED="/data/data/com.termux/files/home/nutrifood-stock/.git-credentials"
log() { echo "[$(TZ=Asia/Jakarta date '+%F %H:%M WIB')] $*" >> "$LOG"; }

# batasi ukuran log
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 300 ]; then tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi

DOW=$(TZ=Asia/Jakarta date +%u)          # 1=Senin … 7=Minggu
HH=$(TZ=Asia/Jakarta date +%H)           # jam WIB 00-23
case "$DOW" in 6|7) exit 0 ;; esac

BUKA=0
# IDX: 09:00–16:00 WIB
[ "$HH" -ge 9 ] && [ "$HH" -lt 16 ] && BUKA=1
# AS: 15:00–24:00 dan 00:00–07:00 WIB
if [ "$HH" -ge 15 ] || [ "$HH" -lt 7 ]; then BUKA=1; fi
[ "$BUKA" -eq 0 ] && exit 0

# Jangan menumpuk: kalau proses sebelumnya masih jalan, lewati
LOCK="/data/data/com.termux/files/home/tmp/.live-shares.lock"
if [ -e "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then exit 0; fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

# Hash ISI HARGA saja (bukan seluruh file): "generatedAt" selalu berubah tiap run,
# jadi kalau file di-hash utuh, deteksi perubahan tidak pernah kena.
hashQ() {
  node -e 'try{const j=require("./quotes-live.json");const c=require("crypto");
    console.log(c.createHash("md5").update(JSON.stringify(j.q)).digest("hex"))}catch(e){console.log("")}' 2>/dev/null
}

# Simpan salinan lama untuk deteksi perubahan
SEBELUM=""
[ -f quotes-live.json ] && SEBELUM=$(hashQ)

OUT=$(node quotes-live.js 2>&1); RC=$?
if [ $RC -ne 0 ]; then log "GAGAL ambil quote: $(echo "$OUT" | tail -1)"; exit $RC; fi

# Harga tidak berubah (bursa tutup / Yahoo beku) → jangan bikin commit kosong.
# Tetap terbitkan kalau belum ada di gh-pages (SEBELUM kosong).
SESUDAH=$(hashQ)
if [ -n "$SEBELUM" ] && [ "$SEBELUM" = "$SESUDAH" ]; then exit 0; fi

GH_TOKEN=$(sed -n 's#https://[^:]*:\([^@]*\)@github.com#\1#p' "$CRED" 2>/dev/null)
if [ -z "${GH_TOKEN:-}" ]; then log "GAGAL: token GitHub tidak ada"; exit 1; fi
export GH_TOKEN

OUT2=$(node publish-gh.js quotes-live.json 2>&1); RC=$?
if [ $RC -ne 0 ]; then log "GAGAL terbit: $(echo "$OUT2" | tail -1)"; exit $RC; fi
echo "$OUT" | while IFS= read -r l; do log "$l"; done

# Firebase multibagger (kalau token sudah ada) — pakai halaman & harga yang sama.
# Diam saja kalau token belum diset; kegagalan Firebase tidak boleh menggagalkan gh-pages.
"$DIR/deploy-firebase.sh" || log "deploy Firebase gagal (gh-pages tetap terbit)"
exit 0
