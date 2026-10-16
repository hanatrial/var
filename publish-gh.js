// publish-gh.js — push file ke branch gh-pages via GitHub API (tanpa git)
const fs = require("fs");
const TOKEN = process.env.GH_TOKEN;
const OWNER = "hanatrial", REPO = "var", BRANCH = "gh-pages";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "node",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function api(path, opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
  if (!r.ok) throw new Error(`${opt.method || "GET"} ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("pakai: node publish-gh.js <file1> <file2> ...");
  if (!TOKEN) throw new Error("GH_TOKEN kosong");

  // 1. ref branch
  const ref = await api(`/git/ref/heads/${BRANCH}`);
  const commitSha = ref.object.sha;
  const commit = await api(`/git/commits/${commitSha}`);
  const baseTree = commit.tree.sha;
  console.log(`branch ${BRANCH} @ ${commitSha.slice(0, 8)} · tree ${baseTree.slice(0, 8)}`);

  // 2. blob untuk tiap file
  const tree = [];
  for (const f of files) {
    const content = fs.readFileSync(f);
    const b = await api(`/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
    });
    tree.push({ path: f.split("/").pop(), mode: "100644", type: "blob", sha: b.sha });
    console.log(`  blob ${f} → ${b.sha.slice(0, 8)} (${(content.length / 1024).toFixed(0)} KB)`);
  }

  // 3. tree baru (parent = tree lama supaya file lain tidak hilang)
  const t = await api(`/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTree, tree }),
  });

  // 4. commit
  const msg = `update: ${files.map(f => f.split("/").pop()).join(", ")} (${new Date().toISOString().slice(0, 16)}Z)`;
  const c = await api(`/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, tree: t.sha, parents: [commitSha] }),
  });
  console.log(`commit ${c.sha.slice(0, 8)} · ${msg}`);

  // 5. update ref (force, karena ini branch artefak)
  await api(`/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: c.sha, force: true }),
  });
  console.log(`✓ ref ${BRANCH} → ${c.sha.slice(0, 8)}`);
})().catch(e => { console.error("GAGAL:", e.message); process.exit(1); });
