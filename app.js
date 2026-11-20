/* Regras compartilhadas pelas telas administrativas. */
const LV = (() => {
    const centavos = valor => Math.round(Number(valor || 0) * 100);
    const telefone = valor => String(valor || '').replace(/\D/g, '');
    const nome = valor => String(valor || '').trim().toLocaleLowerCase('pt-BR')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const copiar = valor => JSON.parse(JSON.stringify(valor));
    const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function embalagem(dados) {
        const campos = ['pesoKg', 'larguraCm', 'alturaCm', 'comprimentoCm'];
        if (campos.every(campo => dados[campo] === '' || dados[campo] == null)) return null;
        const resultado = {};
        for (const campo of campos) {
            const valor = Number(dados[campo]);
            if (!Number.isFinite(valor) || valor <= 0 || valor > 1000) {
                throw new Error('Preencha peso e as três dimensões da embalagem com valores maiores que zero.');
            }
            resultado[campo] = valor;
        }
        return resultado;
    }
    function precoOrcamento({ custoBase, embalagem: custoEmbalagem, falhaPercentual, markup,
        margemSeguranca = 0, arredondamento = 0, lucroMinimo = 0, taxaVendaDireta = 0,
        taxaMarketplace = 0, impostoMarketplace = 0, taxaFixaMarketplace = 0 }) {
        const baseCentavos = Math.max(0, centavos(custoBase));
        const embalagemCentavos = Math.max(0, centavos(custoEmbalagem));
        const falha = Number(falhaPercentual || 0);
        const multiplicador = Number(markup || 1);
        const seguranca = Number(margemSeguranca || 0);
        const arredondar = Math.max(0, centavos(arredondamento));
        const minimoLucro = Math.max(0, centavos(lucroMinimo));
        const taxaDireta = Number(taxaVendaDireta || 0);
        const taxaMarket = Number(taxaMarketplace || 0) + Number(impostoMarketplace || 0);
        const fixaMarket = Math.max(0, centavos(taxaFixaMarketplace));
        if (!Number.isFinite(falha) || falha < 0 || falha >= 100 || !Number.isFinite(multiplicador) || multiplicador <= 0
            || !Number.isFinite(seguranca) || seguranca < 0 || !Number.isFinite(taxaDireta) || taxaDireta < 0 || taxaDireta >= 1
            || !Number.isFinite(taxaMarket) || taxaMarket < 0 || taxaMarket >= 1) {
            throw new Error('Percentual de falha ou markup inválido.');
        }
        const producaoComFalhaCentavos = Math.round(baseCentavos / (1 - falha / 100));
        const custoUnitarioCentavos = producaoComFalhaCentavos + embalagemCentavos;
        // A embalagem é repassada pelo custo exato; markup e risco incidem só na produção.
        const comMarkup = Math.round(producaoComFalhaCentavos * multiplicador) + embalagemCentavos;
        const minimoComLucro = custoUnitarioCentavos + minimoLucro;
        const precoMinimoCentavos = Math.ceil(custoUnitarioCentavos / (1 - taxaDireta));
        let recomendadoCentavos = Math.ceil(Math.max(comMarkup, minimoComLucro) * (1 + seguranca / 100) / (1 - taxaDireta));
        if (arredondar > 0) recomendadoCentavos = Math.ceil(recomendadoCentavos / arredondar) * arredondar;
        const marketplaceCentavos = Math.ceil((recomendadoCentavos + fixaMarket) / (1 - taxaMarket));
        const lucroDiretoCentavos = Math.round(recomendadoCentavos * (1 - taxaDireta)) - custoUnitarioCentavos;
        const lucroMarketplaceCentavos = Math.round(marketplaceCentavos * (1 - taxaMarket)) - fixaMarket - custoUnitarioCentavos;
        return {
            custoUnitario: custoUnitarioCentavos / 100,
            precoMinimo: precoMinimoCentavos / 100,
            precoSugerido: recomendadoCentavos / 100,
            precoRecomendado: recomendadoCentavos / 100,
            precoMarketplace: marketplaceCentavos / 100,
            lucroDireto: lucroDiretoCentavos / 100,
            lucroMarketplace: lucroMarketplaceCentavos / 100,
            margemDireta: recomendadoCentavos ? lucroDiretoCentavos / recomendadoCentavos * 100 : 0
        };
    }
    function chaveCliente(item) {
        return item.clienteId || `legado:${nome(item.cliente)}:${telefone(item.telefone)}`;
    }

    async function salvarCliente(db, user, nomeCliente, numero, id = '') {
        const dados = { usuario: user.uid, nome: nomeCliente, telefone: telefone(numero),
            nomeBusca: nome(nomeCliente), atualizadoEm: new Date() };
        if (!id && dados.telefone) {
            const snapshot = await db.collection('clientes').where('usuario', '==', user.uid).get();
            const encontrados = snapshot.docs.filter(doc => nome(doc.data().nome) === nome(nomeCliente)
                && telefone(doc.data().telefone) === dados.telefone);
            if (encontrados.length === 1) id = encontrados[0].id;
        }
        const ref = id ? db.collection('clientes').doc(id) : db.collection('clientes').doc();
        if (id) {
            const atual = await ref.get();
            if (!atual.exists || atual.data().usuario !== user.uid) throw new Error('Cadastro de cliente indisponível.');
            await ref.update(dados);
        } else {
            await ref.set({ ...dados, observacoes: '', criadoEm: new Date() });
        }
        return ref.id;
    }

    function mesclarObjeto(base, editado, atual) {
        const resultado = { ...atual };
        for (const campo of Object.keys(editado)) {
            if (igual(base[campo], editado[campo])) continue;
            if (!igual(atual[campo], base[campo]) && !igual(atual[campo], editado[campo])) {
                throw new Error('Este cadastro foi alterado em outra tela. Recarregue antes de salvar.');
            }
            resultado[campo] = copiar(editado[campo]);
        }
        return resultado;
    }
    function mesclarLista(base, editada, atual) {
        const resultado = copiar(atual);
        for (const antigo of base) {
            const novo = editada.find(item => item.id === antigo.id);
            const indice = resultado.findIndex(item => item.id === antigo.id);
            if (igual(antigo, novo)) continue;
            if (indice < 0) throw new Error('Um item foi removido em outra tela. Recarregue antes de salvar.');
            if (!novo) {
                if (!igual(antigo, resultado[indice])) throw new Error('O estoque mudou. Recarregue antes de excluir o item.');
                resultado.splice(indice, 1);
            } else resultado[indice] = mesclarObjeto(antigo, novo, resultado[indice]);
        }
        for (const novo of editada.filter(item => !base.some(antigo => antigo.id === item.id))) {
            if (resultado.some(item => item.id === novo.id)) throw new Error('Identificador já cadastrado. Recarregue a tela.');
            resultado.push(copiar(novo));
        }
        return resultado;
    }
    function mesclarConfiguracao(base, editada, atual) {
        const resultado = { ...atual, params: mesclarObjeto(base.params, editada.params, atual.params || {}) };
        for (const campo of ['filamentos', 'impressoras', 'insumosCadastrados']) {
            resultado[campo] = mesclarLista(base[campo] || [], editada[campo] || [], atual[campo] || []);
        }
        return resultado;
    }
    // A dependência financeira é resolvida somente quando uma rotina a utiliza.
    function chamarFinanceiro(rotina, argumentos) {
        const modulo = window.LVFinanceiro;
        if (!modulo || typeof modulo[rotina] !== 'function') {
            throw new Error('As regras financeiras não carregaram. Recarregue esta área antes de continuar.');
        }
        return modulo[rotina](...argumentos);
    }
    const recebidoCentavos = (...args) => chamarFinanceiro('recebidoCentavos', args);
    const pagamentosDoPedido = (...args) => chamarFinanceiro('pagamentosDoPedido', args);
    const registrarPagamento = (...args) => chamarFinanceiro('registrarPagamento', args);
    const criarParcelamento = (...args) => chamarFinanceiro('criarParcelamento', args);
    const registrarParcela = (...args) => chamarFinanceiro('registrarParcela', args);
    const criarParcelamentoCliente = (...args) => chamarFinanceiro('criarParcelamentoCliente', args);
    const registrarParcelaCliente = (...args) => chamarFinanceiro('registrarParcelaCliente', args);
    const excluirPedido = (...args) => chamarFinanceiro('excluirPedido', args);
    const custoPendente = (...args) => chamarFinanceiro('custoPendente', args);
    const lucro = (...args) => chamarFinanceiro('lucro', args);
    const recebimentos = (...args) => chamarFinanceiro('recebimentos', args);
    return { centavos, telefone, nome, copiar, chaveCliente, salvarCliente, recebidoCentavos, pagamentosDoPedido, embalagem, precoOrcamento,
        registrarPagamento, criarParcelamento, registrarParcela, criarParcelamentoCliente, registrarParcelaCliente,
        excluirPedido, custoPendente, lucro, recebimentos, mesclarConfiguracao };
})();
