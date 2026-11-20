'use strict';
const { environment } = require('./context.cjs');
class Timestamp {
    constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
    static fromMillis(ms) { return new Timestamp(Math.floor(ms / 1000), Math.round((ms % 1000) * 1000000)); }
    static now() { return Timestamp.fromMillis(Date.now()); }
    toMillis() { return this.seconds * 1000 + this.nanoseconds / 1000000; }
}
function encode(value) {
    if (value === null) return { nullValue: null };
    if (value instanceof Timestamp) return { timestampValue: new Date(value.toMillis()).toISOString() };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number' && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    if (value && Object.getPrototypeOf(value) === Object.prototype) return { mapValue: { fields: fields(value) } };
    throw new Error('Valor não suportado pelo Firestore.');
}
const fields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
function decode(value) {
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return Timestamp.fromMillis(Date.parse(value.timestampValue));
    for (const key of ['stringValue', 'booleanValue', 'doubleValue']) if (key in value) return value[key];
    if ('integerValue' in value) { const n = Number(value.integerValue); if (!Number.isSafeInteger(n)) throw new Error('Número fora do limite seguro.'); return n; }
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    throw new Error('Tipo do Firestore não suportado.');
}
const decodeFields = data => Object.fromEntries(Object.keys(data).sort().map(key => [key, decode(data[key])]));
const b64 = bytes => Buffer.from(bytes).toString('base64url');
let credentialCache, accessCache, pendingToken;
async function accessToken(env) {
    if (env.testAccessToken) return env.testAccessToken;
    if (accessCache?.source === env.FIREBASE_SERVICE_ACCOUNT && accessCache.expira > Date.now() + 60000) return accessCache.token;
    if (pendingToken?.source === env.FIREBASE_SERVICE_ACCOUNT) return pendingToken.promise;
    const promise = (async () => {
        let account;
        try { account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch (_) { throw new Error('Identidade do servidor não configurada.'); }
        if (account.project_id !== env.FIREBASE_PROJECT_ID || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(account.client_email || '') || typeof account.private_key !== 'string') throw new Error('Identidade de outro projeto ou inválida.');
        if (credentialCache?.source !== env.FIREBASE_SERVICE_ACCOUNT) {
            const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
            const key = await crypto.subtle.importKey('pkcs8', Buffer.from(pem, 'base64'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
            credentialCache = { source: env.FIREBASE_SERVICE_ACCOUNT, key };
        }
        const now = Math.floor(Date.now() / 1000);
        const body = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64(JSON.stringify({
            iss: account.client_email,
            scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
            aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
        }));
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', credentialCache.key, new TextEncoder().encode(body));
        const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: body + '.' + b64(signature) }), signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error('Não foi possível autenticar o servidor.');
        const data = await r.json();
        if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in)) throw new Error('Resposta de autenticação inválida.');
        accessCache = { source: env.FIREBASE_SERVICE_ACCOUNT, token: data.access_token, expira: Date.now() + data.expires_in * 1000 };
        return data.access_token;
    })();
    const marker = { source: env.FIREBASE_SERVICE_ACCOUNT, promise }; pendingToken = marker;
    try { return await promise; } finally { if (pendingToken === marker) pendingToken = null; }
}
class Database {
    constructor(env, request = fetch) {
        if (!/^[a-z][a-z0-9-]{4,60}$/.test(env.FIREBASE_PROJECT_ID || '')) throw new Error('Projeto inválido.');
        this.env = env; this.request = request;
        this.base = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    }
    async api(path, method = 'GET', data, optional = false) {
        const token = this.env.testAccessToken || await accessToken(this.env);
        // O fetch nativo do Worker não aceita Database como receptor.
        const request = this.request;
        const r = await request('https://firestore.googleapis.com/v1/' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(20000) });
        if (optional && r.status === 404) return null;
        if (!r.ok) { const error = new Error('Operação no banco não confirmada.'); error.status = r.status; throw error; }
        return await r.json();
    }
    doc(path) {
        if (typeof path !== 'string' || path.split('/').length % 2 || path.split('/').some(s => !/^[a-zA-Z0-9_-]{1,150}$/.test(s))) throw new Error('Caminho de documento inválido.');
        const ref = { path, id: path.split('/').pop() };
        ref.get = () => this.read(ref);
        ref.set = data => this.commit([this.write(ref, data, 'set')]);
        ref.update = data => this.commit([this.write(ref, data, 'update')]);
        return ref;
    }
    snapshot(ref, document) { return { ref, id: ref.id, exists: !!document, data: () => document ? decodeFields(document.fields || {}) : undefined }; }
    async read(ref, transaction) {
        const document = await this.api(this.base + '/' + ref.path + (transaction ? '?transaction=' + encodeURIComponent(transaction) : ''), 'GET', undefined, true);
        return this.snapshot(ref, document);
    }
    async batch(refs, transaction) {
        if (!refs.length) return [];
        const result = await this.api(this.base + ':batchGet', 'POST', { documents: refs.map(r => this.base + '/' + r.path), ...(transaction ? { transaction } : {}) });
        if (!Array.isArray(result)) throw new Error('Leitura incompleta do banco.');
        return refs.map(ref => {
            const record = result.find(r => (r.found?.name || r.missing) === this.base + '/' + ref.path);
            if (!record) throw new Error('Leitura incompleta do banco.');
            return this.snapshot(ref, record.found || null);
        });
    }
    getAll(...refs) { return this.batch(refs); }
    collection(name) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) throw new Error('Coleção inválida.');
        return { doc: (id = crypto.randomUUID()) => this.doc(name + '/' + id), where: (field, op, value) => {
            if (op !== '==' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field)) throw new Error('Consulta inválida.');
            return { get: async () => {
                const result = await this.api(this.base + ':runQuery', 'POST', { structuredQuery: { from: [{ collectionId: name }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encode(value) } } } });
                if (!Array.isArray(result)) throw new Error('Consulta incompleta.');
                const docs = result.filter(r => r.document).map(r => this.snapshot(this.doc(name + '/' + r.document.name.split('/').pop()), r.document));
                return { docs, forEach: callback => docs.forEach(callback) };
            } };
        } };
    }
    write(ref, data, type) {
        const w = { update: { name: this.base + '/' + ref.path, fields: fields(data) } };
        if (type === 'create') w.currentDocument = { exists: false };
        if (type === 'update') { w.currentDocument = { exists: true }; w.updateMask = { fieldPaths: Object.keys(data) }; }
        return w;
    }
    commit(writes, transaction) { return this.api(this.base + ':commit', 'POST', { writes, ...(transaction ? { transaction } : {}) }); }
    async runTransaction(callback) {
        for (let attempt = 0; attempt < 4; attempt++) {
            const { transaction } = await this.api(this.base + ':beginTransaction', 'POST', { options: { readWrite: {} } });
            if (typeof transaction !== 'string' || !transaction) throw new Error('Transação não iniciada.');
            const writes = []; let wrote = false;
            const read = async ref => { if (wrote) throw new Error('Leitura após escrita na transação.'); return this.read(ref, transaction); };
            const queue = type => (ref, data) => { wrote = true; writes.push(this.write(ref, data, type)); };
            try {
                const result = await callback({ get: read, getAll: async (...refs) => { if (wrote) throw new Error('Leitura após escrita na transação.'); return this.batch(refs, transaction); }, create: queue('create'), set: queue('set'), update: queue('update') });
                await this.commit(writes, transaction); return result;
            } catch (e) {
                try { await this.api(this.base + ':rollback', 'POST', { transaction }); } catch (_) {}
                if (e.status !== 409 || attempt === 3) throw e;
            }
        }
    }
}
// Cada requisição tem sua identidade isolada; nenhum token de usuário vira credencial administrativa.
const getFirestore = () => new Proxy({}, { get(_, name) { const db = new Database(environment()); const fn = db[name]; return typeof fn === 'function' ? fn.bind(db) : fn; } });
module.exports = { Timestamp, getFirestore, Database, encode, decode, fields, decodeFields, accessToken };
