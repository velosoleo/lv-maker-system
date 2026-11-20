'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { consultarCep } = require('./cep');
test('CEP usa alternativa na falha de rede e normaliza os campos', async () => {
    const consultas = [];
    const dados = await consultarCep('01001000', async url => {
        consultas.push(url);
        if (url.includes('viacep')) throw new Error('rede');
        return Response.json({ cep: '01001000', city: 'São Paulo', state: 'SP', neighborhood: 'Sé', street: 'Praça da Sé' });
    });
    assert.equal(consultas.length, 2); assert.equal(dados.localidade, 'São Paulo'); assert.equal(dados.uf, 'SP');
});
test('CEP inexistente não é aceito e formato inválido não consulta provedores', async () => {
    let consultas = 0;
    await assert.rejects(consultarCep('00000000', async () => { consultas++; return Response.json({ erro: true }); }));
    assert.equal(consultas, 1);
    await assert.rejects(consultarCep('../01001000', async () => { throw new Error('não deve consultar'); }));
});
test('CEP não aceita resposta de outro endereço', async () => {
    await assert.rejects(consultarCep('01001000', async url => Response.json(url.includes('viacep')
        ? { cep: '99999-999', localidade: 'Outra', uf: 'SP' }
        : { cep: '99999999', city: 'Outra', state: 'SP' })));
});
