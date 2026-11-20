'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString, defineBoolean } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const frete = require('./frete');
const { consultarCep } = require('./cep');
initializeApp();
const db = getFirestore();
Object.assign(exports, require('./checkout')(db));
const tokenMelhorEnvio = defineSecret('MELHOR_ENVIO_TOKEN');
const sandbox = defineBoolean('MELHOR_ENVIO_SANDBOX', { default: true });
const contato = defineString('MELHOR_ENVIO_CONTATO', { default: 'velosoleo@live.com' });
Object.assign(exports, require('./envios')(db, { token: tokenMelhorEnvio, sandbox, contato }));

async function jsonSeguro(url, options = {}) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
        const erro = new Error('Serviço de entrega temporariamente indisponível.'); erro.httpStatus = response.status;
        try {
            const dados = await response.json();
            erro.camposInvalidos = Object.keys(dados?.errors || {}).filter(campo => /^(from|to|products|options)(\.[a-z_]+|\.\d+)*$/.test(campo));
        } catch (_) {}
        throw erro;
    }
    try { return await response.json(); }
    catch (_) { const erro = new Error('Resposta de entrega inválida.'); erro.respostaInvalida = true; throw erro; }
}
async function cotarFrete(request, consultarTransportadoras = true) {
    let itens;
    const cep = String(request.data?.cep || '').replace(/\D/g, '');
    try {
        if (!/^[0-9]{8}$/.test(cep)) throw new Error('Informe um CEP de destino com 8 dígitos.');
        itens = frete.itensSolicitados(request.data?.itens);
    } catch (erro) { throw new HttpsError('invalid-argument', erro.message); }
    const cfgDoc = await db.collection('configuracoes').doc('checkout').get();
    if (!cfgDoc.exists) throw new HttpsError('failed-precondition', 'A loja ainda está preparando as opções de entrega.');
    const config = cfgDoc.data();
    if (!/^[0-9]{8}$/.test(config.cepOrigem || '') || !config.usuario) throw new HttpsError('failed-precondition', 'Configuração de envio incompleta.');
    const admin = await db.collection('admins').doc(config.usuario).get();
    if (!admin.exists) throw new HttpsError('failed-precondition', 'Responsável pela loja indisponível.');
    const refs = itens.map(item => db.collection('produtos').doc(item.produtoId));
    const docs = await db.getAll(...refs);
    let produtos;
    try { produtos = frete.produtosConferidos(itens, docs.map(doc => doc.exists ? doc.data() : null)); }
    catch (erro) { throw new HttpsError('failed-precondition', erro.message); }
    let destino;
    try {
        destino = await consultarCep(cep);
        if (destino.erro || !destino.localidade || !destino.uf) throw new Error('CEP não encontrado.');
    } catch (_) { throw new HttpsError('unavailable', 'Não foi possível confirmar o CEP. Confira e tente novamente.'); }
    let opcoes;
    try { opcoes = frete.opcoesProprias(config, destino, produtos); }
    catch (_) { throw new HttpsError('failed-precondition', 'A loja precisa conferir a configuração da promoção de entrega.'); }
    let aviso = '';
    if (config.transportadoraHabilitada === true && consultarTransportadoras) {
        let etapa = 'remetente';
        try {
            const remetente = require('./etiqueta').pessoa(config.remetente);
            if (remetente.postal_code !== config.cepOrigem) throw new Error('CEP de origem diferente do remetente.');
            etapa = 'embalagem';
            const payload = { from: { postal_code: config.cepOrigem }, to: { postal_code: cep },
                products: frete.produtosParaFrete(produtos), options: { receipt: false, own_hand: false } };
            const email = contato.value();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new Error('Contato da integração não configurado.');
            const base = sandbox.value() ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
            etapa = 'provedor';
            const resposta = await jsonSeguro(base + '/api/v2/me/shipment/calculate', { method: 'POST',
                headers: { Authorization: `Bearer ${tokenMelhorEnvio.value()}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': `LV Maker (${email})` },
                body: JSON.stringify(payload) });
            const habilitados = new Set((config.servicosEnvio || []).filter(s => s.ponto?.trim()).map(s => s.id));
            const cotacoes = frete.opcoesTransportadoras(resposta).filter(o => habilitados.has(o.servicoId));
            opcoes.push(...cotacoes);
            aviso = frete.avisoTransportadoras(resposta, habilitados, cotacoes);
        } catch (erro) {
            aviso = typeof erro.message === 'string' && erro.message.startsWith('As medidas de envio de ')
                ? erro.message
                : etapa === 'remetente' ? 'Confira os dados completos do remetente em Entregas, incluindo documento, telefone e CEP de origem.'
                : erro.respostaInvalida ? 'Melhor Envio devolveu uma resposta inválida ao calcular o frete. Nenhuma cobrança foi criada.'
                : erro.httpStatus === 401 || erro.httpStatus === 403 ? 'Melhor Envio recusou a consulta de frete. Confira a validade do token e a permissão shipping-calculate.'
                : erro.httpStatus === 400 || erro.httpStatus === 422 ? 'Melhor Envio recusou os dados da cotação. Confira ' + (erro.camposInvalidos?.length
                    ? [...new Set(erro.camposInvalidos.map(campo => campo.startsWith('from') ? 'o CEP de origem' : campo.startsWith('to') ? 'o CEP de destino' : campo.startsWith('products') ? 'o peso e as medidas da embalagem' : 'as opções de envio'))].join(' e ') + '.'
                    : 'o CEP de origem, peso em kg e medidas em cm da embalagem.')
                : erro.message === 'Não foi possível obter as opções de frete.' ? 'Melhor Envio não retornou uma lista válida de serviços para esta cotação.'
                : 'Envio por transportadora indisponível agora. Confira a conexão do Melhor Envio e tente novamente.';
        }
    }
    if (!opcoes.length) throw new HttpsError('failed-precondition', aviso || 'Ainda não há uma opção de entrega configurada para este CEP.');
    const subtotalCentavos = produtos.reduce((total, p) => total + p.precoCentavos * p.qtd, 0);
    if (!Number.isSafeInteger(subtotalCentavos) || subtotalCentavos <= 0 || subtotalCentavos > 10000000) throw new HttpsError('failed-precondition', 'Valor do carrinho inválido.');
    const ref = db.collection('cotacoesFrete').doc();
    const ambiente = consultarTransportadoras && config.transportadoraHabilitada && sandbox.value() ? 'sandbox' : 'producao';
    const expiraEm = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    // A futura cobrança deve consumir esta cotação e conferir a validade no servidor.
    await ref.set({ usuario: config.usuario, cep, itens: produtos, opcoes, subtotalCentavos,
        aviso, destino: { bairro: destino.bairro || '', localidade: destino.localidade, uf: destino.uf },
        criadoEm: Timestamp.now(), expiraEm, ambiente });
    return { cotacaoId: ref.id, expiraEm: expiraEm.toMillis(), subtotalCentavos, opcoes, aviso,
        cidade: destino.localidade, uf: destino.uf, rua: destino.logradouro || '', bairro: destino.bairro || '', prazoProducaoDias: frete.prazoProducao(produtos),
        ambiente };
}
const opcoesCotacao = { region: 'southamerica-east1', enforceAppCheck: true, maxInstances: 3, concurrency: 10, timeoutSeconds: 40 };
exports.cotarFrete = onCall({ ...opcoesCotacao, secrets: [tokenMelhorEnvio] }, request => cotarFrete(request));
exports.cotarEntregaLocal = onCall(opcoesCotacao, request => cotarFrete(request, false));
