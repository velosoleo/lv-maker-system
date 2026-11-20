'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./frete');
test('prazo distingue pronta entrega, sob demanda, misto e registros antigos', () => {
    assert.equal(f.prazoProducao([{disponibilidade:'pronta_entrega'}]),0);
    assert.equal(f.prazoProducao([{disponibilidade:'sob_demanda'}]),1);
    assert.equal(f.prazoProducao([{disponibilidade:'pronta_entrega'},{disponibilidade:'sob_demanda'}]),1);
    assert.equal(f.prazoProducao([{}]),1);
});
test('quantidades agregadas e limite de itens', () => {
    assert.deepEqual(f.itensSolicitados([{ produtoId: 'a', qtd: 2 }, { produtoId: 'a', qtd: 3 }]), [{ produtoId: 'a', qtd: 5 }]);
    assert.throws(() => f.itensSolicitados([{ produtoId: '../a', qtd: 1 }]));
    assert.throws(() => f.itensSolicitados([{ produtoId: 'a', qtd: 100 }, { produtoId: 'a', qtd: 1 }]));
    assert.throws(() => f.itensSolicitados([{ produtoId: 'a', qtd: 1.5 }]));
});
test('preço e estoque vêm do cadastro, e não do carrinho', () => {
    const itens = f.itensSolicitados([{ produtoId: 'a', qtd: 2, preco: .01 }]);
    const produtos = f.produtosConferidos(itens, [{ ativo: true, preco: 25.90, estoquePronto: 2, disponibilidade: 'pronta_entrega' }]);
    assert.equal(produtos[0].precoCentavos, 2590);
    assert.throws(() => f.produtosConferidos(itens, [{ ativo: true, preco: 25.90, estoquePronto: 1, disponibilidade: 'pronta_entrega' }]));
    assert.throws(() => f.produtosConferidos(itens, [null]));
});

test('variação e personalização são validadas no servidor e alteram o preço', () => {
    const itens = f.itensSolicitados([{ produtoId: 'a', qtd: 1, opcaoId: 'grande', personalizacao: { cor: 'Azul', nome: 'Léo' } }]);
    const produtos = f.produtosConferidos(itens, [{ ativo: true, nome: 'Placa', preco: 20,
        variacoes: [{ id: 'grande', nome: 'Grande', adicional: 8 }], personalizacoes: { cor: true, nome: true } }]);
    assert.equal(produtos[0].precoCentavos, 2800);
    assert.match(produtos[0].nome, /Grande.*Azul.*Léo/);
    assert.throws(() => f.produtosConferidos([{ produtoId: 'a', qtd: 1, opcaoId: 'falsa' }], [{ ativo: true, preco: 20, variacoes: [] }]));
    assert.throws(() => f.itensSolicitados([{ produtoId: 'a', qtd: 1, personalizacao: { referencia: 'javascript:alert(1)' } }]));
});
test('configuração antiga preserva entrega somente em Guaramirim e bairros configurados', () => {
    const cfg = { entregaLocal: { habilitada: true, taxaCentavos: 1000, prazoDias: 2, bairros: ['Centro'] } };
    assert.equal(f.opcoesProprias(cfg, { localidade: 'Guaramirim', uf: 'SC', bairro: 'centro' }).length, 1);
    assert.equal(f.opcoesProprias(cfg, { localidade: 'Jaraguá do Sul', uf: 'SC', bairro: 'Centro' }).length, 0);
    assert.equal(f.opcoesProprias(cfg, { localidade: 'Guaramirim', uf: 'SC', bairro: '' }).length, 0);
    assert.equal(f.opcoesProprias({}, { localidade: 'Guaramirim', uf: 'SC' }).length, 0);
});

test('entrega grátis local considera desconto e limite estrito nas duas cidades, nunca outros destinos', () => {
    const cfg={retiradaHabilitada:true,entregaLocal:{habilitada:true,cidades:['Guaramirim','Jaraguá do Sul'],taxaCentavos:1500,prazoDias:1,bairros:[],gratisAcimaCentavos:10000},
        promocao:{ativa:true,valorCentavos:1000,minimoCentavos:5000,escopo:'todos',produtos:[]}};
    for(const cidade of ['Guaramirim','Jaraguá do Sul']) {
        for(const [preco,frete] of [[9900,1500],[10000,1500],[11000,1500],[11001,0],[13000,0]]) {
            const opcoes=f.opcoesProprias(cfg,{localidade:cidade,uf:'SC'},[{produtoId:'a',precoCentavos:preco,qtd:1}]);
            assert.equal(opcoes.find(o=>o.id==='local').precoCentavos,frete);
            assert.equal(opcoes.find(o=>o.id==='retirada').precoCentavos,0);
        }
    }
    for(const destino of [{localidade:'Curitiba',uf:'PR'},{localidade:'Joinville',uf:'SC'},{localidade:'Guaramirim',uf:'PR'}]) {
        assert.equal(f.opcoesProprias(cfg,destino,[{produtoId:'a',precoCentavos:99999,qtd:1}]).some(o=>o.tipo==='local'),false);
    }
    cfg.entregaLocal.gratisAcimaCentavos=null;
    assert.equal(f.opcoesProprias(cfg,{localidade:'Jaraguá do Sul',uf:'SC'},[{produtoId:'a',precoCentavos:99999,qtd:1}]).find(o=>o.id==='local').precoCentavos,1500);
});

test('entrega local respeita cidades selecionadas, bairros e ausência de carrinho', () => {
    const cfg={entregaLocal:{habilitada:true,cidades:['Jaraguá do Sul'],taxaCentavos:1500,prazoDias:1,bairros:['Centro'],gratisAcimaCentavos:10000}};
    assert.equal(f.opcoesProprias(cfg,{localidade:'Guaramirim',uf:'SC',bairro:'Centro'}).length,0);
    assert.equal(f.opcoesProprias(cfg,{localidade:'Jaragua do Sul',uf:'SC',bairro:'Centro'})[0].precoCentavos,1500);
    assert.equal(f.opcoesProprias(cfg,{localidade:'Jaraguá do Sul',uf:'SC',bairro:''}).length,0);
});

test('bairros independentes liberam Guaramirim inteira sem ampliar a cobertura de Jaraguá', () => {
    const cfg={entregaLocal:{habilitada:true,cidades:['Guaramirim','Jaraguá do Sul'],taxaCentavos:1500,prazoDias:1,bairros:['Corticeira'],bairrosPorCidade:{Guaramirim:[],'Jaraguá do Sul':['Centro']},gratisAcimaCentavos:10000}};
    const itens=[{produtoId:'a',precoCentavos:12000,qtd:1}];
    assert.equal(f.opcoesProprias(cfg,{localidade:'Guaramirim',uf:'SC',bairro:''},itens)[0].precoCentavos,0);
    assert.equal(f.opcoesProprias(cfg,{localidade:'Jaraguá do Sul',uf:'SC',bairro:'Centro'},itens)[0].precoCentavos,0);
    for(const bairro of ['Corticeira','Outro bairro',''])assert.equal(f.opcoesProprias(cfg,{localidade:'Jaraguá do Sul',uf:'SC',bairro},itens).length,0);
    assert.deepEqual(f.bairrosEntregaLocal(cfg.entregaLocal,'Jaragua do Sul'),['Centro']);
});
test('embalagem é obrigatória; unidades são preservadas', () => {
    assert.throws(() => f.produtosParaFrete([{ nome: 'Peça' }]));
    const p = f.produtosParaFrete([{ produtoId: 'a', qtd: 3, precoCentavos: 2590, embalagem: { pesoKg: .25, larguraCm: 10, alturaCm: 12, comprimentoCm: 15 } }])[0];
    assert.equal(p.weight, .25); assert.equal(p.quantity, 3); assert.equal(p.insurance_value, 25.90);
});
test('cotação respeita valores customizados e descarta serviços inválidos', () => {
    const opcoes = f.opcoesTransportadoras([{ id: 1, name: 'PAC', price: '20', custom_price: '18.50', delivery_time: 8, custom_delivery_time: 6 }, { id: 2, error: 'Indisponível' }, { id: 3, price: -1, delivery_time: 4 }]);
    assert.equal(opcoes.length, 1); assert.equal(opcoes[0].precoCentavos, 1850); assert.equal(opcoes[0].prazoDias, 6);
});

test('ausência parcial de PAC mostra aviso sem ocultar SEDEX nem expor resposta bruta', () => {
    const resposta = [{ id: 1, error: 'Serviço indisponível para o trecho; dado privado que não deve aparecer' }, { id: 2, name: 'SEDEX', company: { name: 'Correios' }, price: '25.00', delivery_time: 3 }];
    const opcoes = f.opcoesTransportadoras(resposta);
    assert.equal(opcoes.length, 1);
    const aviso = f.avisoTransportadoras(resposta, new Set([1, 2]), opcoes);
    assert.match(aviso, /Correios PAC/);
    assert.match(aviso, /trecho ou CEP/);
    assert.doesNotMatch(aviso, /dado privado/);
    assert.equal(f.avisoTransportadoras(resposta, new Set([2]), opcoes), '');
});
