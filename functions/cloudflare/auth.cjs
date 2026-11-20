'use strict';
const jwksCache = new Map();
const keyCache = new Map();
async function verifyJWT(token, config, request = fetch) {
    if (typeof token !== 'string' || token.length > 12000) throw new Error('Token inválido.');
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Token inválido.');
    let header, claims;
    try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch (_) { throw new Error('Token inválido.'); }
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string' || header.kid.length > 150
        || claims.iss !== config.issuer || !audiences.includes(config.audience)
        || !Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.iat) || claims.iat > now + 30
        || (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now + 30))
        || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128
        || (config.subject && claims.sub !== config.subject)) throw new Error('Token inválido.');
    let cache = jwksCache.get(config.jwksURL);
    if (!cache || cache.expires <= Date.now()) {
        const r = await request(config.jwksURL, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error('Verificação temporariamente indisponível.');
        const data = await r.json();
        if (!Array.isArray(data.keys)) throw new Error('Verificação temporariamente indisponível.');
        const age = Math.min(21600, Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 300));
        cache = { keys: data.keys, expires: Date.now() + age * 1000 }; jwksCache.set(config.jwksURL, cache);
        keyCache.clear();
    }
    const jwk = cache.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) throw new Error('Token inválido.');
    const keyId = config.jwksURL + ':' + header.kid;
    let key = keyCache.get(keyId);
    if (!key) { key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']); keyCache.set(keyId, key); }
    const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(parts[2], 'base64url'), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!verified) throw new Error('Token inválido.');
    return claims;
}
async function verifyRequest(request, env) {
    const app = await verifyJWT(request.headers.get('x-firebase-appcheck'), {
        issuer: 'https://firebaseappcheck.googleapis.com/' + env.FIREBASE_PROJECT_NUMBER,
        audience: 'projects/' + env.FIREBASE_PROJECT_NUMBER, subject: env.FIREBASE_APP_ID,
        jwksURL: 'https://firebaseappcheck.googleapis.com/v1/jwks'
    });
    const header = request.headers.get('authorization');
    let auth;
    if (header) {
        if (!header.startsWith('Bearer ')) throw new Error('Token inválido.');
        const token = await verifyJWT(header.slice(7), { issuer: 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID,
            audience: env.FIREBASE_PROJECT_ID, jwksURL: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com' });
        if (!Number.isInteger(token.auth_time) || token.auth_time > Math.floor(Date.now() / 1000) + 30) throw new Error('Token inválido.');
        auth = { uid: token.sub, token };
    }
    return { app: { appId: app.sub }, ...(auth ? { auth } : {}) };
}
module.exports = { verifyJWT, verifyRequest };
