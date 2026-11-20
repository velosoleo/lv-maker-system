'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('./pagamento');
test('confirmação exige valor, aprovação e forma autoritativos', () => {
    const r = { success: true, paid: true, amount: 1000, paid_amount: 1100, installments: 12, capture_method: 'credit_card' };
    assert.equal(p.confirmado(r, 1000), true);
    for (const change of [{ amount: 999 }, { paid: false }, { paid_amount: 900 }, { installments: 13 }, { capture_method: 'debit' }, { amount: '1000' }]) assert.equal(p.confirmado({ ...r, ...change }, 1000), false);
});
test('frete distribuído preserva o total em centavos', () => {
    const itens = [{ precoCentavos: 101, qtd: 3 }, { precoCentavos: 215, qtd: 2 }, { precoCentavos: 7, qtd: 1 }];
    const resultado = p.distribuirFrete(itens, 999);
    assert.equal(resultado.reduce((s, i) => s + i.freteCentavos, 0), 999);
    assert.equal(resultado.reduce((s, i) => s + i.totalCentavos, 0), 1739);
});
test('link só aceita o domínio HTTPS do checkout', () => {
    assert.equal(p.linkValido('https://checkout.infinitepay.com.br/abc'), true);
    for (const url of ['http://checkout.infinitepay.com.br/abc', 'https://checkout.infinitepay.com.br.evil.com', 'javascript:alert(1)', 'https://user:pass@checkout.infinitepay.com.br']) assert.equal(p.linkValido(url), false);
});
test('endereço obrigatório para entrega e opcional para retirada', () => {
    const c = { nome: 'Cliente', telefone: '47999999999' };
    assert.equal(p.comprador(c, { tipo: 'retirada' }).endereco, null);
    assert.throws(() => p.comprador(c, { tipo: 'local' }));
    assert.throws(() => p.comprador({ ...c, telefone: '123' }, { tipo: 'retirada' }));
});
test('transportadora exige documento válido, armazenado somente no checkout privado', () => {
    const c = { nome: 'Cliente', telefone: '47999999999', endereco: {cep:'89270000',rua:'Rua teste',bairro:'Centro',numero:'10'} };
    assert.throws(() => p.comprador(c, {tipo:'transportadora'}));
    assert.throws(() => p.comprador({...c,documento:'11111111111'}, {tipo:'transportadora'}));
    assert.equal(p.comprador({...c,documento:'529.982.247-25'}, {tipo:'transportadora'}).documento,'52998224725');
});

test('checkout aceita os dois domínios exatos e rejeita imitações, credenciais e portas', () => {
    for (const host of ['checkout.infinitepay.io', 'checkout.infinitepay.com.br']) {
        assert.equal(p.linkValido('https://' + host + '/loja/fatura'), true);
        assert.equal(p.linkValido('http://' + host + '/loja/fatura'), false);
        assert.equal(p.linkValido('https://' + host + '.example.com/fatura'), false);
        assert.equal(p.linkValido('https://usuario@' + host + '/fatura'), false);
        assert.equal(p.linkValido('https://' + host + ':8443/fatura'), false);
    }
});
