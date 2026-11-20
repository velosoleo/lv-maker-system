'use strict';
const crypto = require('node:crypto');
const { documentoValido } = require('./documento');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function texto(value, min, max, label) {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`Confira ${label}.`);
    return value.trim();
}
function comprador(data, entrega) {
    const nome = texto(data?.nome, 2, 100, 'seu nome');
    const telefone = String(data?.telefone || '').replace(/\D/g, '');
    if (!/^(?:55)?[0-9]{10,11}$/.test(telefone)) throw new Error('Informe seu WhatsApp com DDD.');
    const observacao = texto(data?.observacao || '', 0, 500, 'a observação');
    let endereco = null;
    if (entrega.tipo !== 'retirada') {
        const e = data?.endereco;
        endereco = { cep: texto(e?.cep, 8, 8, 'o CEP'), rua: texto(e?.rua, 2, 150, 'a rua'),
            bairro: texto(e?.bairro, 2, 100, 'o bairro'), numero: texto(e?.numero, 1, 20, 'o número'),
            complemento: texto(e?.complemento || '', 0, 100, 'o complemento') };
        if (!/^[0-9]{8}$/.test(endereco.cep)) throw new Error('CEP inválido.');
    }
    const documento = String(data?.documento || '').replace(/[.\s\/-]/g, '').toUpperCase();
    if ((entrega.tipo === 'transportadora' || documento) && !documentoValido(documento)) throw new Error('Informe um CPF ou CNPJ válido para o envio.');
    return { nome, telefone, observacao, endereco, ...(documento ? { documento } : {}) };
}
function confirmado(resposta, esperado) {
    return resposta?.success === true && resposta.paid === true
        && Number.isSafeInteger(resposta.amount) && resposta.amount === esperado
        && Number.isSafeInteger(resposta.paid_amount) && resposta.paid_amount >= esperado
        && ['pix', 'credit_card'].includes(resposta.capture_method)
        && Number.isInteger(resposta.installments) && resposta.installments >= 1 && resposta.installments <= 12;
}
function linkValido(url) {
    try { const u = new URL(url); return u.protocol === 'https:' && ['checkout.infinitepay.com.br', 'checkout.infinitepay.io'].includes(u.hostname) && !u.username && !u.password && !u.port; }
    catch (_) { return false; }
}
function distribuirFrete(itens, freteCentavos) {
    const subtotal = itens.reduce((s, i) => s + i.precoCentavos * i.qtd, 0);
    let distribuido = 0;
    return itens.map((i, n) => {
        const parte = n === itens.length - 1 ? freteCentavos - distribuido : Math.floor(freteCentavos * i.precoCentavos * i.qtd / subtotal);
        distribuido += parte;
        return { ...i, freteCentavos: parte, totalCentavos: i.precoCentavos * i.qtd - (i.descontoCentavos || 0) + parte };
    });
}
module.exports = { hash, texto, comprador, confirmado, linkValido, distribuirFrete };
