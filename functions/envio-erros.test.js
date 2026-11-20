'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnostico } = require('./envio-erros');
test('diagnóstico identifica campos sem revelar mensagens, documentos ou chaves desconhecidas', () => {
    const d = diagnostico(422, 'cart', { message: 'documento secreto', errors: { 'from.document': ['CPF secreto'], 'from.phone': ['telefone secreto'], 'volumes.0.weight': ['peso recusado'], 'secreto': ['endereço secreto'] } });
    assert.match(d.mensagem, /remetente, peso ou medidas/);
    assert.doesNotMatch(JSON.stringify(d), /secreto|CPF|telefone/);
    assert.equal(d.etapa, 'criar envio');
});
test('saldo não é atribuído a uma recusa de criação sem diagnóstico', () => {
    assert.doesNotMatch(diagnostico(500, 'cart', {}).mensagem, /saldo/);
    assert.equal(diagnostico(403, 'shipment/checkout', {}).etapa, 'pagar etiqueta');
});
test('motivo de recusa preserva explicação e oculta valores enviados e credenciais', () => {
    const payload = { from: { name: 'Nome Particular', document: '52998224725', address: 'Rua Particular' } };
    const d = diagnostico(422, 'cart', { message: 'O remetente Nome Particular, Rua Particular, CPF 529.982.247-25 está inválido. Verifique a inscrição estadual. Contato teste@example.com; Bearer segredoabcdef123456789; https://exemplo.test/segredo' }, payload);
    assert.match(d.mensagem, /Verifique a inscrição estadual/);
    assert.doesNotMatch(d.mensagem, /Nome Particular|Rua Particular|529|teste@example|segredo/);
});
