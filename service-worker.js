const CACHE_NAME = 'lv-maker-v18';
const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/orcamentos.html',
    '/financeiro.html',
    '/produtos.html',
    '/catalogo.html',
    '/cliente.html',
    '/style.css',
    '/manifest.json',
    '/icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    if (
        event.request.url.includes('firebaseapp.com') ||
        event.request.url.includes('googleapis.com') ||
        event.request.url.includes('gstatic.com')
    ) return;

    // A página principal precisa vir da rede para receber correções sem ficar
    // presa a uma versão antiga no cache do navegador.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('/index.html'))
        );
        return;
    }

    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
