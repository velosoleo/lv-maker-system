'use strict';

const { Database, Timestamp, accessToken } = require('./firestore.cjs');

const pedidoValido = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(id);
const moeda = valor => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function enviarFCM(env, token, data, request = fetch) {
    const acesso = await accessToken(env);
    const response = await request(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, data, webpush: { headers: { Urgency: 'high' } } } }),
        signal: AbortSignal.timeout(15000)
    });
    if (response.ok) return { ok: true };
    let codigo = '';
    try {
        const body = await response.json();
        codigo = body?.error?.details?.find(item => item['@type']?.endsWith('FcmError'))?.errorCode || '';
    } catch (_) {}
    if (['UNREGISTERED', 'INVALID_ARGUMENT'].includes(codigo)) return { ok: false, invalido: true };
    const error = new Error(response.status === 403 ? 'Envio de notificações não autorizado.' : 'Notificação não confirmada pelo Firebase.');
    error.status = response.status;
    throw error;
}

async function notificarNovoPedido(env, pedidoId, request = fetch) {
    if (!pedidoValido(pedidoId)) throw Object.assign(new Error('Código do pedido inválido.'), { code: 'invalid-argument' });
    const db = new Database(env, request);
    const pedidoRef = db.doc(`pedidosCatalogo/${pedidoId}`);
    const configRef = db.doc('configuracoes/checkout');
    const marcadorRef = db.doc(`notificacoesPush/${pedidoId}`);
    const [pedidoDoc, configDoc] = await db.getAll(pedidoRef, configRef);
    if (!pedidoDoc.exists) throw Object.assign(new Error('Pedido não encontrado.'), { code: 'not-found' });
    const pedido = pedidoDoc.data();
    const usuario = configDoc.data()?.usuario;
    if (pedido.origem !== 'catalogo' || !usuario) throw Object.assign(new Error('Pedido indisponível para notificação.'), { code: 'failed-precondition' });

    const deveEnviar = await db.runTransaction(async transaction => {
        const marcador = await transaction.get(marcadorRef);
        const anterior = marcador.data();
        if (anterior?.status === 'enviado') return false;
        const agora = Timestamp.now();
        if (anterior?.status === 'enviando' && anterior.atualizadoEm?.toMillis() > agora.toMillis() - 60000) return false;
        const dados = { pedidoId, usuario, status: 'enviando', atualizadoEm: agora };
        if (marcador.exists) transaction.update(marcadorRef, dados);
        else transaction.create(marcadorRef, { ...dados, criadoEm: agora });
        return true;
    });
    if (!deveEnviar) return { enviado: true, repetido: true };

    try {
        const registros = await db.collection('pushTokens').where('usuario', '==', usuario).get();
        const ativos = registros.docs.filter(doc => doc.data().ativo === true && typeof doc.data().token === 'string');
        const quantidade = Array.isArray(pedido.itens) ? pedido.itens.reduce((soma, item) => soma + Number(item.qtd || 0), 0) : 0;
        const data = {
            title: 'Novo pedido da loja virtual',
            body: `${String(pedido.cliente || 'Cliente').slice(0, 80)} · ${quantidade} ${quantidade === 1 ? 'item' : 'itens'} · ${moeda(pedido.total)}`,
            url: `/index.html?aba=producao&pedidoCatalogo=${encodeURIComponent(pedidoId)}`,
            tag: `pedido-${pedidoId}`,
            pedidoId
        };
        let enviados = 0;
        for (const doc of ativos) {
            const resultado = await enviarFCM(env, doc.data().token, data, request);
            if (resultado.ok) enviados++;
            else if (resultado.invalido) await doc.ref.update({ ativo: false, invalidadoEm: Timestamp.now() });
        }
        await marcadorRef.update({ status: 'enviado', enviados, atualizadoEm: Timestamp.now() });
        return { enviado: true, aparelhos: enviados };
    } catch (erro) {
        await marcadorRef.update({ status: 'erro', atualizadoEm: Timestamp.now() }).catch(() => {});
        throw erro;
    }
}

module.exports = { notificarNovoPedido, enviarFCM };
