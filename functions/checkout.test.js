'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const p = require('./pagamento');
process.env.CHECKOUT_SITE_URL = 'https://lv-maker.web.app';
// Simula atomicidade e proíbe leituras após a primeira escrita, como o Firestore.
function banco(iniciais) {
    let registros = new Map(Object.entries(iniciais));
    const doc = path => ({ path, id: path.split('/').pop(), get: async () => snap(path, registros),
        update: async data => { registros.set(path, { ...registros.get(path), ...data }); } });
    const snap = (path, mapa) => ({ id: path.split('/').pop(), exists: mapa.has(path), data: () => mapa.get(path), ref: doc(path) });
    let fila = Promise.resolve();
    return { doc, collection: nome => ({ where: (campo, op, valor) => ({ get: async () => ({ docs: [...registros.keys()].filter(k => k.startsWith(nome + '/') && registros.get(k)[campo] === valor).map(k => snap(k, registros)) }) }) }), registros: () => registros, runTransaction: callback => {
        const run = fila.then(async () => {
            const proximo = new Map(registros); let escreveu = false;
            const tx = { get: async ref => { assert.equal(escreveu, false, 'Leitura depois de escrita'); return snap(ref.path, proximo); },
                getAll: async (...refs) => { assert.equal(escreveu, false); return refs.map(ref => snap(ref.path, proximo)); },
                create: (ref, data) => { escreveu = true; assert.equal(proximo.has(ref.path), false); proximo.set(ref.path, data); },
                set: (ref, data) => { escreveu = true; proximo.set(ref.path, data); },
                update: (ref, data) => { escreveu = true; assert.equal(proximo.has(ref.path), true); proximo.set(ref.path, { ...proximo.get(ref.path), ...data }); } };
            const resultado = await callback(tx); registros = proximo; return resultado;
        });
        fila = run.catch(() => {}); return run;
    } };
}
const token = 'a'.repeat(64);
const compra = () => ({ usuario: 'admin', handle: 'veloso32', status: 'pendente', tokenHash: p.hash(token), webhookHash: p.hash('webhook'),
    totalCentavos: 1200, cliente: { nome: 'Cliente', telefone: '47999999999', observacao: '', endereco: null },
    entrega: { id: 'retirada', tipo: 'retirada', precoCentavos: 200 }, itens: [{ produtoId: 'p1', nome: 'Peça', precoCentavos: 500, qtd: 2, disponibilidade: 'pronta_entrega' }] });

test('promoção é calculada no servidor e confirmação registra somente o valor líquido', async () => {
    const cfg = { usuario:'admin', pagamentoAtivo:true, repasseConfirmado:true, infiniteTag:'lvmaker3d', retiradaHabilitada:true,
        promocao:{ativa:true,valorCentavos:1000,minimoCentavos:5000,escopo:'todos',produtos:[]} };
    const db=banco({'configuracoes/checkout':cfg,'admins/admin':{},'produtos/p1':{ativo:true,nome:'Peça',preco:60,disponibilidade:'sob_demanda'}});
    const f=require('./checkout')(db); const antigo=global.fetch;
    global.fetch=async (url,opts)=> {
        const body=JSON.parse(opts.body);
        if (body.items) {
            assert.equal(body.items.reduce((s,i)=>s+i.price*i.quantity,0),5000);
            return {ok:true,json:async()=>({url:'https://checkout.infinitepay.io/teste'})};
        }
        return {ok:true,json:async()=>({success:true,paid:true,amount:5000,paid_amount:5000,installments:1,capture_method:'pix'})};
    };
    try {
        const data={chave:'promo1',token,itens:[{produtoId:'p1',qtd:1,preco:1,descontoCentavos:5999}],entregaId:'retirada',cliente:{nome:'Cliente',telefone:'47999999999'},descontoEsperadoCentavos:5999};
        await assert.rejects(f.criarPagamento.run({rawRequest:{ip:'teste'},data}),{code:'failed-precondition'});
        await f.criarPagamento.run({rawRequest:{ip:'teste'},data:{...data,descontoEsperadoCentavos:1000}});
        assert.equal(db.registros().get('checkouts/promo1').totalCentavos,5000);
        await f.consultarPagamento.run({data:{pedido:'promo1',token,slug:'invoice',transaction:'transacao1'}});
        assert.equal(db.registros().get('pedidos/ip_promo1_0').total,50);
        assert.equal(db.registros().get('pedidos/ip_promo1_0').desconto,10);
    } finally {global.fetch=antigo;}
});

test('pedido misto separa itens prontos e produção, mas comunica um dia para o conjunto', async () => {
    const c = compra(); c.itens.push({produtoId:'p2',nome:'Peça sob demanda',precoCentavos:100,qtd:1,disponibilidade:'sob_demanda'}); c.totalCentavos = 1300;
    const db = banco({'checkouts/compra1':c,'produtos/p1':{estoquePronto:5},'produtos/p2':{}});
    const f = require('./checkout')(db); const antigo = global.fetch;
    global.fetch = async () => ({ok:true,json:async()=>({success:true,paid:true,amount:1300,paid_amount:1300,installments:1,capture_method:'pix'})});
    try {
        const resultado = await f.consultarPagamento.run({data:{pedido:'compra1',token,slug:'invoice',transaction:'transacao1'}});
        assert.equal(resultado.prazoProducaoDias,1);
        assert.equal(db.registros().get('pedidos/ip_compra1_0').status,'Pronto');
        assert.equal(db.registros().get('pedidos/ip_compra1_1').status,'Aguardando');
        assert.equal(db.registros().get('produtos/p1').estoquePronto,3);
    } finally { global.fetch = antigo; }
});
test('webhook e retorno concorrentes criam uma única produção e um recebimento', async () => {
    const db = banco({ 'checkouts/compra1': compra(), 'produtos/p1': { estoquePronto: 5 }, 'clientes/legado': { usuario: 'admin', nome: 'CLIENTE', telefone: '(47) 99999-9999' } });
    const f = require('./checkout')(db);
    const antigo = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, paid: true, amount: 1200, paid_amount: 1300, installments: 3, capture_method: 'credit_card' }) });
    try {
        const request = { data: { pedido: 'compra1', token, slug: 'invoice', transaction: 'transacao1' } };
        const res = { set() {}, status(n) { this.code = n; return this; }, send() { return this; } };
        await Promise.all([f.consultarPagamento.run(request), f.webhookInfinitepay({ method: 'POST', query: { token: 'webhook' }, body: { order_nsu: 'compra1', invoice_slug: 'invoice', transaction_nsu: 'transacao1' } }, res)]);
        assert.equal(res.code, 200);
        const dados = db.registros();
        assert.equal([...dados.keys()].filter(k => k.startsWith('pedidos/')).length, 1);
        assert.equal([...dados.keys()].filter(k => k.startsWith('pagamentos/')).length, 1);
        assert.equal(dados.get('produtos/p1').estoquePronto, 3);
        assert.equal(dados.get('pedidos/ip_compra1_0').total, 12);
        assert.equal(dados.get('pedidos/ip_compra1_0').status, 'Pronto');
        assert.equal((await f.consultarPagamento.run(request)).prazoProducaoDias, 0);
        assert.equal(dados.get('pedidos/ip_compra1_0').clienteId, 'legado');
        assert.equal([...dados.keys()].filter(k => k.startsWith('clientes/')).length, 1);
        assert.equal(dados.get('checkouts/compra1').status, 'pago');
    } finally { global.fetch = antigo; }
});
test('pagamento de valor incorreto, token falso e aviso falso não criam pedidos', async () => {
    const db = banco({ 'checkouts/compra1': compra(), 'produtos/p1': { estoquePronto: 5 } });
    const f = require('./checkout')(db); const antigo = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, paid: true, amount: 1100, paid_amount: 1200, installments: 1, capture_method: 'pix' }) });
    try {
        const d = { pedido: 'compra1', token, slug: 'invoice', transaction: 'transacao1' };
        assert.equal((await f.consultarPagamento.run({ data: d })).pago, false);
        await assert.rejects(f.consultarPagamento.run({ data: { ...d, token: 'b'.repeat(64) } }), { code: 'permission-denied' });
        const res = { set() {}, status(n) { this.code = n; return this; }, send() {} };
        await f.webhookInfinitepay({ method: 'POST', query: { token: 'falso' }, body: { order_nsu: 'compra1', invoice_slug: 'invoice', transaction_nsu: 'transacao1' } }, res);
        assert.equal(res.code, 400);
        assert.equal(db.registros().get('produtos/p1').estoquePronto, 5);
        assert.equal([...db.registros().keys()].some(k => k.startsWith('pedidos/')), false);
    } finally { global.fetch = antigo; }
});
test('pagamento tardio com estoque insuficiente é registrado e sinalizado sem estoque negativo', async () => {
    const db = banco({ 'checkouts/compra1': compra(), 'produtos/p1': { estoquePronto: 1 } });
    const f = require('./checkout')(db); const antigo = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, paid: true, amount: 1200, paid_amount: 1200, installments: 1, capture_method: 'pix' }) });
    try {
        await f.consultarPagamento.run({ data: { pedido: 'compra1', token, slug: 'invoice', transaction: 'transacao1' } });
        assert.equal(db.registros().get('produtos/p1').estoquePronto, 1);
        assert.equal(db.registros().get('pedidos/ip_compra1_0').estoquePendente, true);
        assert.equal(db.registros().get('pedidos/ip_compra1_0').status, 'Aguardando');
    } finally { global.fetch = antigo; }
});
test('criação usa preço do servidor e reutiliza a mesma cobrança', async () => {
    const cfg = { usuario: 'admin', pagamentoAtivo: true, repasseConfirmado: true, infiniteTag: 'veloso32', retiradaHabilitada: true };
    const db = banco({ 'configuracoes/checkout': cfg, 'admins/admin': {}, 'produtos/p1': { ativo: true, nome: 'Peça', preco: 5, disponibilidade: 'sob_demanda' } });
    const f = require('./checkout')(db); const antigo = global.fetch;
    let chamadas = 0;
    global.fetch = async (url, opts) => {
        chamadas++; const payload = JSON.parse(opts.body);
        assert.equal(payload.items[0].price, 500);
        assert.equal(payload.handle, 'veloso32');
        assert.equal(payload.order_nsu, 'compra1');
        assert.equal(payload.customer.phone_number, '+5547999999999');
        return { ok: true, json: async () => ({ url: 'https://checkout.infinitepay.com.br/abc' }) };
    };
    try {
        const request = { rawRequest: { ip: 'teste' }, data: { chave: 'compra1', token, itens: [{ produtoId: 'p1', qtd: 2, preco: 0.01 }], entregaId: 'retirada', cliente: { nome: 'Cliente', telefone: '47999999999' } } };
        const a = await f.criarPagamento.run(request);
        const b = await f.criarPagamento.run(request);
        assert.equal(a.url, b.url); assert.equal(chamadas, 1);
        assert.equal(db.registros().get('checkouts/compra1').totalCentavos, 1000);
    } finally { global.fetch = antigo; }
});
test('cotação expirada não cria cobrança', async () => {
    const cfg = { usuario: 'admin', pagamentoAtivo: true, repasseConfirmado: true, infiniteTag: 'veloso32' };
    const db = banco({ 'configuracoes/checkout': cfg, 'admins/admin': {}, 'cotacoesFrete/cotacao1': { usuario: 'admin', expiraEm: Timestamp.fromMillis(Date.now() - 1000) } });
    const f = require('./checkout')(db);
    await assert.rejects(f.criarPagamento.run({ rawRequest: { ip: 'teste' }, data: { chave: 'compra1', token, itens: [{ produtoId: 'p1', qtd: 1 }], cotacaoId: 'cotacao1', entregaId: 'local' } }), { code: 'invalid-argument' });
    assert.equal(db.registros().has('checkouts/compra1'), false);
});
test('confirmação rápida não volta para pendente quando o link termina de salvar', async () => {
    const cfg = { usuario: 'admin', pagamentoAtivo: true, repasseConfirmado: true, infiniteTag: 'veloso32', retiradaHabilitada: true };
    const db = banco({ 'configuracoes/checkout': cfg, 'admins/admin': {}, 'produtos/p1': { ativo: true, nome: 'Peça', preco: 5 } });
    const f = require('./checkout')(db);
    const antigo = global.fetch;
    global.fetch = async () => {
        await db.doc('checkouts/compra1').update({ status: 'pago' });
        return { ok: true, json: async () => ({ url: 'https://checkout.infinitepay.com.br/abc' }) };
    };
    try {
        await f.criarPagamento.run({ rawRequest: { ip: 'teste' }, data: { chave: 'compra1', token,
            itens: [{ produtoId: 'p1', qtd: 1 }], entregaId: 'retirada', cliente: { nome: 'Cliente', telefone: '47999999999' } } });
        assert.equal(db.registros().get('checkouts/compra1').status, 'pago');
        assert.equal(db.registros().get('checkouts/compra1').url, 'https://checkout.infinitepay.com.br/abc');
    } finally { global.fetch = antigo; }
});
test('frete válido é cobrado e cotação com preço antigo é recusada', async () => {
    const cfg = { usuario: 'admin', pagamentoAtivo: true, repasseConfirmado: true, infiniteTag: 'veloso32', entregaLocal: { habilitada: true, taxaCentavos: 200, prazoDias: 1, bairros: [] } };
    const entrega = { id: 'local', tipo: 'local', nome: 'Entrega local', precoCentavos: 200, prazoDias: 1 };
    const quote = { usuario: 'admin', cep: '89270000', expiraEm: Timestamp.fromMillis(Date.now() + 60000),
        destino: { localidade: 'Guaramirim', uf: 'SC', bairro: 'Centro' }, opcoes: [entrega],
        itens: [{ produtoId: 'p1', qtd: 2, precoCentavos: 500, embalagem: null }] };
    const d = { chave: 'compra1', token, itens: [{ produtoId: 'p1', qtd: 2 }], cotacaoId: 'cotacao1', entregaId: 'local',
        cliente: { nome: 'Cliente', telefone: '47999999999', endereco: { cep: '89270000', rua: 'Rua Teste', bairro: 'Centro', numero: '1' } } };
    const antigo = global.fetch;
    global.fetch = async (url, opts) => {
        const payload = JSON.parse(opts.body);
        assert.equal(payload.items[1].price, 200);
        assert.equal(payload.address.number, '1');
        return { ok: true, json: async () => ({ url: 'https://checkout.infinitepay.com.br/abc' }) };
    };
    try {
        for (const preco of [5, 6]) {
            const db = banco({ 'configuracoes/checkout': cfg, 'admins/admin': {}, 'cotacoesFrete/cotacao1': quote,
                'produtos/p1': { ativo: true, nome: 'Peça', preco, disponibilidade: 'sob_demanda' } });
            const f = require('./checkout')(db);
            const chamada = f.criarPagamento.run({ data: d, rawRequest: { ip: 'teste' } });
            if (preco === 6) { await assert.rejects(chamada, { code: 'failed-precondition' }); assert.equal(db.registros().has('checkouts/compra1'), false); }
            else { await chamada; assert.equal(db.registros().get('checkouts/compra1').totalCentavos, 1200); assert.equal(db.registros().get('cotacoesFrete/cotacao1').consumidaPor, 'compra1'); }
        }
    } finally { global.fetch = antigo; }
});

test('checkout confere gratuidade local com produtos e desconto do servidor antes de cobrar', async () => {
    const cfg={usuario:'admin',pagamentoAtivo:true,repasseConfirmado:true,infiniteTag:'lvmaker3d',
        entregaLocal:{habilitada:true,cidades:['Guaramirim','Jaraguá do Sul'],taxaCentavos:1500,prazoDias:1,bairros:[],gratisAcimaCentavos:10000},
        promocao:{ativa:true,valorCentavos:1000,minimoCentavos:5000,escopo:'todos',produtos:[]}};
    const antigo=global.fetch; let chamadas=0;
    global.fetch=async(url,opts)=>{chamadas++;const body=JSON.parse(opts.body);assert.equal(body.items.length,1);assert.equal(body.items[0].price,11000);return {ok:true,json:async()=>({url:'https://checkout.infinitepay.io/teste'})};};
    try {
        for(const [preco,cotado,cidade,sucesso] of [[120,0,'Jaraguá do Sul',true],[110,0,'Guaramirim',false],[120,1500,'Jaraguá do Sul',false],[120,0,'Curitiba',false]]) {
            const quote={usuario:'admin',cep:'89251970',expiraEm:Timestamp.fromMillis(Date.now()+60000),destino:{localidade:cidade,uf:'SC',bairro:'Centro'},
                opcoes:[{id:'local',tipo:'local',nome:'Entrega LV Maker',precoCentavos:cotado,prazoDias:1}],
                itens:[{produtoId:'p1',qtd:1,precoCentavos:preco*100,embalagem:null,disponibilidade:'sob_demanda'}]};
            const db=banco({'configuracoes/checkout':cfg,'admins/admin':{},'cotacoesFrete/cotacao1':quote,'produtos/p1':{ativo:true,nome:'Peça',preco,disponibilidade:'sob_demanda'}});
            const f=require('./checkout')(db);
            const request={rawRequest:{ip:'teste'},data:{chave:'gratis1',token,itens:[{produtoId:'p1',qtd:1}],cotacaoId:'cotacao1',entregaId:'local',cliente:{nome:'Cliente',telefone:'47999999999',endereco:{cep:'89251970',rua:'Rua Teste',bairro:'Centro',numero:'1'}}}};
            if(sucesso){await f.criarPagamento.run(request);assert.equal(db.registros().get('checkouts/gratis1').totalCentavos,11000);assert.equal(db.registros().get('checkouts/gratis1').entrega.precoCentavos,0);}
            else {await assert.rejects(f.criarPagamento.run(request),{code:'failed-precondition'});assert.equal(db.registros().has('checkouts/gratis1'),false);}
        }
        assert.equal(chamadas,1);
    } finally {global.fetch=antigo;}
});

 test('aceita checkout_url e mantém a reutilização da mesma tentativa', async () => {
    const cfg = { usuario: 'admin', pagamentoAtivo: true, repasseConfirmado: true, infiniteTag: 'veloso32', retiradaHabilitada: true };
    const db = banco({ 'configuracoes/checkout': cfg, 'admins/admin': {}, 'produtos/p1': { ativo: true, nome: 'Peça', preco: 5, disponibilidade: 'sob_demanda' } });
    const f = require('./checkout')(db), antigo = global.fetch;
    let chamadas = 0;
    global.fetch = async () => { chamadas++; return { ok: true, json: async () => ({ checkout_url: 'https://checkout.infinitepay.io/abc' }) }; };
    try {
        const request = { rawRequest: { ip: 'teste' }, data: { chave: 'compra_compat', token, itens: [{ produtoId: 'p1', qtd: 1 }], entregaId: 'retirada', cliente: { nome: 'Cliente', telefone: '47999999999' } } };
        assert.equal((await f.criarPagamento.run(request)).url, 'https://checkout.infinitepay.io/abc');
        await f.criarPagamento.run(request);
        assert.equal(chamadas, 1);
    } finally { global.fetch = antigo; }
});
test('rejeita destino externo e preserva tentativa para conferência', async () => {
    const cfg = { usuario: 'admin', pagamentoAtivo: true, repasseConfirmado: true, infiniteTag: 'veloso32', retiradaHabilitada: true };
    for (const resposta of [{ ok: true, json: async () => ({ checkout_url: 'https://example.com/pagar' }) }, { ok: false, status: 422 }]) {
        const db = banco({ 'configuracoes/checkout': cfg, 'admins/admin': {}, 'produtos/p1': { ativo: true, nome: 'Peça', preco: 5, disponibilidade: 'sob_demanda' } });
        const f = require('./checkout')(db), antigo = global.fetch;
        let chamadas = 0;
        global.fetch = async () => { chamadas++; return resposta; };
        try {
            const request = { rawRequest: { ip: 'teste' }, data: { chave: 'compra_falha', token, itens: [{ produtoId: 'p1', qtd: 1 }], entregaId: 'retirada', cliente: { nome: 'Cliente', telefone: '47999999999' } } };
            await assert.rejects(f.criarPagamento.run(request), { code: 'unavailable' });
            await assert.rejects(f.criarPagamento.run(request), { code: 'failed-precondition' });
            assert.equal(chamadas, 1);
            assert.equal(db.registros().get('checkouts/compra_falha').diagnosticoCriacao, resposta.ok ? 'resposta_link' : 'http_422');
        } finally { global.fetch = antigo; }
    }
});

test('somente tentativa encerrada sem link ou transação permite reiniciar, com token válido', async () => {
    for (const extra of [{ status: 'criando' }, { status: 'encerrado_sem_pagamento' }, { status: 'encerrado_sem_pagamento', url: 'https://checkout.infinitepay.com.br/abc' }, { status: 'encerrado_sem_pagamento', transactionNsu: 't1' }, { status: 'pago' }]) {
        const db = banco({ 'checkouts/compra1': { ...compra(), ...extra } });
        const f = require('./checkout')(db);
        const r = await f.consultarPagamento.run({ data: { pedido: 'compra1', token } });
        assert.equal(r.reiniciar === true, extra.status === 'encerrado_sem_pagamento' && !extra.url && !extra.transactionNsu);
        await assert.rejects(f.consultarPagamento.run({ data: { pedido: 'compra1', token: 'b'.repeat(64) } }), { code: 'permission-denied' });
    }
});

test('retomada retorna somente link validado de compra pendente e exige token', async () => {
    for (const extra of [{ status: 'pendente', url: 'https://checkout.infinitepay.io/loja/fatura' }, { status: 'criando', url: 'https://checkout.infinitepay.io/loja/fatura' }, { status: 'pendente', url: 'https://example.com/fatura' }]) {
        const f = require('./checkout')(banco({ 'checkouts/compra1': { ...compra(), ...extra } }));
        const r = await f.consultarPagamento.run({ data: { pedido: 'compra1', token } });
        assert.equal(r.url, extra.status === 'pendente' && p.linkValido(extra.url) ? extra.url : null);
        await assert.rejects(f.consultarPagamento.run({ data: { pedido: 'compra1', token: 'b'.repeat(64) } }), { code: 'permission-denied' });
    }
});
