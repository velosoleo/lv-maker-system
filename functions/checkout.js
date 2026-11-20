'use strict';
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { Timestamp } = require('firebase-admin/firestore');
const crypto = require('node:crypto');
const p = require('./pagamento');
const frete = require('./frete');
const promocao = require('./promocao');
const site = defineString('CHECKOUT_SITE_URL', { default: 'https://lv-maker.web.app' });
const webhookBase = defineString('CHECKOUT_WEBHOOK_BASE_URL', { default: '' });
const options = { region: 'southamerica-east1', enforceAppCheck: true, maxInstances: 3, concurrency: 10, timeoutSeconds: 60 };
async function api(path, data) {
    const r = await fetch('https://api.checkout.infinitepay.io/' + path, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
        const erro = new Error('InfinitePay indisponível agora. Tente novamente.');
        erro.httpStatus = r.status;
        throw erro;
    }
    return r.json();
}
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
module.exports = db => {
    async function config() {
        const doc = await db.doc('configuracoes/checkout').get();
        const c = doc.data();
        if (!c || !c.usuario || !(await db.doc('admins/' + c.usuario).get()).exists) throw new HttpsError('failed-precondition', 'Loja ainda preparando os pagamentos.');
        return c;
    }
    const opcoesCheckout = onCall(options, async () => {
        const c = await config();
        return { ativo: c.pagamentoAtivo === true && c.repasseConfirmado === true && /^[a-zA-Z0-9_.-]{1,100}$/.test(c.infiniteTag || ''),
            retirada: c.retiradaHabilitada === true, transportadoras: c.transportadoraHabilitada === true, promocao: promocao.configuracao(c.promocao) };
    });
    const criarPagamento = onCall(options, async request => {
        const d = request.data || {};
        if (!id(d.chave) || typeof d.token !== 'string' || !/^[a-f0-9]{64}$/.test(d.token)) throw new HttpsError('invalid-argument', 'Identificação de compra inválida.');
        const c = await config();
        if (!c.pagamentoAtivo || !c.repasseConfirmado || !/^[a-zA-Z0-9_.-]{1,100}$/.test(c.infiniteTag || '')) throw new HttpsError('failed-precondition', 'Pagamento online ainda não ativado.');
        const ref = db.doc('checkouts/' + d.chave);
        // Repetir o mesmo toque nunca cria uma segunda cobrança.
        const anterior = await ref.get();
        if (anterior.exists) {
            const a = anterior.data();
            if (a.tokenHash !== p.hash(d.token)) throw new HttpsError('permission-denied', 'Compra indisponível.');
            if (a.url) return { url: a.url, pedidoId: ref.id };
            throw new HttpsError('failed-precondition', 'Esta tentativa está sendo processada ou precisa de conferência. Não faça um novo pagamento; contate a loja.', { compraIniciada: true });
        }
        let itens, entrega, cliente, cotacao = null;
        try {
            itens = frete.itensSolicitados(d.itens);
            if (d.entregaId === 'retirada' && c.retiradaHabilitada) entrega = { id: 'retirada', tipo: 'retirada', nome: 'Retirada no local', precoCentavos: 0, prazoDias: 0 };
            else {
                if (!id(d.cotacaoId)) throw new Error('Calcule o frete antes de pagar.');
                cotacao = (await db.doc('cotacoesFrete/' + d.cotacaoId).get()).data();
                if (!cotacao || cotacao.usuario !== c.usuario || cotacao.expiraEm.toMillis() < Date.now() || cotacao.consumidaPor) throw new Error('O frete expirou. Calcule novamente.');
                entrega = cotacao.opcoes.find(o => o.id === d.entregaId);
                if (!entrega || (entrega.tipo === 'transportadora' && cotacao.ambiente !== 'producao')) throw new Error('Este frete de teste ainda não pode ser comprado.');
            }
            cliente = p.comprador(d.cliente, entrega);
            if (cotacao && cliente.endereco?.cep !== cotacao.cep) throw new Error('O CEP mudou. Calcule o frete novamente.');
            if (entrega.tipo === 'transportadora' && !c.transportadoraHabilitada) throw new Error('Envio por transportadora desativado.');
            if (entrega.tipo === 'transportadora' && !c.servicosEnvio?.some(s => s.id === entrega.servicoId && s.ponto?.trim())) throw new Error('Este serviço de entrega mudou. Calcule novamente.');
            if (entrega.tipo === 'transportadora') {
                const remetente = require('./etiqueta').pessoa(c.remetente);
                if (remetente.postal_code !== c.cepOrigem) throw new Error('A loja precisa conferir o CEP do remetente.');
            }
            if (entrega.tipo === 'local') {
                const normalizar = s => s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                if (frete.bairrosEntregaLocal(c.entregaLocal, cotacao.destino?.localidade).length && normalizar(cliente.endereco.bairro) !== normalizar(cotacao.destino.bairro)) throw new Error('A entrega mudou. Confira o bairro e calcule novamente.');
            }
        } catch (e) { throw new HttpsError('invalid-argument', e.message); }
        const webhookToken = crypto.randomBytes(32).toString('hex');
        const base = site.value().replace(/\/$/, '');
        if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(base)) throw new HttpsError('failed-precondition', 'Endereço da loja não configurado.');
        let compra;
        await db.runTransaction(async tx => {
            const existente = await tx.get(ref);
            if (existente.exists) throw new HttpsError('already-exists', 'Compra já iniciada. Tente novamente com a mesma identificação.');
            const configAtual = (await tx.get(db.doc('configuracoes/checkout'))).data();
            if (JSON.stringify(configAtual) !== JSON.stringify(c)) throw new HttpsError('failed-precondition', 'As opções da loja mudaram. Recarregue o catálogo.');
            // Limita criação pública de cobranças sem armazenar o IP em texto.
            const rateRef = db.doc('limitesCheckout/' + p.hash(request.rawRequest.ip || 'desconhecido'));
            const rateDoc = await tx.get(rateRef);
            const rate = rateDoc.data();
            const recente = rate?.inicio?.toMillis() > Date.now() - 600000;
            if (recente && rate.total >= 5) throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde alguns minutos.');
            let quoteRef, quote;
            if (cotacao) {
                quoteRef = db.doc('cotacoesFrete/' + d.cotacaoId);
                quote = (await tx.get(quoteRef)).data();
                if (!quote || quote.consumidaPor || quote.expiraEm.toMillis() < Date.now()) throw new HttpsError('failed-precondition', 'Calcule o frete novamente.');
            }
            const docs = await tx.getAll(...itens.map(i => db.doc('produtos/' + i.produtoId)));
            let produtos;
            try { produtos = frete.produtosConferidos(itens, docs.map(doc => doc.data())); }
            catch (e) { throw new HttpsError('failed-precondition', e.message); }
            if (quote) {
                const assinatura = lista => JSON.stringify(lista.map(i => [i.produtoId, i.qtd, i.opcaoId || '',
                    Object.entries(i.personalizacao || {}).sort(([a], [b]) => a.localeCompare(b)), i.precoCentavos, i.embalagem,
                    i.disponibilidade || 'sob_demanda']).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
                if (assinatura(produtos) !== assinatura(quote.itens)) throw new HttpsError('failed-precondition', 'O carrinho ou as medidas mudaram. Calcule o frete novamente.');
            }
            if (entrega.tipo === 'local') {
                const atual = frete.opcoesProprias(c, quote.destino || {}, produtos).find(o => o.id === 'local');
                if (!atual || atual.precoCentavos !== entrega.precoCentavos || atual.prazoDias !== entrega.prazoDias) throw new HttpsError('failed-precondition', 'A entrega mudou. Calcule o frete novamente.');
            }
            const subtotal = produtos.reduce((s, i) => s + i.qtd * i.precoCentavos, 0);
            let beneficio;
            try { beneficio = promocao.aplicar(produtos, c.promocao); }
            catch (erro) { throw new HttpsError('failed-precondition', erro.message); }
            if (d.descontoEsperadoCentavos != null && d.descontoEsperadoCentavos !== beneficio.descontoCentavos) throw new HttpsError('failed-precondition', 'A promoção mudou. Recarregue a loja e confira o desconto antes de pagar.');
            produtos = beneficio.itens;
            const total = subtotal - beneficio.descontoCentavos + entrega.precoCentavos;
            if (!Number.isSafeInteger(total) || total <= 0 || total > 10000000) throw new HttpsError('invalid-argument', 'Total inválido.');
            compra = { usuario: c.usuario, handle: c.infiniteTag, cliente, itens: produtos, entrega,
                prazoProducaoDias: frete.prazoProducao(produtos), subtotalCentavos: subtotal, descontoCentavos: beneficio.descontoCentavos, promocao: promocao.configuracao(c.promocao),
                totalCentavos: total, tokenHash: p.hash(d.token), webhookHash: p.hash(webhookToken), status: 'criando', criadoEm: Timestamp.now() };
            tx.create(ref, compra);
            tx.set(rateRef, { inicio: recente ? rate.inicio : Timestamp.now(), total: recente ? rate.total + 1 : 1 });
            if (quoteRef) tx.update(quoteRef, { consumidaPor: ref.id });
        });
        const payload = { handle: compra.handle, order_nsu: ref.id,
            items: promocao.itensPagamento(compra.itens),
            customer: { name: cliente.nome, phone_number: '+' + (cliente.telefone.length <= 11 ? '55' : '') + cliente.telefone },
            redirect_url: `${base}/pagamento.html?pedido=${ref.id}&token=${d.token}`,
            webhook_url: `${webhookBase.value() || base}/api/infinitepay?token=${webhookToken}` };
        if (entrega.precoCentavos > 0) payload.items.push({ quantity: 1, price: entrega.precoCentavos, description: entrega.nome });
        if (cliente.endereco) payload.address = { cep: cliente.endereco.cep, street: cliente.endereco.rua,
            neighborhood: cliente.endereco.bairro, number: cliente.endereco.numero, complement: cliente.endereco.complemento };
        try {
            const resposta = await api('links', payload);
            // Algumas respostas da integração usam checkout_url; valide o destino em ambos os formatos.
            const url = resposta.url || resposta.checkout_url;
            if (!p.linkValido(url)) {
                const erro = new Error('Link de pagamento inválido.');
                erro.etapa = 'resposta_link';
                throw erro;
            }
            await db.runTransaction(async tx => {
                const atual = (await tx.get(ref)).data();
                tx.update(ref, { url, ...(atual.status === 'pago' ? {} : { status: 'pendente' }) });
            });
            return { url, pedidoId: ref.id };
        } catch (erro) {
            // Uma resposta perdida pode ter criado uma cobrança: não gerar outra automaticamente.
            const diagnostico = Number.isInteger(erro.httpStatus) ? 'http_' + erro.httpStatus
                : erro.etapa === 'resposta_link' ? 'resposta_link'
                : ['TimeoutError', 'AbortError'].includes(erro.name) ? 'tempo_limite' : 'conexao_ou_gravacao';
            await ref.update({ erroCriacao: true, diagnosticoCriacao: diagnostico });
            throw new HttpsError('unavailable', 'Não foi possível obter o link. Não faça outra compra; contate a loja para conferir esta tentativa: ' + ref.id);
        }
    });
    async function confirmar(ref, slug, transaction) {
        const doc = await ref.get();
        if (!doc.exists) throw new Error('Pedido inexistente.');
        const compra = doc.data();
        if (compra.status === 'pago') return true;
        const r = await api('payment_check', { handle: compra.handle, order_nsu: ref.id, transaction_nsu: transaction, slug });
        if (!p.confirmado(r, compra.totalCentavos)) return false;
        const nomeBusca = s => String(s || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const clientes = await db.collection('clientes').where('usuario', '==', compra.usuario).get();
        const encontrados = clientes.docs.filter(doc => nomeBusca(doc.data().nome) === nomeBusca(compra.cliente.nome)
            && String(doc.data().telefone || '').replace(/\D/g, '') === compra.cliente.telefone);
        const clienteId = encontrados.length === 1 ? encontrados[0].id
            : 'online_' + p.hash(compra.usuario + ':' + compra.cliente.telefone + ':' + nomeBusca(compra.cliente.nome));
        await db.runTransaction(async tx => {
            const atual = (await tx.get(ref)).data();
            if (atual.status === 'pago') return;
            const transRef = db.doc('transacoesInfinitepay/' + p.hash(transaction));
            const trans = await tx.get(transRef);
            if (trans.exists && trans.data().checkoutId !== ref.id) throw new Error('Transação já vinculada.');
            const produtoDocs = await tx.getAll(...atual.itens.map(i => db.doc('produtos/' + i.produtoId)));
            const clienteRef = db.doc('clientes/' + clienteId);
            const clienteDoc = await tx.get(clienteRef);
            if (clienteDoc.exists && clienteDoc.data().usuario !== atual.usuario) throw new Error('Cliente indisponível.');
            const agora = Timestamp.now();
            const data = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            const forma = r.capture_method === 'pix' ? 'Pix' : 'Cartão de crédito';
            let estoquePendente = false;
            const estoques = new Map();
            produtoDocs.forEach((doc, n) => { if (!estoques.has(atual.itens[n].produtoId)) estoques.set(atual.itens[n].produtoId, { ref: doc.ref, valor: Number(doc.data()?.estoquePronto) }); });
            p.distribuirFrete(atual.itens, atual.entrega.precoCentavos).forEach((item, n) => {
                const controle = estoques.get(item.produtoId);
                const estoque = controle?.valor;
                const pendente = item.disponibilidade === 'pronta_entrega' && (!Number.isFinite(estoque) || estoque < item.qtd);
                estoquePendente ||= pendente;
                if (item.disponibilidade === 'pronta_entrega' && !pendente) controle.valor = estoque - item.qtd;
                const pedidoRef = db.doc(`pedidos/ip_${ref.id}_${n}`);
                tx.create(pedidoRef, { usuario: atual.usuario, pedidoId: `ip_${ref.id}_${n}`, data, dataPagamento: data, dataEntrega: '',
                    cliente: atual.cliente.nome, clienteId, telefone: atual.cliente.telefone, observacao: atual.cliente.observacao,
                    produto: item.nome, produtoId: item.produtoId, qtd: item.qtd, valor: item.precoCentavos / 100,
                    total: item.totalCentavos / 100, frete: item.freteCentavos / 100, desconto: (item.descontoCentavos || 0) / 100, custo: null, lucro: null, custoConfirmado: false,
                    disponibilidade: item.disponibilidade || 'sob_demanda',
                    pagamento: forma, status: item.disponibilidade === 'pronta_entrega' && !pendente ? 'Pronto' : 'Aguardando', pago: 'Sim', valorRecebido: item.totalCentavos / 100,
                    origem: 'catalogo', checkoutId: ref.id, entrega: atual.entrega, enderecoEntrega: atual.cliente.endereco,
                    estoquePendente: pendente, criadoEm: agora });
                tx.create(db.doc(`pagamentos/ip_${ref.id}_${n}`), { usuario: atual.usuario, pedidoId: pedidoRef.id,
                    valor: item.totalCentavos / 100, data, forma, observacao: 'Pagamento confirmado pela InfinitePay; frete incluído.', criadoEm: agora });
            });
            estoques.forEach(controle => { if (Number.isFinite(controle.valor)) tx.update(controle.ref, { estoquePronto: controle.valor, atualizadoEm: agora }); });
            if (!clienteDoc.exists) tx.create(clienteRef, { usuario: atual.usuario, nome: atual.cliente.nome,
                telefone: atual.cliente.telefone, nomeBusca: nomeBusca(atual.cliente.nome), observacoes: '', criadoEm: agora, atualizadoEm: agora });
            tx.set(transRef, { checkoutId: ref.id, usuario: atual.usuario, criadoEm: agora });
            tx.update(ref, { status: 'pago', pagoEm: agora, transactionNsu: transaction, slug, parcelas: r.installments,
                valorPagoCentavos: r.paid_amount, estoquePendente });
        });
        return true;
    }
    const consultarPagamento = onCall(options, async request => {
        const d = request.data || {};
        if (!id(d.pedido) || typeof d.token !== 'string' || !/^[a-f0-9]{64}$/.test(d.token)) throw new HttpsError('invalid-argument', 'Identificação inválida.');
        const ref = db.doc('checkouts/' + d.pedido);
        const doc = await ref.get();
        if (!doc.exists || doc.data().tokenHash !== p.hash(d.token)) throw new HttpsError('permission-denied', 'Pedido indisponível.');
        const resultadoPago = async () => { const compra = (await ref.get()).data(); return { pago: true, prazoProducaoDias: frete.prazoProducao(compra.itens), estoquePendente: compra.estoquePendente === true }; };
        if (doc.data().status === 'pago') return resultadoPago();
        if (id(d.slug) && id(d.transaction)) {
            try { return await confirmar(ref, d.slug, d.transaction) ? resultadoPago() : { pago: false }; }
            catch (_) { throw new HttpsError('unavailable', 'Não foi possível confirmar agora. Tente novamente.'); }
        }
        return { pago: false, reiniciar: doc.data().status === 'encerrado_sem_pagamento' && !doc.data().url && !doc.data().transactionNsu,
            url: doc.data().status === 'pendente' && p.linkValido(doc.data().url) ? doc.data().url : null };
    });
    const webhookInfinitepay = onRequest({ region: 'southamerica-east1', maxInstances: 3, concurrency: 10, timeoutSeconds: 60 }, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (req.method !== 'POST') return res.status(405).send('Método inválido.');
        const d = req.body || {};
        if (!id(d.order_nsu) || !id(d.invoice_slug) || !id(d.transaction_nsu) || typeof req.query.token !== 'string') return res.status(400).send('Aviso inválido.');
        try {
            const ref = db.doc('checkouts/' + d.order_nsu);
            const doc = await ref.get();
            if (!doc.exists || doc.data().webhookHash !== p.hash(req.query.token)) return res.status(400).send('Aviso inválido.');
            return res.status(await confirmar(ref, d.invoice_slug, d.transaction_nsu) ? 200 : 400).send('Recebido.');
        } catch (_) { return res.status(400).send('Tente novamente.'); }
    });
    return { opcoesCheckout, criarPagamento, consultarPagamento, webhookInfinitepay };
};
