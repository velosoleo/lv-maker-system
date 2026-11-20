importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: 'AIzaSyASqz8XoAhyD6w-klOr4HXlj_4URkQlBU8',
    authDomain: 'lv-maker.firebaseapp.com',
    projectId: 'lv-maker',
    storageBucket: 'lv-maker.firebasestorage.app',
    messagingSenderId: '216355482221',
    appId: '1:216355482221:web:5c3806b990538fa7dc6d64'
});

const CACHE_NAME = 'lv-maker-v83';
const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/orcamentos.html',
    '/financeiro.html',
    '/produtos.html',
    '/catalogo.html',
    '/cliente.html',
    '/entregas.html',
    '/envio.html',
    '/entregas-servicos.js?v=66',
    '/checkout-publico.js?v=83',
    '/integracoes.js?v=66',
    '/style.css',
    '/app.js?v=83',
    '/financeiro-regras.js?v=83',
    '/estado-area.js?v=66',
    '/promocao-admin.js?v=66',
    '/pwa.js?v=66',
    '/push-notifications.js?v=66',
    '/catalogo-imagens.js?v=66',
    '/manifest.json',
    '/icon.png',
    '/icon-192.png',
    '/icon-512.png'
];

firebase.messaging().onBackgroundMessage(payload => {
    const data = payload.data || {};
    return self.registration.showNotification(data.title || 'Novo pedido recebido', {
        body: data.body || 'Abra a Produção para conferir.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag || 'novo-pedido',
        renotify: true,
        data: { url: data.url || '/index.html?aba=producao' }
    });
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const destino = new URL(event.notification.data?.url || '/index.html?aba=producao', self.location.origin).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
        const aberta = janelas.find(janela => new URL(janela.url).origin === self.location.origin);
        if (aberta) return aberta.navigate(destino).then(() => aberta.focus());
        return self.clients.openWindow(destino);
    }));
});

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'ATIVAR_ATUALIZACAO') self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key.startsWith('lv-maker-v') && key !== CACHE_NAME).map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

    // A página principal precisa vir da rede para receber correções sem ficar
    // presa a uma versão antiga no cache do navegador.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                const path = url.pathname === '/' ? '/index.html' : url.pathname;
                const cached = await cache.match(path);
                const rede = fetch(event.request);
                // Mantém o evento vivo para tratar a rede mesmo após o fallback.
                event.waitUntil(rede.then(response => {
                    if (response.ok && FILES_TO_CACHE.includes(path)) return cache.put(path, response.clone());
                }).catch(() => {}));
                let timer;
                try {
                    return cached ? await Promise.race([
                        rede,
                        new Promise(resolve => { timer = setTimeout(() => resolve(cached), 6000); })
                    ]) : await rede;
                } catch (_) {
                    return cached || new Response('Sem conexão. Abra novamente quando estiver online.', {
                        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    });
                } finally { clearTimeout(timer); }
            })()
        );
        return;
    }

    // A validação do checkout deve vir da rede, inclusive em páginas de versões anteriores.
    if (url.pathname === '/checkout-publico.js') {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                const response = await fetch(event.request, { cache: 'no-store' });
                if (response.ok) await cache.put(event.request, response.clone());
                return response;
            } catch (_) {
                return await cache.match(event.request) || Response.error();
            }
        })());
        return;
    }

    if (!FILES_TO_CACHE.includes(url.pathname + url.search)) return;
    event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
