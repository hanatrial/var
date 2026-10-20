// Deploy Firebase Hosting (proyek multibagger-screener) TANPA firebase-tools.
// firebase-tools terlalu berat untuk Termux, jadi yang dipakai API Hosting v1beta1 langsung:
// buat versi → unggah berkas (hanya yang hash-nya belum ada) → rilis.
// WEB_DIR = folder isi hosting (firebase.json → "public": "web").
//
// Pakai: node firebase-deploy.js <token>
// Token = OAuth access token Google dengan scope:
//   https://www.googleapis.com/auth/firebase.hosting
//     + https://www.googleapis.com/auth/cloud-platform
// Ambil dari: gcloud auth application-default print-access-token
//             (atau service-account JSON → butuh tanda tangan JWT, tidak didukung di sini)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROJECT = "multibagger-screener";
const SITE = "multibagger-screener";
const WEB = path.join(__dirname, "web");
let TOKEN = process.argv[2] || process.env.FB_TOKEN;

const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const API = `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}`;

// Token dari `firebase login:ci` adalah REFRESH token, bukan access token.
// Tukar dulu di endpoint OAuth Google memakai client firebase-tools (pasangan ini publik,
// tertanam di paket firebase-tools — bukan rahasia).
const FB_CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FB_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

async function accessToken(t) {
  // access token Google berumur ~1 jam dan bentuknya "ya29...." → pakai langsung
  if (/^ya29\./.test(t)) return t;
  // refresh token (biasanya mulai "1//") → tukar
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FB_CLIENT_ID,
      client_secret: FB_CLIENT_SECRET,
      refresh_token: t,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error("token ditolak saat ditukar (" + r.status + "): " +
      (j.error_description || j.error || "periksa apakah token dari `firebase login:ci`"));
  }
  return j.access_token;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

async function api(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${opt.method || "GET"} ${url.split("/").slice(-1)[0]} → ${r.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : {};
}

function daftarBerkas() {
  const out = [];
  const jalan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) jalan(p);
      else out.push(p);
    }
  };
  jalan(WEB);
  return out;
}

(async () => {
  if (!TOKEN) throw new Error("token kosong — pakai: node firebase-deploy.js <token>");
  TOKEN = await accessToken(TOKEN);
  H.Authorization = `Bearer ${TOKEN}`;
  console.log("token Firebase: OK");

  const files = daftarBerkas();
  if (!files.length) throw new Error("folder web/ kosong");
  console.log(`berkas: ${files.length} di ${WEB}`);

  const hash = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

  // 1. Buat versi baru (isi berkas diberitahukan dulu supaya yang sudah ada tidak diunggah ulang)
  const ver = await api(`${API}/versions`, {
    method: "POST",
    body: JSON.stringify({ config: { headers: [{ glob: "**", headers: [{ key: "Cache-Control", value: "no-cache" }] }] } }),
  });
  const V = `${API}/versions/${ver.versionId}`;
  console.log("versi:", ver.versionId);

  const isi = files.map(f => {
    const buf = fs.readFileSync(f);
    const rel = "/" + path.relative(WEB, f).split(path.sep).join("/");
    return { f, rel, buf, h: hash(buf) };
  });
  await api(`${V}/files`, { method: "PUT", body: JSON.stringify({ files: Object.fromEntries(isi.map(x => [x.rel, x.h])) }) });

  // 2. Unggah hanya yang belum ada di server
  let unggah = 0;
  for (const x of isi) {
    const r = await fetch(`${V}/files${encodeURI(x.rel)}`, {
      method: "POST", headers: { ...H, "Content-Type": MIME[path.extname(x.f)] || "application/octet-stream" }, body: x.buf,
    });
    if (!r.ok) throw new Error(`unggah ${x.rel} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    unggah++;
  }
  console.log(`diunggah: ${unggah} berkas`);

  // 3. Selesaikan & rilis
  await api(`${V}?update_mask=status`, { method: "PATCH", body: JSON.stringify({ status: "FINALIZED" }) });
  const rel = await api(`${API}/releases?version_name=${encodeURIComponent(V)}`, { method: "POST", body: JSON.stringify({}) });
  console.log("✓ rilis:", rel.name || "(ok)");
  console.log("  https://" + SITE + ".web.app/saham-laporan.html");
})().catch(e => { console.error("GAGAL: " + e.message); process.exit(1); });
