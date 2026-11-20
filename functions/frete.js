'use strict';
const promocao = require('./promocao');
const normalizar = valor => String(valor || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function prazoProducao(itens) { return itens.length && itens.every(i => i.disponibilidade === 'pronta_entrega') ? 0 : 1; }
function itensSolicitados(itens) {
    if (!Array.isArray(itens) || itens.length < 1 || itens.length > 20) throw new Error('Selecione entre 1 e 20 produtos.');
    const resultado = new Map();
    for (const item of itens) {
        if (!item || typeof item.produtoId !== 'string' || !/^[^/\s]{1,150}$/.test(item.produtoId)
            || !Number.isInteger(item.qtd) || item.qtd < 1 || item.qtd > 100) throw new Error('Produto ou quantidade inválida.');
        const opcaoId = typeof item.opcaoId === 'string' && /^[a-zA-Z0-9_-]{0,80}$/.test(item.opcaoId) ? item.opcaoId : '';
        const personalizacao = {};
        for (const [campo, valor] of Object.entries(item.personalizacao || {})) {
            if (!['cor','tamanho','nome','texto','modelo','referencia'].includes(campo) || typeof valor !== 'string') throw new Error('Personalização inválida.');
            const limite = campo === 'referencia' ? 500 : 120;
            const limpo = valor.trim();
            if (!limpo || limpo.length > limite || /[<>]/.test(limpo)) throw new Error('Personalização inválida.');
            if (campo === 'referencia') { try { if (new URL(limpo).protocol !== 'https:') throw new Error(); } catch (_) { throw new Error('Link de referência inválido.'); } }
            personalizacao[campo] = limpo;
        }
        const chave = JSON.stringify([item.produtoId, opcaoId, Object.entries(personalizacao).sort(([a], [b]) => a.localeCompare(b))]);
        const anterior = resultado.get(chave);
        const qtd = (anterior?.qtd || 0) + item.qtd;
        if (qtd > 100) throw new Error('Quantidade máxima de 100 unidades por produto.');
        resultado.set(chave, { produtoId: item.produtoId, qtd,
            ...(opcaoId ? { opcaoId } : {}), ...(Object.keys(personalizacao).length ? { personalizacao } : {}) });
    }
    return [...resultado.values()];
}
function produtosConferidos(itens, registros) {
    return itens.map((item, i) => {
        const p = registros[i];
        const opcao = item.opcaoId ? (p?.variacoes || []).find(v => v.id === item.opcaoId) : null;
        if (item.opcaoId && !opcao) throw new Error('A opção escolhida não está mais disponível. Atualize o carrinho.');
        const permitidos = p?.personalizacoes || {};
        if (Object.keys(item.personalizacao || {}).some(campo => permitidos[campo] !== true)
            || Object.keys(permitidos).some(campo => permitidos[campo] === true && !item.personalizacao?.[campo])) throw new Error('Confira a personalização do produto.');
        const adicionalCentavos = Math.round(Number(opcao?.adicional || 0) * 100);
        const precoCentavos = Math.round(Number(p?.preco) * 100) + adicionalCentavos;
        if (!p?.ativo || !Number.isSafeInteger(precoCentavos) || precoCentavos < 1) throw new Error('Um produto não está disponível. Atualize o carrinho.');
        if (p.disponibilidade === 'pronta_entrega' && (!Number.isFinite(Number(p.estoquePronto)) || Number(p.estoquePronto) < item.qtd)) {
            throw new Error('Quantidade indisponível em estoque. Atualize o carrinho.');
        }
        const detalhes = [opcao?.nome, ...Object.values(item.personalizacao || {})].filter(Boolean).join(' · ');
        const nome = `${String(p.nome || 'Produto')}${detalhes ? ' — ' + detalhes : ''}`.slice(0, 200);
        return { ...item, opcaoNome: String(opcao?.nome || ''), nome, precoCentavos, embalagem: p.embalagem || null, disponibilidade: p.disponibilidade || 'sob_demanda' };
    });
}
function produtosParaFrete(produtos) {
    return produtos.map(p => {
        const e = p.embalagem;
        if (!e || ['pesoKg', 'larguraCm', 'alturaCm', 'comprimentoCm'].some(campo => !Number.isFinite(e[campo]) || e[campo] <= 0 || e[campo] > 1000)) {
            throw new Error(`As medidas de envio de ${p.nome} ainda precisam ser cadastradas.`);
        }
        return { id: p.produtoId, quantity: p.qtd, width: e.larguraCm, height: e.alturaCm,
            length: e.comprimentoCm, weight: e.pesoKg, insurance_value: p.precoCentavos / 100 };
    });
}
function bairrosEntregaLocal(local, cidade) {
    const nome = ['Guaramirim', 'Jaraguá do Sul'].find(c => normalizar(c) === normalizar(cidade));
    const bairros = local?.bairrosPorCidade?.[nome] ?? local?.bairros ?? [];
    if (!Array.isArray(bairros)) throw new Error('Confira os bairros da entrega local.');
    return bairros;
}
function opcoesProprias(config, destino, itens = []) {
    const opcoes = [];
    if (config.retiradaHabilitada === true) opcoes.push({ id: 'retirada', tipo: 'retirada', nome: 'Retirada no local', precoCentavos: 0, prazoDias: 0 });
    const local = config.entregaLocal;
    // Configurações antigas continuam atendendo somente Guaramirim.
    const cidades = local?.cidades ?? ['Guaramirim'];
    const cidade = ['Guaramirim', 'Jaraguá do Sul'].find(c => normalizar(c) === normalizar(destino.localidade));
    if (local?.habilitada === true && cidade && Array.isArray(cidades) && cidades.some(c => normalizar(c) === normalizar(cidade)) && destino.uf === 'SC'
        && Number.isSafeInteger(local.taxaCentavos) && local.taxaCentavos >= 0
        && Number.isInteger(local.prazoDias) && local.prazoDias >= 0 && local.prazoDias <= 30) {
        const bairros = bairrosEntregaLocal(local, cidade);
        // CEP geral sem bairro não confirma uma região restrita.
        if (!bairros.length || bairros.some(b => normalizar(b) === normalizar(destino.bairro))) {
            const minimo = local.gratisAcimaCentavos;
            let gratuita = false;
            if (Number.isSafeInteger(minimo) && minimo > 0 && minimo <= 10000000 && itens.length) {
                const subtotal = itens.reduce((s, i) => s + i.precoCentavos * i.qtd, 0);
                const desconto = promocao.aplicar(itens, config.promocao).descontoCentavos;
                gratuita = Number.isSafeInteger(subtotal) && subtotal - desconto > minimo;
            }
            opcoes.push({ id: 'local', tipo: 'local', nome: `Entrega pela LV Maker em ${cidade}${gratuita ? ' — frete grátis' : ''}`, precoCentavos: gratuita ? 0 : local.taxaCentavos, prazoDias: local.prazoDias });
        }
    }
    return opcoes;
}
function opcoesTransportadoras(resposta) {
    if (!Array.isArray(resposta)) throw new Error('Não foi possível obter as opções de frete.');
    return resposta.filter(s => !s.error).flatMap(s => {
        // Os campos customizados respeitam a tabela configurada na conta Melhor Envio.
        const valor = s.custom_price ?? s.price;
        const dias = s.custom_delivery_time ?? s.delivery_time;
        if (valor == null || dias == null || s.id == null || String(valor).trim() === '') return [];
        const preco = Number(valor);
        const prazo = Number(dias);
        if (!Number.isFinite(preco) || preco < 0 || preco > 100000 || !Number.isInteger(prazo) || prazo < 0 || prazo > 365 || !Number.isInteger(Number(s.id))) return [];
        return [{ id: 'me_' + s.id, tipo: 'transportadora', servicoId: Number(s.id), nome: `${s.company?.name || ''} ${s.name || ''}`.trim().slice(0, 150), precoCentavos: Math.round(preco * 100), prazoDias: prazo }];
    });
}
function avisoTransportadoras(resposta, habilitados, cotacoes) {
    const validos = new Set(cotacoes.map(o => o.servicoId));
    const ausentes = [...habilitados].filter(id => !validos.has(Number(id)));
    if (!ausentes.length) return '';
    return ausentes.map(id => {
        const servico = Array.isArray(resposta) ? resposta.find(s => Number(s.id) === Number(id)) : null;
        const nome = Number(id) === 1 ? 'Correios PAC' : Number(id) === 2 ? 'Correios SEDEX' : 'Uma transportadora selecionada';
        const erro = String(servico?.error || '').toLowerCase();
        const motivo = /seguro|insurance|declarad/.test(erro) ? 'confira o valor declarado e o seguro'
            : /peso|weight|altura|largura|comprimento|dimens|volume/.test(erro) ? 'confira peso e medidas da embalagem'
            : /cep|postal|cobertura|origem|destino|trecho/.test(erro) ? 'não disponível para este trecho ou CEP'
            : 'não retornou uma cotação disponível para este envio';
        return `${nome}: ${motivo}.`;
    }).join(' ');
}
module.exports = { prazoProducao, itensSolicitados, produtosConferidos, produtosParaFrete, bairrosEntregaLocal, opcoesProprias, opcoesTransportadoras, avisoTransportadoras };
