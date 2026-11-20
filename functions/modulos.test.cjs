const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function carregar(financeiro = true) {
    const contexto = {};
    contexto.window = contexto;
    vm.createContext(contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8') + '\nthis.api = LV;', contexto);
    if (financeiro) vm.runInContext(fs.readFileSync(path.join(__dirname, '../financeiro-regras.js'), 'utf8'), contexto);
    return contexto.api;
}

test('base e embalagem funcionam mesmo sem carregar o módulo financeiro', () => {
    const api = carregar(false);
    assert.equal(api.centavos(12.68), 1268);
    assert.equal(api.nome(' LÉO '), 'leo');
    assert.equal(api.telefone('(47) 99999-9999'), '47999999999');
    assert.equal(api.embalagem({ pesoKg: 0.1, larguraCm: 10, alturaCm: 10, comprimentoCm: 15 }).pesoKg, 0.1);
    const semEmbalagem = api.precoOrcamento({ custoBase: 5, embalagem: 0, falhaPercentual: 10, markup: 2 });
    const comEmbalagem = api.precoOrcamento({ custoBase: 5, embalagem: 0.60, falhaPercentual: 10, markup: 2 });
    assert.equal(api.centavos(comEmbalagem.precoSugerido) - api.centavos(semEmbalagem.precoSugerido), 60);
    assert.equal(api.centavos(comEmbalagem.custoUnitario) - api.centavos(semEmbalagem.custoUnitario), 60);
    const comercial = api.precoOrcamento({ custoBase: 10, embalagem: 0.60, falhaPercentual: 10, markup: 2,
        margemSeguranca: 12, arredondamento: 5, lucroMinimo: 5, taxaMarketplace: 0.20,
        impostoMarketplace: 0.055, taxaFixaMarketplace: 4 });
    assert.equal(comercial.precoRecomendado, 30);
    assert.equal(comercial.precoMarketplace, 45.64);
    assert.ok(comercial.lucroMarketplace >= comercial.lucroDireto - 0.01);
    assert.throws(() => api.lucro({}), /regras financeiras não carregaram/);
    assert.equal(api.chaveCliente({ clienteId: 'cliente' }), 'cliente');
});

test('módulo financeiro preserva parciais, quitação antiga e custo pendente', () => {
    const api = carregar();
    assert.equal(api.recebidoCentavos({ total: 20, pago: 'Sim' }, []), 2000);
    assert.equal(api.recebidoCentavos({ total: 20 }, [{ valor: 5.25 }, { valor: 2 }]), 725);
    assert.equal(api.recebidoCentavos({ valorRecebido: 8 }, [{ valor: 5 }]), 800);
    assert.equal(api.lucro({ total: 20, qtd: 2, custo: 3 }), 14);
    assert.equal(api.lucro({ total: 20, origem: 'catalogo' }), 0);
    const pagamentos = [{ pedidoId: 'p1', valor: 5 }, { pedidoId: 'outro', valor: 10 }];
    assert.equal(api.pagamentosDoPedido(pagamentos, 'p1').length, 1);
    const recebimentos = api.recebimentos([{ docId: 'p1' }, { docId: 'p2', total: 20, pago: 'Sim' }], pagamentos);
    assert.equal(recebimentos.length, 2);
    assert.equal(recebimentos[1].dataDesconhecida, true);
});

test('registro financeiro mantém transação, titularidade e limite do saldo', async () => {
    const api = carregar();
    let pedido = { usuario: 'loja', total: 10, valorRecebido: 3 };
    const gravacoes = [];
    const db = {
        collection(nome) { return {
            doc(id) { return { nome, id }; },
            where() { return { where() { return { async get() { return { docs: [] }; } }; } }; }
        }; },
        async runTransaction(callback) { return callback({
            async get() { return { exists: true, data() { return pedido; } }; },
            set(ref, dados) { gravacoes.push(['pagamento', dados]); },
            update(ref, dados) { gravacoes.push(['pedido', dados]); }
        }); }
    };
    await api.registrarPagamento(db, 'loja', 'pedido', { valor: 7, taxaReal: 0.35, origem: 'infinitepay', data: '2026-10-12', forma: 'Pix' });
    assert.equal(gravacoes.length, 2);
    assert.equal(gravacoes[0][1].taxaReal, 0.35);
    assert.equal(gravacoes[0][1].origem, 'infinitepay');
    assert.equal(gravacoes[1][1].valorRecebido, 10);
    assert.equal(gravacoes[1][1].pago, 'Sim');
    gravacoes.length = 0;
    await assert.rejects(api.registrarPagamento(db, 'loja', 'pedido', { valor: 7, taxaReal: 8 }), /taxa descontada/);
    await assert.rejects(api.registrarPagamento(db, 'loja', 'pedido', { valor: 8 }), /supera o saldo/);
    assert.equal(gravacoes.length, 0);
    pedido = { ...pedido, usuario: 'outra-loja' };
    await assert.rejects(api.registrarPagamento(db, 'loja', 'pedido', { valor: 1 }), /Pedido não encontrado/);
    assert.equal(gravacoes.length, 0);
});

test('exclusão envia pedido para lixeira e preserva o registro', async () => {
    const api = carregar();
    const alteracoes = [];
    const pedido = { usuario: 'loja', total: 20, historicoAlteracoes: [] };
    const db = { collection() { return { doc(id) { return { id }; } }; }, async runTransaction(callback) { return callback({
        async get() { return { exists: true, data() { return pedido; } }; },
        update(ref, dados) { alteracoes.push(dados); }, delete() { throw new Error('não deve apagar'); }
    }); } };
    await api.excluirPedido(db, 'loja', 'p1');
    assert.equal(alteracoes[0].excluido, true);
    assert.equal(alteracoes[0].excluidoPor, 'loja');
    assert.equal(alteracoes[0].historicoAlteracoes[0].acao, 'excluído');
});

test('parcelamento conjunto soma pedidos do mesmo cliente acima de cem reais', async () => {
    const api = carregar();
    const pedidos = {
        p1: { usuario: 'loja', cliente: 'Andrieli', telefone: '47999999999', total: 75, pago: 'Não' },
        p2: { usuario: 'loja', cliente: 'Andrieli', telefone: '47999999999', total: 40, pago: 'Não' }
    };
    const gravacoes = [];
    let sequencia = 0;
    const db = {
        collection(nome) { return { doc(id) { return { nome, id: id || `novo-${++sequencia}` }; } }; },
        async runTransaction(callback) { return callback({
            async get(ref) {
                const dados = ref.nome === 'pedidos' ? pedidos[ref.id] : null;
                return { exists: !!dados, ref, data() { return dados; } };
            },
            set(ref, dados) { gravacoes.push(['set', ref, dados]); },
            update(ref, dados) { gravacoes.push(['update', ref, dados]); }
        }); }
    };
    const grupoId = await api.criarParcelamentoCliente(db, 'loja', '', ['p1', 'p2'], 2, '2026-11-10');
    assert.equal(grupoId, 'novo-1');
    const grupo = gravacoes.find(item => item[0] === 'set')[2];
    assert.equal(grupo.valorFinanciado, 115);
    assert.deepEqual(Array.from(grupo.parcelas, parcela => parcela.valor), [57.5, 57.5]);
    assert.equal(gravacoes.filter(item => item[0] === 'update' && item[1].nome === 'pedidos').length, 2);
});
