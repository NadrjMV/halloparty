// Service worker do check-in: deixa o app abrir sem internet.
// - Navegação: rede primeiro (pega versão nova quando online), cache se offline.
// - Libs/fontes/estáticos: cache primeiro + atualização em segundo plano.
// - Firestore/Auth (API) NÃO passam por aqui: a fila de escritas offline é do
//   próprio SDK do Firebase (IndexedDB), que reenvia quando a conexão volta.
const CACHE = 'checkin-v1';

const PRECACHE = [
    './',
    './index.html',
    'assets/logo-wordmark.png',
    'assets/favicon.png',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js'
];

const CACHEABLE_HOSTS = [
    'cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'unpkg.com',
    'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // Um por um: se uma URL falhar, o resto continua (o runtime cache completa).
        await Promise.all(PRECACHE.map(async (url) => {
            try {
                const req = new Request(url, url.startsWith('http') ? { mode: 'cors' } : {});
                const res = await fetch(req);
                if (res.ok || res.type === 'opaque') await cache.put(req, res);
            } catch (e) { /* tenta de novo no runtime */ }
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

async function networkFirstNavigation(request) {
    const cache = await caches.open(CACHE);
    try {
        const res = await fetch(request);
        if (res.ok) cache.put('./index.html', res.clone());
        return res;
    } catch (e) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request).then((res) => {
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
    }).catch(() => null);
    return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (request.mode === 'navigate' && url.origin === self.location.origin) {
        event.respondWith(networkFirstNavigation(request));
        return;
    }
    if (url.origin === self.location.origin || CACHEABLE_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
