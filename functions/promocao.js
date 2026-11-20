'use strict';
function configuracao(valor) {
    if (!valor || valor.ativa !== true) return { ativa: false };
    if (!Number.isSafeInteger(valor.valorCentavos) || valor.valorCentavos <= 0
        || !Number.isSafeInteger(valor.minimoCentavos) || valor.minimoCentavos < valor.valorCentavos
        || valor.minimoCentavos > 10000000 || !['todos', 'selecionados'].includes(valor.escopo)) {
        throw new Error('Confira o valor e o mínimo da promoção. O desconto não pode superar o mínimo.');
    }
    const produtos = valor.escopo === 'selecionados' ? valor.produtos : [];
    if (!Array.isArray(produtos) || produtos.length > 100 || (valor.escopo === 'selecionados' && !produtos.length)
        || produtos.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
        throw new Error('Selecione de 1 a 100 produtos participantes.');
    }
    return { ativa: true, valorCentavos: valor.valorCentavos, minimoCentavos: valor.minimoCentavos,
        escopo: valor.escopo, produtos: [...new Set(produtos)] };
}
function aplicar(itens, valor) {
    const regra = configuracao(valor);
    const elegiveis = itens.filter(i => regra.ativa && (regra.escopo === 'todos' || regra.produtos.includes(i.produtoId)));
    const subtotal = elegiveis.reduce((s, i) => s + i.precoCentavos * i.qtd, 0);
    const descontoCentavos = regra.ativa && subtotal > regra.minimoCentavos ? regra.valorCentavos : 0;
    const partes = elegiveis.map(i => {
        const proporcional = descontoCentavos * i.precoCentavos * i.qtd / subtotal;
        return { id: i.produtoId, valor: Math.floor(proporcional), resto: proporcional % 1 };
    });
    let faltam = descontoCentavos - partes.reduce((s, p) => s + p.valor, 0);
    partes.sort((a, b) => b.resto - a.resto || a.id.localeCompare(b.id));
    for (const parte of partes) { if (faltam > 0) { parte.valor++; faltam--; } }
    const descontos = new Map(partes.map(p => [p.id, p.valor]));
    return { descontoCentavos, itens: itens.map(i => ({ ...i, descontoCentavos: descontos.get(i.produtoId) || 0 })) };
}
function itensPagamento(itens) {
    return itens.flatMap(i => {
        const liquido = i.precoCentavos * i.qtd - (i.descontoCentavos || 0);
        if (liquido <= 0) return [];
        return i.descontoCentavos ? [{ quantity: 1, price: liquido, description: `${i.qtd} × ${i.nome} (promoção aplicada)` }]
            : [{ quantity: i.qtd, price: i.precoCentavos, description: i.nome }];
    });
}
module.exports = { configuracao, aplicar, itensPagamento };
