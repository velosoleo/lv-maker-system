'use strict';
// Endereço público do serviço; credenciais ficam somente no Cloudflare.
window.LVIntegracoes = {
    url: 'https://lv-maker-integracoes.lv-maker-system.workers.dev',
    chamar(nome, dados) {
        if (!/^[a-zA-Z][a-zA-Z0-9]{0,70}$/.test(nome)) return Promise.reject(new Error('Recurso inválido.'));
        const funcoes = firebase.app().functions('southamerica-east1');
        if (!this.url) return funcoes.httpsCallable(nome, { timeout: 120000 })(dados);
        let base;
        try { base = new URL(this.url); } catch (_) { return Promise.reject(new Error('Endereço da integração inválido.')); }
        if (base.protocol !== 'https:' || !/^lv-maker-integracoes\.[a-z0-9-]+\.workers\.dev$/.test(base.hostname) || base.username || base.password || base.search || base.hash || !['', '/'].includes(base.pathname)) return Promise.reject(new Error('Endereço da integração inválido.'));
        if (typeof funcoes.httpsCallableFromURL !== 'function') return Promise.reject(new Error('Atualize a página para conectar a integração.'));
        return funcoes.httpsCallableFromURL(base.origin + '/rpc/' + nome, { timeout: 120000 })(dados);
    }
};
