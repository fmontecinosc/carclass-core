/* Carclass Core · service worker: app instalable, caché del cascarón y clic en avisos */
const CACHE = "core-v2.3.0";
const SHELL = ["./", "index.html", "app.css?v=2.3.0", "app.js?v=2.3.0", "manifest.webmanifest", "img/logo.png", "img/icon-192.png", "vendor/supabase.js?v=2.45.4"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Supabase y fuentes van directo a la red
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const href = e.notification.data?.href || "#/bandeja";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs[0];
    if (c) { c.postMessage({ href }); return c.focus(); }
    return self.clients.openWindow("./" + href);
  }));
});
// Push con la app cerrada: listo para cuando el servidor envíe avisos (requiere claves VAPID en core-api)
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: "Carclass Core", body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Carclass Core", { body: d.body, icon: "img/icon-192.png", badge: "img/icon-96.png", tag: d.tag, data: { href: d.href } }));
});
