/* ═══════════════════════════════════════════════════════════════
   SOKO HURU — Service Worker  (v4)
   Cache-first · Offline fallback · Push notifications
═══════════════════════════════════════════════════════════════ */

const CACHE = 'soko-huru-v4';

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SOKO HURU — Offline</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Josefin Sans',Arial,sans-serif;background:#fdf8f0;
     min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:24px;padding:40px 32px;text-align:center;
      max-width:400px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.1)}
.icon{font-size:72px;margin-bottom:20px}
.title{font-size:24px;font-weight:700;color:#1a6b3c;margin-bottom:10px;letter-spacing:1px}
.sub{font-size:15px;color:#7a6a58;line-height:1.6;margin-bottom:28px}
.btn{background:#1a6b3c;color:#fff;border:none;border-radius:12px;
     padding:14px 32px;font-size:14px;font-weight:700;letter-spacing:1px;
     text-transform:uppercase;cursor:pointer;width:100%}
</style>
</head>
<body>
<div class="card">
  <div class="icon">📶</div>
  <div class="title">You're Offline</div>
  <div class="sub">No internet connection. SOKO HURU will reload automatically when you're back online.</div>
  <button class="btn" onclick="location.reload()">Try Again</button>
</div>
<script>window.addEventListener('online',()=>location.reload());</script>
</body>
</html>`;

// ── Install: cache the SW and offline page ──
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.add(self.registration.scope)).catch(() => {})
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first with network fallback ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Skip analytics, ads, non-HTTP
  if (!url.protocol.startsWith('http')) return;
  if (url.hostname.includes('google-analytics') ||
      url.hostname.includes('doubleclick') ||
      url.hostname.includes('facebook')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      // Kick off network fetch to update cache in background
      const networkFetch = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone())).catch(() => {});
        }
        return res;
      }).catch(() => null);

      // Serve cached instantly (stale-while-revalidate)
      if (cached) {
        networkFetch.catch(() => {});
        return cached;
      }

      // No cache — wait for network
      return networkFetch.then(res => {
        if (res) return res;
        // Full offline fallback for navigation requests
        if (e.request.mode === 'navigate') {
          return new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
        return new Response('', { status: 503 });
      });
    })
  );
});

// ── Push: lunch-time food notifications from server ──
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title   = data.title  || '🍔 Lunchtime at SOKO HURU!';
  const body    = data.body   || 'Hot fast food & snacks ready — chips, burgers, samosas & cold drinks!';
  const icon    = data.icon   || '/icon-192.png';
  const badge   = data.badge  || '/icon-72.png';
  const url     = data.url    || self.registration.scope;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: 'soko-huru-lunch',
      renotify: true,
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      data: { url },
      actions: [
        { action: 'order',  title: '🍔 Order Now'     },
        { action: 'snacks', title: '🍪 Browse Snacks' }
      ]
    })
  );
});

// ── Notification click: open app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url)
    ? e.notification.data.url
    : self.registration.scope;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus existing tab if open
      const existing = list.find(c => c.url.startsWith(self.registration.scope));
      if (existing) return existing.focus();
      return clients.openWindow(target);
    })
  );
});
