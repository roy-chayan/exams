/* Offline support for NTRCA Practice.
   Keeps a copy of the site and every question file on the device. Pages are served from
   that copy straight away (so the app opens without internet), and each file is checked
   for a newer version in the background. When something changed, open pages are told,
   so they can offer a "Refresh". Bump CACHE only to throw away everything that was saved. */
const CACHE = "ntrca-v1";
const FONTS = "ntrca-fonts-v1";
const SHELL = ["index.html", "app.js", "style.css", "manifest.webmanifest", "data/index.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "apple-touch-icon.png"];

const scoped = path => new URL(path, self.registration.scope).href;

/* One cache entry per file: "?v=…" and "#…" are ignored, and the folder address means index.html. */
function keyFor(url) {
  const u = new URL(url);
  u.search = ""; u.hash = "";
  if (u.pathname.endsWith("/")) u.pathname += "index.html";
  return u.href;
}

/* A file counts as changed when its ETag / Last-Modified / size differs from the saved copy. */
const version = res => res.headers.get("etag") || res.headers.get("last-modified") || res.headers.get("content-length") || "";

async function save(cache, key) {
  try {
    const res = await fetch(key, { cache: "no-cache" });
    if (res.ok) await cache.put(key, res.clone());
    return res.ok ? res : null;
  } catch (e) { return null; }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(p => save(cache, keyFor(scoped(p)))));
    // Every question file listed in data/index.js, so the whole bank works offline from the first visit.
    const index = await cache.match(keyFor(scoped("data/index.js")));
    const names = index ? [...(await index.text()).matchAll(/"([^"]+)"/g)].map(m => m[1].replace(/^data\//, "").replace(/\.js$/i, "")) : [];
    await Promise.all(names.map(n => save(cache, keyFor(scoped(`data/${n}.js`)))));
    await saveFonts(cache);
    await self.skipWaiting();
  })());
});

/* The Google Fonts stylesheet named in index.html, plus its Bengali and Latin font files.
   The browser only downloads a font file once text needs it, so without this, Bengali
   questions could show in a fallback font the first time the app is used offline. */
async function saveFonts(cache) {
  try {
    const page = await cache.match(keyFor(scoped("index.html")));
    const link = page && (await page.text()).match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/);
    if (!link) return;
    const fonts = await caches.open(FONTS), cssUrl = link[1].replace(/&amp;/g, "&");
    const res = await fetch(cssUrl);
    if (!res.ok) return;
    await fonts.put(cssUrl, res.clone());
    const files = new Set();
    for (const [, subset, body] of (await res.text()).matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)) {
      const src = body.match(/url\(([^)]+)\)/);
      if (src && (subset === "bengali" || subset === "latin")) files.add(src[1]);
    }
    await Promise.all([...files].map(async url => {
      if (await fonts.match(url)) return;
      const font = await fetch(url).catch(() => null);
      if (font && font.ok) await fonts.put(url, font);
    }));
  } catch (e) { /* fonts are a nice-to-have; the app still works with system fonts */ }
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== FONTS) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function notifyUpdated(url) {
  for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "updated", url });
}

/* Site files: answer from the saved copy at once, then refresh it from the network. */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE), key = keyFor(event.request.url);
  const saved = await cache.match(key);
  const network = fetch(key, { cache: "no-cache" }).then(async res => {
    if (res.ok) {
      const changed = saved && version(saved) !== version(res);
      await cache.put(key, res.clone());
      if (changed) await notifyUpdated(key);
    }
    return res;
  }).catch(() => null);
  if (saved) { event.waitUntil(network); return saved; }
  return (await network) || new Response("You are offline and this file hasn't been saved yet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/* Google Fonts never change at a given address, so the saved copy is always fine. */
async function cacheFirst(request) {
  const cache = await caches.open(FONTS), saved = await cache.match(request, { ignoreVary: true });
  if (saved) return saved;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === "opaque") await cache.put(request, res.clone());
    return res;
  } catch (e) { return Response.error(); }
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(staleWhileRevalidate(event));
  else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") event.respondWith(cacheFirst(request));
});
