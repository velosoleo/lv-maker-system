'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { Timestamp } = require('firebase-admin/firestore');
const crypto = require('node:crypto');
const etiqueta = require('./etiqueta');
const { consultarCep } = require('./cep');
const { diagnostico } = require('./envio-erros');
const uuid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const empresasSuportadas = /^(Correios|Jadlog|Loggi|J&T(?: Express)?)$/i;
module.exports = (db, integracao) => {
    const options = { region: 'southamerica-east1', enforceAppCheck: true, secrets: [integracao.token], maxInstances: 3, concurrency: 10, timeoutSeconds: 120 };
    const ambiente = () => integracao.sandbox.value() ? 'sandbox' : 'producao';
    async function api(path, method = 'GET', data) {
        const email = integracao.contato.value();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) throw new HttpsError('failed-precondition', 'Contato da integração não configurado.');
        const base = ambiente() === 'sandbox' ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
        try {
            const r = await fetch(base + '/api/v2/me/' + path, { method,
                headers: { Authorization: 'Bearer ' + integracao.token.value(), Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': `LV Maker (${email})` },
                ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
            if (!r.ok) {
                if (method !== 'GET') {
                    let resposta;
                    try { resposta = await r.json(); } catch (_) {}
                    const erro = diagnostico(r.status, path, resposta, data);
                    throw new HttpsError('unavailable', erro.mensagem, erro);
                }
                const consulta = method === 'GET';
                const mensagem = r.status === 401 ? 'Melhor Envio recusou a credencial. Confira se o token está válido na conta e no ambiente configurado.'
                    : r.status === 403 ? 'Melhor Envio recusou o acesso a esta consulta. Confira as permissões do token para transportadoras e agências.'
                    : r.status === 429 ? 'Melhor Envio limitou as consultas. Aguarde um pouco antes de tentar novamente.'
                    : consulta ? 'Melhor Envio não confirmou a consulta de pontos ou serviços. Não houve compra de etiqueta. Confira a conexão ou tente mais tarde.'
                    : 'Melhor Envio não confirmou a operação. Confira a conexão, as permissões, os documentos e o saldo da sua carteira.';
                throw new HttpsError('unavailable', mensagem, { httpStatus: r.status });
            }
            try { return await r.json(); }
            catch (_) { throw new HttpsError('unavailable', 'Melhor Envio respondeu em um formato inesperado à consulta. Tente novamente mais tarde ou confira os pontos no painel do Melhor Envio.', { httpStatus: r.status }); }
        } catch (erro) {
            if (erro instanceof HttpsError) throw erro;
            throw new HttpsError('unavailable', method === 'GET' ? 'Não foi possível consultar os pontos ou serviços do Melhor Envio. Confira a conexão e tente novamente. Nenhuma etiqueta foi comprada.' : 'Melhor Envio não confirmou a operação. Confira a conexão, as permissões, os documentos e o saldo da sua carteira.');
        }
    }
    async function loja(request) {
        const uid = request.auth?.uid;
        if (!uid || !(await db.doc('admins/' + uid).get()).exists) throw new HttpsError('permission-denied', 'Acesso de administrador necessário.');
        const cfg = (await db.doc('configuracoes/checkout').get()).data();
        if (!cfg || cfg.usuario !== uid) throw new HttpsError('permission-denied', 'Configuração de outra loja.');
        return cfg;
    }
    async function compra(request) {
        const cfg = await loja(request);
        const checkoutId = request.data?.checkoutId;
        if (!uuid(checkoutId)) throw new HttpsError('invalid-argument', 'Pedido inválido.');
        const c = (await db.doc('checkouts/' + checkoutId).get()).data();
        if (!c || c.usuario !== request.auth.uid || c.status !== 'pago' || c.entrega?.tipo !== 'transportadora') throw new HttpsError('failed-precondition', 'Pedido pago com transportadora não encontrado.');
        if (c.estoquePendente) throw new HttpsError('failed-precondition', 'Confira o estoque deste pedido antes de despachar.');
        return { cfg, c, checkoutId, ref: db.doc('envios/' + checkoutId) };
    }
    const consultarConexaoEnvio = onCall(options, async request => {
        await loja(request);
        const resposta = await api('shipment/services');
        if (!Array.isArray(resposta)) throw new HttpsError('unavailable', 'Lista de serviços indisponível.');
        return { ambiente: ambiente(), servicos: resposta.filter(s => empresasSuportadas.test(s.company?.name || '')).map(s => ({ id: Number(s.id), nome: `${s.company.name} ${s.name}`, empresaId: Number(s.company.id) })) };
    });
    const listarPontosEnvio = onCall(options, async request => {
        await loja(request);
        const empresa = Number(request.data?.empresaId);
        const cidade = String(request.data?.cidade || 'Guaramirim').trim();
        if (!Number.isInteger(empresa) || empresa < 1 || cidade.length < 2 || cidade.length > 100) throw new HttpsError('invalid-argument', 'Transportadora ou cidade inválida.');
        const dados = await api('shipment/agencies?' + new URLSearchParams({ company: String(empresa), country: 'BR', state: 'SC', city: cidade }));
        const agencias = Array.isArray(dados) ? dados : dados?.data;
        if (!Array.isArray(agencias)) throw new HttpsError('unavailable', 'Lista de pontos indisponível.');
        return { pontos: agencias.filter(a => a.status === 'available').map(a => ({ id: Number(a.id), empresaId: Number(a.company_id),
            nome: String(a.name || '').slice(0, 150), endereco: [a.address?.address, a.address?.number, a.address?.district, a.address?.city?.city].filter(Boolean).join(', ').slice(0, 400) })) };
    });
    const prepararEnvio = onCall(options, async request => {
        const { cfg, c, checkoutId, ref } = await compra(request);
        const pedidos = await Promise.all(c.itens.map((_, n) => db.doc(`pedidos/ip_${checkoutId}_${n}`).get()));
        if (pedidos.some(doc => !doc.exists || doc.data().usuario !== request.auth.uid || !['Pronto', 'Entregue'].includes(doc.data().status))) {
            throw new HttpsError('failed-precondition', 'Este pedido ainda tem itens aguardando produção. Marque todos os itens como Pronto antes de preparar o envio conjunto.');
        }
        let payload;
        // A cidade e o estado vêm do CEP confirmado, nunca de um campo livre.
        let destino;
        try {
            destino = await consultarCep(c.cliente.endereco.cep);
        } catch (_) { throw new HttpsError('unavailable', 'Não foi possível confirmar o CEP de destino.'); }
        try { payload = etiqueta.payload(c, cfg, { ...request.data, checkoutId, cidadeDestino: destino.localidade, ufDestino: destino.uf }); }
        catch (e) { throw new HttpsError('invalid-argument', e.message); }
        const services = await api('shipment/services');
        const service = Array.isArray(services) && services.find(s => Number(s.id) === payload.service);
        if (!service || !empresasSuportadas.test(service.company?.name || '')) throw new HttpsError('failed-precondition', 'Transportadora ainda não suportada para etiquetas nesta integração.');
        if (!payload.options.invoice && service.company.name !== 'Correios') {
            const limiteSeguro = service.company.name === 'Jadlog' ? 1500 : 1000;
            if (payload.options.insurance_value > limiteSeguro) throw new HttpsError('failed-precondition', 'O valor declarado supera o limite de declaração deste serviço. Confira outra transportadora ou o documento fiscal.');
        }
        const ponto = cfg.servicosEnvio.find(s => s.id === payload.service);
        if (ponto.agenciaId) {
            const agencia = await api('shipment/agencies/' + ponto.agenciaId);
            if (Number(agencia.company_id) !== Number(service.company.id) || agencia.status !== 'available') throw new HttpsError('failed-precondition', 'Ponto de postagem indisponível para esta transportadora.');
            payload.agency = Number(ponto.agenciaId);
        }
        const seguro = payload.options.insurance_value;
        const cotacoes = await api('shipment/calculate', 'POST', { from: { postal_code: payload.from.postal_code }, to: { postal_code: payload.to.postal_code },
            volumes: payload.volumes.map(v => ({ ...v, insurance: seguro })), services: String(payload.service), options: { receipt: false, own_hand: false } });
        // A consulta filtrada por um serviço também pode devolver um objeto único.
        const listaCotacoes = Array.isArray(cotacoes) ? cotacoes : cotacoes && typeof cotacoes === 'object' && cotacoes.id != null ? [cotacoes] : [];
        const cotacao = listaCotacoes.find(s => Number(s.id) === payload.service && !s.error);
        if (!cotacao) {
            const motivo = require('./frete').avisoTransportadoras(listaCotacoes, new Set([payload.service]), []);
            throw new HttpsError('failed-precondition', motivo + ' Confira as medidas externas e o peso da embalagem pronta. Nenhuma etiqueta foi comprada.');
        }
        const custoCentavos = etiqueta.centavos(cotacao.custom_price ?? cotacao.price);
        const revisao = crypto.randomUUID();
        await db.runTransaction(async tx => {
            const existente = (await tx.get(ref)).data();
            const atual = (await tx.get(db.doc('configuracoes/checkout'))).data();
            if (JSON.stringify(atual) !== JSON.stringify(cfg)) throw new HttpsError('failed-precondition', 'O remetente ou as opções mudaram. Prepare o envio novamente.');
            if (existente && !['preparado', 'recusado'].includes(existente.status)) throw new HttpsError('failed-precondition', 'Envio já iniciado. Use a consulta para continuar o mesmo envio.');
            if (existente?.orderId || existente?.operacao) throw new HttpsError('failed-precondition', 'Envio já iniciado. Consulte antes de preparar outro.');
            tx.set(ref, { usuario: request.auth.uid, checkoutId, payload, ponto: String(ponto.ponto).slice(0, 500), custoCentavos,
                documentoFiscal: payload.options.invoice ? 'nota' : 'declaracao',
                dispensaNotaConfirmada: !payload.options.invoice, conferidoPor: request.auth.uid,
                ambiente: ambiente(), status: 'preparado', revisao, expiraEm: Timestamp.fromMillis(Date.now() + 10 * 60000), atualizadoEm: Timestamp.now() });
        });
        return { revisao, custoCentavos, freteRecebidoCentavos: c.entrega.precoCentavos, ponto: ponto.ponto, ambiente: ambiente() };
    });
    async function sincronizar(ref, envio) {
        if (!envio.orderId) return envio;
        if (envio.ambiente !== ambiente()) throw new HttpsError('failed-precondition', 'O ambiente mudou. Confira este envio na conta onde ele foi criado.');
        const dados = await api('orders/' + envio.orderId);
        if (dados.id !== envio.orderId || dados.reminder !== 'LV Maker ' + envio.checkoutId || Number(dados.service_id) !== envio.payload.service || String(dados.to?.postal_code || '').replace(/\D/g, '') !== envio.payload.to.postal_code) throw new HttpsError('failed-precondition', 'Etiqueta não corresponde ao pedido.');
        const gerado = !!dados.generated_at;
        const geracaoSolicitada = envio.geracaoSolicitada === true || envio.status === 'gerado' || envio.status === 'gerando';
        const diagnosticoResolvido = (envio.diagnostico?.etapa === 'pagar etiqueta' && !!dados.paid_at)
            || envio.diagnostico?.etapa === 'criar envio' || (envio.diagnostico?.etapa === 'gerar etiqueta' && gerado);
        const changes = { statusTransportadora: String(dados.status || '').slice(0, 50), custoAtualCentavos: etiqueta.centavos(dados.price),
            rastreio: String(dados.tracking || dados.self_tracking || '').slice(0, 100), pagoNoMelhorEnvio: !!dados.paid_at,
            gerado, geracaoSolicitada, status: gerado ? 'gerado' : geracaoSolicitada ? 'gerando' : 'conferir',
            ...(diagnosticoResolvido ? { diagnostico: null } : {}), atualizadoEm: Timestamp.now() };
        await ref.update(changes);
        return { ...envio, ...changes };
    }
    const consultarEnvio = onCall(options, async request => {
        const { ref } = await compra(request);
        const existente = (await ref.get()).data();
        if (!existente) return { existe: false };
        if (existente.operacao && existente.operacaoEm?.toMillis() < Date.now() - 180000) {
            await db.runTransaction(async tx => {
                const atual = (await tx.get(ref)).data();
                if (atual.operacao === existente.operacao) tx.update(ref, { operacao: null, status: atual.orderId ? 'conferir' : 'incerto' });
            });
            existente.operacao = null;
            existente.status = existente.orderId ? 'conferir' : 'incerto';
        }
        const envio = await sincronizar(ref, existente);
        return { existe: true, status: envio.status, statusTransportadora: envio.statusTransportadora || '',
            custoCentavos: envio.custoAtualCentavos ?? envio.custoCentavos, ponto: envio.ponto, rastreio: envio.rastreio || '',
            diagnostico: envio.diagnostico?.mensagem || '',
            geracaoSolicitada: envio.geracaoSolicitada === true,
            documentoFiscal: envio.documentoFiscal || 'nota', revisao: envio.revisao, ambiente: envio.ambiente, orderId: envio.orderId || null, pago: envio.pagoNoMelhorEnvio === true, gerado: envio.gerado === true };
    });
    const contratarEnvio = onCall(options, async request => {
        const { ref, c } = await compra(request);
        const limite = request.data?.limiteCentavos;
        if (!Number.isSafeInteger(limite) || limite < 0 || limite > 10000000 || request.data?.confirmarCompra !== true) throw new HttpsError('invalid-argument', 'Confirme o custo da etiqueta antes de contratar.');
        let envio;
        const operacao = crypto.randomUUID();
        await db.runTransaction(async tx => {
            envio = (await tx.get(ref)).data();
            if (!envio || envio.ambiente !== ambiente() || envio.revisao !== request.data.revisao) throw new HttpsError('failed-precondition', 'Prepare e confira o envio novamente.');
            if (envio.operacao) throw new HttpsError('aborted', 'Operação já iniciada. Consulte antes de tentar novamente.');
            if (request.data?.somenteGerar === true && !envio.orderId) throw new HttpsError('failed-precondition', 'Envio ainda não criado. Consulte a situação antes de continuar.');
            if (!envio.orderId && envio.status !== 'preparado') throw new HttpsError('failed-precondition', 'Resposta anterior incerta. Confira a etiqueta no Melhor Envio antes de continuar.');
            if (!envio.orderId && envio.expiraEm.toMillis() < Date.now()) throw new HttpsError('failed-precondition', 'A cotação expirou. Prepare novamente.');
            if ((envio.custoAtualCentavos ?? envio.custoCentavos) > limite) throw new HttpsError('failed-precondition', 'O custo supera o valor que você confirmou.');
            if (c.estoquePendente) throw new HttpsError('failed-precondition', 'Estoque pendente de conferência.');
            tx.update(ref, { operacao, operacaoEm: Timestamp.now(), status: envio.orderId ? 'continuando' : 'iniciando', atualizadoEm: Timestamp.now() });
        });
        try {
            if (!envio.orderId) {
                const r = await api('cart', 'POST', envio.payload);
                if (!uuid(r.id)) throw new HttpsError('unavailable', 'Identificador da etiqueta não confirmado.');
                envio.orderId = r.id;
                await ref.update({ orderId: r.id, status: 'carrinho' });
            }
            envio = await sincronizar(ref, envio);
            if (['canceled', 'expired'].includes(envio.statusTransportadora)) throw new HttpsError('failed-precondition', 'Esta etiqueta foi cancelada ou expirou. Confira no Melhor Envio.');
            if (!envio.pagoNoMelhorEnvio) {
                if (request.data?.somenteGerar === true) throw new HttpsError('failed-precondition', 'O pagamento ainda não foi confirmado pelo Melhor Envio. Atualize a situação; nenhuma nova cobrança foi feita.');
                if (envio.custoAtualCentavos > limite) throw new HttpsError('failed-precondition', 'O preço mudou. Consulte o envio e confirme o novo custo antes de comprar.');
                await api('shipment/checkout', 'POST', { orders: [envio.orderId] });
                envio = await sincronizar(ref, envio);
                if (!envio.pagoNoMelhorEnvio) throw new HttpsError('unavailable', 'Pagamento da etiqueta aguardando confirmação. Consulte o envio; não crie outro.');
            }
            const ultimaGeracao = envio.geracaoSolicitadaEm?.toMillis?.() || 0;
            // Uma solicitação aceita não deve bloquear a continuação indefinidamente.
            // O clique sempre consulta primeiro e só repete a geração do mesmo ID após um minuto.
            if (!envio.gerado && (!envio.geracaoSolicitada || Date.now() - ultimaGeracao >= 60000)) {
                const r = await api('shipment/generate', 'POST', { orders: [envio.orderId] });
                if (r[envio.orderId]?.status !== true) throw new HttpsError('unavailable', 'A etiqueta ainda não foi liberada para impressão. Consulte e continue este mesmo envio.');
                // A aceitação inicia processamento assíncrono; não libera impressão ainda.
                const geracaoSolicitadaEm = Timestamp.now();
                await ref.update({ status: 'gerando', geracaoSolicitada: true, geracaoSolicitadaEm, atualizadoEm: geracaoSolicitadaEm });
                envio = await sincronizar(ref, { ...envio, status: 'gerando', geracaoSolicitada: true, geracaoSolicitadaEm });
            }
            await ref.update({ status: envio.gerado ? 'gerado' : 'gerando', operacao: null, atualizadoEm: Timestamp.now() });
            return { gerado: envio.gerado === true, orderId: envio.orderId };
        } catch (e) {
            await ref.update({ ...(envio.orderId ? { orderId: envio.orderId } : {}),
                ...(e.details?.etapa ? { diagnostico: e.details } : {}),
                status: envio.orderId ? 'conferir' : e.details?.httpStatus === 422 && e.details?.etapa === 'criar envio' ? 'recusado' : 'incerto', operacao: null, atualizadoEm: Timestamp.now() });
            throw e;
        }
    });
    const imprimirEnvio = onCall(options, async request => {
        const { ref } = await compra(request);
        const e = (await ref.get()).data();
        if (!e?.orderId) throw new HttpsError('failed-precondition', 'Envio ainda não criado.');
        const envio = await sincronizar(ref, e);
        if (!envio.gerado || ['canceled', 'expired'].includes(envio.statusTransportadora)) throw new HttpsError('failed-precondition', 'Etiqueta ainda não liberada ou indisponível.');
        const r = await api('shipment/print', 'POST', { orders: [e.orderId], mode: 'private' });
        if (!etiqueta.imprimirURL(r.url)) throw new HttpsError('unavailable', 'Link de impressão inválido.');
        return { url: r.url, ponto: e.ponto };
    });
    const vincularEnvio = onCall(options, async request => {
        const { ref } = await compra(request);
        const orderId = request.data?.orderId;
        if (!uuid(orderId)) throw new HttpsError('invalid-argument', 'Identificador inválido.');
        const e = (await ref.get()).data();
        if (!e || e.operacao || e.orderId || e.status !== 'incerto') throw new HttpsError('failed-precondition', 'Este envio não precisa de recuperação ou ainda está em andamento.');
        const confirmado = await sincronizar(ref, { ...e, orderId });
        await db.runTransaction(async tx => {
            const atual = (await tx.get(ref)).data();
            if (atual.operacao || atual.orderId || atual.revisao !== e.revisao) throw new HttpsError('aborted', 'O envio mudou. Consulte novamente.');
            tx.update(ref, { orderId, status: confirmado.gerado ? 'gerado' : 'conferir', atualizadoEm: Timestamp.now() });
        });
        return { vinculado: true };
    });
    const imprimirDeclaracao = onCall(options, async request => {
        const { ref } = await compra(request);
        const e = (await ref.get()).data();
        if (!e?.orderId || e.documentoFiscal !== 'declaracao') throw new HttpsError('failed-precondition', 'Este envio não usa declaração eletrônica.');
        const envio = await sincronizar(ref, e);
        if (!envio.gerado || ['canceled', 'expired'].includes(envio.statusTransportadora)) throw new HttpsError('failed-precondition', 'Envio ainda não liberado ou indisponível.');
        const r = await api('imprimir/dace/pdf/' + envio.orderId);
        if (!etiqueta.declaracaoURL(r.pdf)) throw new HttpsError('unavailable', 'PDF da declaração ainda não disponível. Confira a emissão no Melhor Envio; não despache somente com a etiqueta.');
        return { url: r.pdf };
    });
    return { consultarConexaoEnvio, listarPontosEnvio, prepararEnvio, consultarEnvio, contratarEnvio, imprimirEnvio, vincularEnvio, imprimirDeclaracao };
};
