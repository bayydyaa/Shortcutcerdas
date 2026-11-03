/* ===== Bayyu Dashboard ===== */

// Daftar awal (muncul saat dashboard pertama kali dibuka di sebuah perangkat).
// Kalau alamatnya beda, ganti di sini sebelum upload ke GitHub.
const DEFAULTS = [
  { name: "Pasar Tani Cerdas", url: "https://bayydyaa.github.io/pasartanicerdas/" },
  { name: "Pertanian Cerdas",  url: "https://bayydyaa.github.io/pertaniancerdas/" },
  { name: "Kasir Cerdas",      url: "https://bayydyaa.github.io/kasircerdas/" },
  { name: "Kamera Cerdas",     url: "https://bayydyaa.github.io/kameracerdas/" }
];

const KEY = "bayyu-dashboard-links-v2";
const THEME = "bayyu-dashboard-theme";
const $ = id => document.getElementById(id);

/* ---------- utilitas ---------- */
const uid = () => (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2);

function readLS(k) { try { return localStorage.getItem(k); } catch { return null; } }
function writeLS(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Hanya terima alamat http/https. Tanpa "https://" otomatis ditambahkan.
function cleanUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(s)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(s) && !/^[\w-]+(\.[\w-]+)+:\d+/i.test(s)) return null; // tolak javascript:, data:, dll
    s = "https://" + s;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.href;
  } catch { return null; }
}

function safeIcon(s) {
  if (typeof s !== "string" || !s) return "";
  if (s.startsWith("data:image/")) return s.length < 150000 ? s : "";
  try { const u = new URL(s); return (u.protocol === "https:" || u.protocol === "http:") ? u.href : ""; }
  catch { return ""; }
}

function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } }

function nameFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (u.hostname.endsWith("github.io") && seg) return decodeURIComponent(seg);
    const sld = ["ac", "co", "go", "or", "my", "sch", "web", "net", "com", "org", "gov", "edu", "id", "biz"];
    const h = hostOf(url).split(".");
    if (h.length > 1) h.pop();
    while (h.length > 1 && sld.includes(h[h.length - 1])) h.pop();
    const n = h[h.length - 1] || "Shortcut";
    return n.charAt(0).toUpperCase() + n.slice(1);
  } catch { return "Shortcut"; }
}

function subLabel(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0];
    if (u.hostname.endsWith("github.io") && seg) return "github.io/" + decodeURIComponent(seg);
  } catch {}
  return hostOf(url);
}

function initial(name) { return (String(name).trim().match(/[\p{L}\p{N}]/u) || ["•"])[0].toUpperCase(); }

function hue(str) { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

/* ---------- data ---------- */
function sanitize(arr) {
  return arr.map(x => {
    const url = cleanUrl(x && x.url);
    if (!url) return null;
    return {
      id: String(x.id || uid()),
      name: String(x.name || nameFromUrl(url)).trim().slice(0, 40) || nameFromUrl(url),
      url,
      icon: safeIcon(x.icon),
      autoName: !!x.autoName,
      checked: !!x.checked,
      checkedAt: Number(x.checkedAt) || 0,
      missing: !!x.missing
    };
  }).filter(Boolean);
}

function load() {
  try {
    const saved = JSON.parse(readLS(KEY));
    if (Array.isArray(saved)) return sanitize(saved);
  } catch {}
  return sanitize(DEFAULTS);
}

let links = load();
let warnedStorage = false;
function save() {
  if (!writeLS(KEY, JSON.stringify(links)) && !warnedStorage) {
    warnedStorage = true;
    toast("Browser ini tidak bisa menyimpan data (mode privat?)");
  }
}

/* ---------- cari logo otomatis ---------- */
function googleIcon(url) {
  return "https://www.google.com/s2/favicons?sz=128&domain_url=" + encodeURIComponent(new URL(url).origin);
}

async function fetchWithTimeout(url, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, cache: "no-store", credentials: "omit" }); }
  finally { clearTimeout(t); }
}

async function manifestIcon(manifestUrl) {
  try {
    const r = await fetchWithTimeout(manifestUrl);
    if (!r.ok) return "";
    const m = await r.json();
    const icons = Array.isArray(m.icons) ? m.icons : [];
    const size = i => Math.max(0, ...String(i.sizes || "0").split(/\s+/).map(s => parseInt(s, 10) || (s === "any" ? 999 : 0)));
    const best = icons.filter(i => i && i.src && !/maskable/.test(i.purpose || "") || icons.length === 1)
                      .sort((a, b) => size(b) - size(a))[0];
    return best ? new URL(best.src, r.url || manifestUrl).href : "";
  } catch { return ""; }
}

// Coba baca halaman web-nya langsung (berhasil untuk GitHub Pages),
// kalau gagal pakai layanan logo Google.
async function findIcon(url) {
  const isGithub = /\.github\.io$/i.test(new URL(url).hostname);
  let title = "", icon = "", missing = false;
  try {
    const r = await fetchWithTimeout(url);
    if (r.status === 404) missing = true;
    if (r.ok && /html/i.test(r.headers.get("content-type") || "html")) {
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const base = r.url || url;
      title = (doc.querySelector("title")?.textContent || "").replace(/\s+/g, " ").trim();
      const link = doc.querySelector('link[rel~="apple-touch-icon"]')
        || doc.querySelector('link[rel~="icon"][type="image/svg+xml"]')
        || doc.querySelector('link[rel~="icon"]');
      const href = link && link.getAttribute("href");
      if (href) icon = href.startsWith("data:image/") ? href : new URL(href, base).href;
      if (!icon) {
        const fav = new URL("favicon.ico", base).href;
        try { const f = await fetchWithTimeout(fav, 4000); if (f.ok && /image/i.test(f.headers.get("content-type") || "")) icon = fav; } catch {}
      }
      if (!icon) {
        const mf = doc.querySelector('link[rel="manifest"]')?.getAttribute("href");
        if (mf) icon = await manifestIcon(new URL(mf, base).href);
      }
    }
  } catch {}
  icon = safeIcon(icon);
  // GitHub Pages tanpa logo: pakai huruf awal (logo Google-nya cuma logo GitHub)
  if (!icon && !isGithub && !missing) icon = googleIcon(url);
  return { icon, title: title.slice(0, 40), missing };
}

const pending = new Set();
async function refreshIcon(id) {
  if (pending.has(id)) return;
  const item = links.find(x => x.id === id);
  if (!item) return;
  pending.add(id);
  const { icon, title, missing } = await findIcon(item.url);
  pending.delete(id);
  const cur = links.find(x => x.id === id);
  if (!cur || cur.url !== item.url) return; // sudah diedit/dihapus
  cur.icon = icon;
  cur.missing = missing;
  cur.checked = true;
  cur.checkedAt = Date.now();
  if (cur.autoName && title) { cur.name = title; cur.autoName = false; }
  save();
  render();
}

async function checkMissingIcons() {
  // Cek ulang yang belum punya logo / link 404 sekali sehari, biar ikut berubah kalau web-nya diperbaiki
  const DAY = 864e5;
  const stale = l => !l.checked || ((!l.icon || l.missing) && Date.now() - (l.checkedAt || 0) > DAY);
  for (const x of links.filter(stale)) await refreshIcon(x.id);
}

/* ---------- tampilan ---------- */
function iconHTML(x) {
  return `<div class="tile-icon" style="--h:${hue(x.url)}"><span class="letter">${esc(initial(x.name))}</span>${
    x.icon ? `<img src="${esc(x.icon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</div>`;
}

function wireImages(root) {
  root.querySelectorAll(".tile-icon img").forEach(img => {
    const box = img.parentElement;
    const ok = () => { if (img.naturalWidth > 1) box.classList.add("has-img"); else img.remove(); };
    img.onerror = () => img.remove();
    img.onload = ok;
    if (img.complete) img.naturalWidth ? ok() : img.remove();
  });
}

function render() {
  $("grid").innerHTML = links.map(x => `
    <div class="tile${x.missing ? " is-missing" : ""}">
      <a class="tile-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">
        ${iconHTML(x)}
        <div class="tile-name">${esc(x.name)}</div>
        <div class="tile-domain">${x.missing ? '<span class="warn">Link 404, cek alamat</span>' : esc(subLabel(x.url))}</div>
      </a>
      <button class="edit-hint" type="button" data-edit="${esc(x.id)}" aria-label="Edit ${esc(x.name)}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
    </div>`).join("");
  $("grid").querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEdit(b.dataset.edit));
  wireImages($("grid"));
  $("empty").classList.toggle("hidden", links.length !== 0);
  $("grid").classList.toggle("hidden", links.length === 0);
}

/* ---------- dialog tambah / edit ---------- */
function showUrlError(show) {
  $("urlError").classList.toggle("hidden", !show);
  $("linkUrl").setAttribute("aria-invalid", show ? "true" : "false");
}

function openAdd() {
  $("linkForm").reset();
  $("linkId").value = "";
  $("modalTitle").textContent = "Tambah shortcut";
  $("deleteBtn").classList.add("hidden");
  $("iconPreview").innerHTML = "";
  showUrlError(false);
  $("linkDialog").showModal();
  setTimeout(() => $("linkUrl").focus(), 50);
}

function openEdit(id) {
  const x = links.find(v => v.id === id);
  if (!x) return;
  $("linkId").value = id;
  $("linkUrl").value = x.url;
  $("linkName").value = x.autoName ? "" : x.name;
  $("modalTitle").textContent = "Edit shortcut";
  $("deleteBtn").classList.remove("hidden");
  $("iconPreview").innerHTML = iconHTML(x) + (x.missing
    ? `<span class="warn">Alamat ini tidak ditemukan (404). Cek lagi nama repo-nya, huruf besar-kecil juga berpengaruh.</span>`
    : `<span>Logo dicek ulang otomatis waktu kamu simpan.</span>`);
  wireImages($("iconPreview"));
  showUrlError(false);
  $("linkDialog").showModal();
}

function closeDialog() { $("linkDialog").close(); }

$("addBtn").onclick = openAdd;
$("emptyAdd").onclick = openAdd;
$("closeBtn").onclick = closeDialog;
$("cancelBtn").onclick = closeDialog;
$("linkDialog").addEventListener("click", e => { if (e.target === $("linkDialog")) closeDialog(); });
$("linkUrl").addEventListener("input", () => showUrlError(false));

$("linkForm").addEventListener("submit", e => {
  e.preventDefault();
  const url = cleanUrl($("linkUrl").value);
  if (!url) { showUrlError(true); $("linkUrl").focus(); return; }
  const typedName = $("linkName").value.trim();
  const id = $("linkId").value;
  const old = links.find(x => x.id === id);
  const item = {
    id: id || uid(),
    url,
    name: typedName || (old && !old.autoName && old.url === url ? old.name : nameFromUrl(url)),
    autoName: !typedName && !(old && !old.autoName && old.url === url),
    icon: old && old.url === url ? old.icon : "",
    missing: false,
    checked: false,
    checkedAt: 0
  };
  if (old) links = links.map(x => x.id === id ? item : x);
  else links.push(item);
  save();
  render();
  closeDialog();
  toast(old ? "Shortcut disimpan" : "Shortcut ditambahkan");
  refreshIcon(item.id);
});

$("deleteBtn").onclick = () => {
  const id = $("linkId").value;
  const x = links.find(v => v.id === id);
  if (!x || !confirm(`Hapus "${x.name}"?`)) return;
  links = links.filter(v => v.id !== id);
  save();
  render();
  closeDialog();
  toast("Shortcut dihapus");
};

/* ---------- pencarian ---------- */
$("searchForm").onsubmit = e => {
  e.preventDefault();
  const q = $("search").value.trim();
  if (!q) return;
  const looksUrl = !/\s/.test(q) && /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q);
  const url = looksUrl ? cleanUrl(q) : null;
  location.href = url || "https://www.google.com/search?q=" + encodeURIComponent(q);
};

/* ---------- tema ---------- */
function applyTheme(t) {
  document.body.classList.toggle("light", t === "light");
  $("themeBtn").textContent = t === "light" ? "☾" : "☼";
  document.querySelector('meta[name="theme-color"]').content = t === "light" ? "#f2f4fb" : "#0b1020";
}
applyTheme(readLS(THEME) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
$("themeBtn").onclick = () => {
  const t = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(t);
  writeLS(THEME, t);
};

/* ---------- cadangkan / pulihkan ---------- */
$("exportBtn").onclick = () => {
  const data = links.map(({ name, url, icon }) => ({ name, url, icon }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "shortcut-cerdas-cadangan.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Cadangan diunduh");
};

$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data)) throw 0;
    const clean = sanitize(data.map(x => ({ ...x, id: undefined, checked: false })));
    if (!clean.length) throw 0;
    if (!confirm(`Ganti shortcut sekarang dengan ${clean.length} shortcut dari cadangan?`)) return;
    links = clean;
    save();
    render();
    toast("Shortcut dipulihkan");
    checkMissingIcons();
  } catch {
    alert("File ini bukan cadangan Shortcut Cerdas. Pilih file .json hasil tombol Cadangkan.");
  }
};

/* ---------- jam & sapaan ---------- */
function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $("toast").classList.remove("show"), 2200);
}

function tick() {
  const d = new Date();
  $("clock").textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(".", ":");
  $("date").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  const h = d.getHours();
  $("greeting").textContent = h < 11 ? "SELAMAT PAGI, BAYYU" : h < 15 ? "SELAMAT SIANG, BAYYU" : h < 18 ? "SELAMAT SORE, BAYYU" : "SELAMAT MALAM, BAYYU";
}

tick();
setInterval(tick, 10000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
render();
checkMissingIcons();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
