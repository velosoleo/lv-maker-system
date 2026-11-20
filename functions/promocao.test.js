'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('./promocao');
const pagamento = require('./pagamento');
const regra = { ativa:true, valorCentavos:1000, minimoCentavos:5000, escopo:'todos', produtos:[] };
test('promoção exige subtotal estritamente acima do mínimo e pode ser desativada', () => {
    const itens = n => [{produtoId:'a',nome:'A',precoCentavos:n,qtd:1}];
    assert.equal(p.aplicar(itens(5000),regra).descontoCentavos,0);
    assert.equal(p.aplicar(itens(5001),regra).descontoCentavos,1000);
    assert.equal(p.aplicar(itens(6000),{...regra,ativa:false}).descontoCentavos,0);
    assert.throws(()=>p.configuracao({...regra,valorCentavos:6000}));
});
test('mínimo e desconto consideram somente produtos participantes', () => {
    const itens = [{produtoId:'a',precoCentavos:3000,qtd:2},{produtoId:'b',precoCentavos:9000,qtd:1}];
    const r = p.aplicar(itens,{...regra,escopo:'selecionados',produtos:['a']});
    assert.equal(r.descontoCentavos,1000);
    assert.deepEqual(r.itens.map(i=>i.descontoCentavos),[1000,0]);
    assert.equal(p.aplicar([{...itens[0],qtd:1},itens[1]],{...regra,escopo:'selecionados',produtos:['a']}).descontoCentavos,0);
});
test('arredondamento preserva centavos no checkout, pedidos e frete', () => {
    const itens = [{produtoId:'a',nome:'A',precoCentavos:2001,qtd:3},{produtoId:'b',nome:'B',precoCentavos:1,qtd:1}];
    const r=p.aplicar(itens,regra);
    assert.equal(r.itens.reduce((s,i)=>s+i.descontoCentavos,0),1000);
    const api=p.itensPagamento(r.itens);
    assert.ok(api.every(i=>i.price>0));
    assert.equal(api.reduce((s,i)=>s+i.price*i.quantity,0),5004);
    const pedidos=pagamento.distribuirFrete(r.itens,1268);
    assert.equal(pedidos.reduce((s,i)=>s+i.totalCentavos,0),6272);
});
