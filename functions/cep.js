'use strict';
async function consultarCep(cep, request = fetch) {
    if (!/^\d{8}$/.test(cep)) throw new Error('CEP inválido.');
    try {
        const resposta = await request(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5000) });
        if (!resposta.ok) throw new Error('Consulta indisponível.');
        const dados = await resposta.json();
        if (dados.erro) { const erro = new Error('CEP não encontrado.'); erro.naoEncontrado = true; throw erro; }
        if (String(dados.cep || '').replace(/\D/g, '') !== cep || !dados.localidade || !/^[A-Z]{2}$/.test(dados.uf || '')) throw new Error('Resposta inválida.');
        return { cep, localidade: dados.localidade, uf: dados.uf, bairro: dados.bairro || '', logradouro: dados.logradouro || '' };
    } catch (erro) { if (erro.naoEncontrado) throw erro; }
    const resposta = await request(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) throw new Error('Não foi possível confirmar o CEP.');
    const dados = await resposta.json();
    if (dados.cep !== cep || !dados.city || !/^[A-Z]{2}$/.test(dados.state || '')) throw new Error('Resposta de CEP inválida.');
    return { cep, localidade: dados.city, uf: dados.state, bairro: dados.neighborhood || '', logradouro: dados.street || '' };
}
module.exports = { consultarCep };
