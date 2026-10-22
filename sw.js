// taco 試算表 App 的 service worker：有網路就拿最新的，沒網路時用上一次存下來的檔案（整個網站都能離線用）。
const CACHE = "taco-sheets-v1";
const CORE = ["./", "./manifest.json", "./core.js", "./app.js", "./icon-192.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("taco-sheets") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const nav = req.mode === "navigate";
  // 存的時候不看 ?v= 版本號，每個檔案只留最新的一份
  const key = nav ? new URL("./", self.registration.scope).href : url.origin + url.pathname;
  e.respondWith(fetch(nav ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : req).then((res) => {
    if (res.ok && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key).then((hit) => hit || Promise.reject(new Error("offline")))));
});
