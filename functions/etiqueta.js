'use strict';
const { texto } = require('./pagamento');
const { documentoValido } = require('./documento');
function pessoa(d, destinatario = false) {
    const documento = texto(d?.documento, 11, 18, 'o CPF ou CNPJ').replace(/[.\/-]/g, '').toUpperCase();
    if (!documentoValido(documento)) throw new Error('CPF ou CNPJ inválido.');
    const postal_code = texto(d?.cep, 8, 8, 'o CEP');
    if (!/^\d{8}$/.test(postal_code)) throw new Error('CEP inválido.');
    const telefone = String(d?.telefone || '').replace(/\D/g, '');
    if (!/^(?:55)?\d{10,11}$/.test(telefone)) throw new Error('Confira o telefone com DDD.');
    const email = texto(d?.email || '', destinatario ? 0 : 3, 150, 'o e-mail');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
    const state_abbr = texto(d?.uf, 2, 2, 'o estado').toUpperCase();
    if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(state_abbr)) throw new Error('Estado inválido.');
    const result = { name: texto(d?.nome, 2, 100, 'o nome'), phone: telefone, email,
        address: texto(d?.rua, 2, 150, 'a rua'), number: texto(d?.numero, 1, 20, 'o número'),
        district: texto(d?.bairro, 2, 100, 'o bairro'), city: texto(d?.cidade, 2, 100, 'a cidade'),
        complement: texto(d?.complemento || '', 0, 100, 'o complemento'), postal_code, state_abbr, country_id: 'BR',
        state_register: texto(d?.inscricaoEstadual || 'ISENTO', 1, 30, 'a inscrição estadual') };
    result[documento.length === 11 ? 'document' : 'company_document'] = documento;
    return result;
}
function volume(d) {
    const result = {};
    for (const key of ['width', 'height', 'length', 'weight']) {
        const v = d?.[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1000) throw new Error('Informe peso e medidas da embalagem pronta, maiores que zero.');
        result[key] = v;
    }
    return result;
}
function centavos(value) {
    if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Preço de envio inválido.');
    const n = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(n) || n > 10000000) throw new Error('Preço de envio inválido.');
    return n;
}
function imprimirURL(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && ['melhorenvio.com.br', 'sandbox.melhorenvio.com.br'].includes(u.hostname) && !u.username && !u.password; }
    catch (_) { return false; }
}
function payload(compra, cfg, dados) {
    if (compra.status !== 'pago' || compra.entrega?.tipo !== 'transportadora') throw new Error('Este pedido não tem um pagamento confirmado com transportadora.');
    const from = pessoa(cfg.remetente);
    if (from.postal_code !== cfg.cepOrigem) throw new Error('O CEP do remetente deve ser o CEP de origem cadastrado.');
    const e = compra.cliente.endereco;
    const to = pessoa({ ...e, nome: compra.cliente.nome, telefone: compra.cliente.telefone,
        documento: dados.documentoDestinatario || compra.cliente.documento, email: compra.cliente.email || '', cidade: dados.cidadeDestino, uf: dados.ufDestino }, true);
    const chaveNota = String(dados.chaveNota || '').replace(/\s/g, '');
    const declaracao = dados.documentoFiscal === 'declaracao';
    if (dados.documentoFiscal && !['nota', 'declaracao'].includes(dados.documentoFiscal)) throw new Error('Documento fiscal inválido.');
    if (declaracao) {
        if (dados.dispensaNotaConfirmada !== true) throw new Error('Confirme que este envio está dispensado de nota fiscal antes de usar a declaração.');
        if (from.state_register.toUpperCase() !== 'ISENTO') throw new Error('Confira a condição do remetente: declaração exige ausência de inscrição estadual ou ISENTO.');
        if (chaveNota) throw new Error('Não combine nota fiscal e declaração no mesmo envio.');
    } else if (!/^\d{44}$/.test(chaveNota) || /^(\d)\1+$/.test(chaveNota)) throw new Error('Informe a chave de acesso de 44 dígitos da nota fiscal para este envio comercial.');
    const service = compra.entrega.servicoId;
    if (!Number.isInteger(service) || !cfg.servicosEnvio?.some(s => s.id === service && s.ponto?.trim())) throw new Error('Configure o ponto de postagem deste serviço em Entregas.');
    const seguro = compra.itens.reduce((s, i) => s + i.precoCentavos * i.qtd, 0);
    const v = volume(dados.volume);
    return { service, from, to, products: compra.itens.map(i => ({ name: i.nome, quantity: i.qtd, unitary_value: i.precoCentavos / 100 })),
        volumes: [v], options: { platform: 'LV Maker', reminder: 'LV Maker ' + dados.checkoutId,
            insurance_value: seguro / 100, receipt: false, own_hand: false, reverse: false,
            ...(declaracao ? {} : { invoice: { key: chaveNota } }), tags: [{ tag: dados.checkoutId, url: null }] } };
}
function declaracaoURL(value) {
    if (imprimirURL(value)) return true;
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'me-0047-prod.s3.amazonaws.com' && !u.username && !u.password; } catch (_) { return false; }
}
module.exports = { documentoValido, pessoa, volume, centavos, imprimirURL, declaracaoURL, payload };
