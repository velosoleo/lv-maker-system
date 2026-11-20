import backend from '../index.js';
import context from './context.cjs';
import authentication from './auth.cjs';
import push from './push.cjs';

const codes = { 'invalid-argument': 400, 'failed-precondition': 400, 'already-exists': 409, 'not-found': 404, 'permission-denied': 403, 'unauthenticated': 401, 'resource-exhausted': 429, aborted: 409, unavailable: 503, internal: 500 };
const json = (data, status, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
async function bodyJSON(request) {
    if (!request.body) return {};
    const reader = request.body.getReader(); const chunks = []; let size = 0;
    try {
        while (true) { const r = await reader.read(); if (r.done) break; size += r.value.byteLength; if (size > 65536) throw new Error('too-large'); chunks.push(r.value); }
    } catch (e) { await reader.cancel().catch(() => {}); throw e; }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, provider: 'cloudflare', ready: !!env.FIREBASE_SERVICE_ACCOUNT, shippingReady: !!env.MELHOR_ENVIO_TOKEN }, 200);
        const webhook = url.pathname === '/api/infinitepay';
        const name = url.pathname.match(/^\/rpc\/([a-zA-Z][a-zA-Z0-9]{0,70})$/)?.[1];
        const pushPedido = name === 'notificarNovoPedido';
        if (!webhook && (!name || (!pushPedido && !backend[name]?.callable))) return json({ error: { status: 'NOT_FOUND', message: 'Recurso não encontrado.' } }, 404);
        const origin = request.headers.get('origin');
        const allowed = [env.CHECKOUT_SITE_URL, 'https://lv-maker.firebaseapp.com'];
        if (origin && !allowed.includes(origin)) return json({ error: { status: 'PERMISSION_DENIED', message: 'Origem não autorizada.' } }, 403);
        const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
        if (request.method === 'OPTIONS' && !webhook) return new Response(null, { status: 204, headers: { ...cors,
            'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Firebase-AppCheck,Firebase-Instance-ID-Token', 'Access-Control-Max-Age': '600' } });
        if (request.method !== 'POST') return json({ error: { status: 'INVALID_ARGUMENT', message: 'Método inválido.' } }, 405, cors);
        if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return json({ error: { status: 'INVALID_ARGUMENT', message: 'Formato inválido.' } }, 400, cors);
        return context.scope.run(env, async () => {
            let identity;
            try {
                const body = await bodyJSON(request);
                if (webhook) {
                    let status = 200, result = '', headers = { ...cors, 'Cache-Control': 'no-store' };
                    const res = { set(key, value) { headers[key] = value; return this; }, status(code) { status = code; return this; }, send(value) { result = value; return this; } };
                    await backend.webhookInfinitepay({ method: request.method, body, query: Object.fromEntries(url.searchParams) }, res);
                    return new Response(result, { status, headers });
                }
                try { identity = await authentication.verifyRequest(request, env); }
                catch (_) { return json({ error: { status: 'UNAUTHENTICATED', message: 'Não foi possível validar seu acesso. Recarregue a página.' } }, 401, cors); }
                if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'data') || Object.keys(body).some(k => k !== 'data')) return json({ error: { status: 'INVALID_ARGUMENT', message: 'Solicitação inválida.' } }, 400, cors);
                if (name === 'criarPagamento' && !/^https:\/\/lv-maker-integracoes\.[a-z0-9-]+\.workers\.dev$/.test(env.CHECKOUT_WEBHOOK_BASE_URL || '')) return json({ error: { status: 'FAILED_PRECONDITION', message: 'A loja ainda está conectando a confirmação de pagamento.' } }, 400, cors);
                if (pushPedido) return json({ result: await push.notificarNovoPedido(env, body.data?.pedidoId) }, 200, cors);
                const rawRequest = { ip: request.headers.get('cf-connecting-ip') || 'desconhecido' };
                const data = await backend[name]({ ...identity, data: body.data, rawRequest });
                return json({ result: data }, 200, cors);
            } catch (e) {
                const problemasConfiguracao = {
                    'Identidade do servidor não configurada.': 'A chave de acesso ao Firebase não foi cadastrada corretamente no servidor.',
                    'Identidade de outro projeto ou inválida.': 'A chave de acesso ao Firebase não corresponde ao projeto desta loja.',
                    'Não foi possível autenticar o servidor.': 'O Google não aceitou a chave de acesso ao Firebase. Confira se a conta e a chave continuam ativas.',
                    'Operação no banco não confirmada.': e.status === 403 ? 'A conta de serviço não conseguiu acessar o Firestore. Confira o papel Cloud Datastore User no projeto lv-maker.' : 'O Firestore não confirmou a consulta. Tente novamente após conferir o serviço.',
                    'Envio de notificações não autorizado.': 'A conta de serviço precisa da permissão Firebase Cloud Messaging API Admin.',
                    'Notificação não confirmada pelo Firebase.': 'O Firebase não confirmou o envio da notificação. Tente novamente.',
                    'Configuração da integração incompleta.': 'Falta um parâmetro obrigatório na configuração do serviço.'
                };
                if (Object.hasOwn(problemasConfiguracao, e.message)) return json({ error: { status: 'FAILED_PRECONDITION', message: problemasConfiguracao[e.message] } }, 400, cors);
                const code = Object.hasOwn(codes, e.code) ? e.code : 'internal';
                return json({ error: { status: code.toUpperCase().replace(/-/g, '_'), message: code === 'internal' ? 'A integração não confirmou a operação. Consulte antes de repetir.' : e.message,
                    ...(code !== 'internal' && e.details ? { details: e.details } : {}) } }, codes[code], cors);
            }
        });
    }
};
