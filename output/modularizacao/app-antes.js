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
    const indicesPagamentos = new WeakMap();
    function pagamentosDoPedido(registros, pedidoId) {
        let indice = indicesPagamentos.get(registros);
        if (!indice || indice.tamanho !== registros.length) {
            const grupos = new Map();
            registros.forEach(item => {
                if (!grupos.has(item.pedidoId)) grupos.set(item.pedidoId, []);
                grupos.get(item.pedidoId).push(item);
            });
            indice = { tamanho: registros.length, grupos };
            indicesPagamentos.set(registros, indice);
        }
        return indice.grupos.get(pedidoId) || [];
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

    function recebidoCentavos(pedido, registros) {
        if (Number.isFinite(pedido.valorRecebido)) return centavos(pedido.valorRecebido);
        if (registros.length) return registros.reduce((total, item) => total + centavos(item.valor), 0);
        return pedido.pago === 'Sim' ? centavos(pedido.total) : 0;
    }

    async function registrarPagamento(db, uid, id, entrada) {
        const valor = centavos(entrada.valor);
        if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe pelo menos R$ 0,01.');
        const ref = db.collection('pedidos').doc(id);
        const historico = await db.collection('pagamentos').where('usuario', '==', uid).where('pedidoId', '==', id).get();
        const pagamentoRef = db.collection('pagamentos').doc();
        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists || doc.data().usuario !== uid) throw new Error('Pedido não encontrado.');
            const pedido = doc.data();
            const recebido = recebidoCentavos(pedido, historico.docs.map(d => d.data()));
            const total = centavos(pedido.total);
            if (valor > total - recebido) throw new Error('O pagamento supera o saldo atual. Atualize o pedido.');
            tx.set(pagamentoRef, { ...entrada, valor: valor / 100, usuario: uid, pedidoId: id,
                clienteId: pedido.clienteId || '', cliente: pedido.cliente || '', criadoEm: new Date() });
            tx.update(ref, { valorRecebido: (recebido + valor) / 100,
                pago: recebido + valor >= total ? 'Sim' : 'Não', atualizadoEm: new Date() });
        });
    }

    async function excluirPedido(db, uid, id) {
        const ref = db.collection('pedidos').doc(id);
        // A consulta ocorre fora da transação. O saldo e cada documento são
        // conferidos novamente antes de excluir para detectar pagamentos concorrentes.
        const historico = await db.collection('pagamentos').where('usuario', '==', uid).where('pedidoId', '==', id).get();
        if (historico.docs.length > 450) throw new Error('Pedido com muitos pagamentos: exclusão requer revisão do histórico.');
        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists || doc.data().usuario !== uid) throw new Error('Pedido não encontrado.');
            const pagamentos = [];
            for (const item of historico.docs) {
                const atual = await tx.get(item.ref);
                if (!atual.exists) throw new Error('O histórico mudou. Atualize a tela e tente novamente.');
                pagamentos.push(atual.data());
            }
            const soma = pagamentos.reduce((total, item) => total + centavos(item.valor), 0);
            if (Number.isFinite(doc.data().valorRecebido) && soma !== centavos(doc.data().valorRecebido)) {
                throw new Error('O histórico mudou ou contém quitação antiga. Confira os pagamentos antes de excluir.');
            }
            historico.docs.forEach(item => tx.delete(item.ref));
            tx.delete(ref);
        });
    }

    function custoPendente(pedido) {
        return pedido.custoConfirmado === false || (pedido.origem === 'catalogo'
            && pedido.custoConfirmado !== true && !(Number(pedido.custo) > 0));
    }
    function lucro(pedido) {
        return custoPendente(pedido) ? 0 : Number(pedido.total || 0) - Number(pedido.qtd || 0) * Number(pedido.custo || 0);
    }
    function recebimentos(pedidos, pagamentos) {
        const ids = new Set(pedidos.map(p => p.docId));
        const registros = pagamentos.filter(p => ids.has(p.pedidoId));
        const comHistorico = new Set(registros.map(p => p.pedidoId));
        // dataPagamento é vencimento, não comprova quando uma quitação antiga ocorreu.
        const antigos = pedidos.filter(p => !comHistorico.has(p.docId) && p.pago === 'Sim')
            .map(p => ({ pedidoId: p.docId, valor: Number(p.total || 0), data: '', dataDesconhecida: true }));
        return [...registros, ...antigos];
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
    return { centavos, telefone, nome, copiar, chaveCliente, salvarCliente, recebidoCentavos, pagamentosDoPedido, embalagem,
        registrarPagamento, excluirPedido, custoPendente, lucro, recebimentos, mesclarConfiguracao };
})();
