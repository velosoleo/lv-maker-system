const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('proteção de área recupera a última leitura e impede consultas duplicadas', async () => {
    const contexto = { window: {}, console: { warn() {} } };
    vm.createContext(contexto);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'estado-area.js'), 'utf8'), contexto);
    const eventos = [];
    let retry, liberar;
    const api = contexto.window.LVEstadoArea;
    api.criar = (_, repetir) => {
        retry = repetir;
        return { carregando() { eventos.push('carregando'); },
            pronto() { eventos.push('pronto'); }, falhou() { eventos.push('falhou'); } };
    };
    const area = api.proteger({});
    let consultas = 0;
    const leitura = async () => { if (++consultas === 1) throw new Error('Offline'); };
    assert.equal(await area.executar(leitura), false);
    assert.deepEqual(eventos, ['carregando', 'falhou']);
    await retry();
    assert.equal(consultas, 2);
    assert.equal(eventos.at(-1), 'pronto');
    const pendente = area.executar(() => new Promise(resolve => { liberar = resolve; }));
    assert.equal(await area.executar(() => { throw new Error('Duplicada'); }), false);
    liberar();
    assert.equal(await pendente, true);
});

for (const [file, rotina, proxima] of [
    ['index.html', 'carregarPedidos', 'function pagamentosDoPedido'],
    ['financeiro.html', 'carregarDados', 'function getMes']
]) {
    test(`${file}: consulta parcial não libera resultados; nova tentativa recupera`, async () => {
        const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        const inicio = html.indexOf('let carregandoArea = false;');
        const fim = html.indexOf(proxima, inicio);
        assert.ok(inicio >= 0 && fim > inicio);
        let falha = true, prontas = 0, erros = 0, renderizacoes = 0;
        const contexto = {
            console: { warn() {} }, document: { getElementById() { return {}; } },
            auth: { currentUser: { uid: 'loja' } },
            LVEstadoArea: { criar() { return {
                carregando() {}, pronto() { prontas++; }, falhou() { erros++; }
            }; } },
            db: { collection(nome) { return { where() { return { async get() {
                if (falha && nome === 'pagamentos') throw new Error('Sem conexão');
                return { docs: [{ id: nome, data() { return nome === 'pedidos'
                    ? { cliente: 'Cliente', produto: 'Produto', total: 10, data: '2026-10-12' }
                    : { valor: 10 }; } }] };
            } }; } }; } },
            render() { renderizacoes++; }, preencherFiltroAnos() {},
            atualizarFinanceiro() { renderizacoes++; },
            pedidos: ['anterior'], pagamentos: ['anterior'], despesas: ['anterior']
        };
        vm.createContext(contexto);
        vm.runInContext(html.slice(inicio, fim), contexto);
        await contexto[rotina]();
        assert.equal(erros, 1);
        assert.equal(prontas, 0);
        assert.equal(renderizacoes, 0);
        assert.equal(contexto.pedidos[0], 'anterior');
        falha = false;
        await contexto[rotina]();
        assert.equal(prontas, 1);
        assert.equal(renderizacoes, 1);
        assert.equal(contexto.pedidos[0].docId, 'pedidos');
    });
}
