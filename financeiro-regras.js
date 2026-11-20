/* Regras financeiras. Carregado apenas nas áreas que consultam ou registram valores. */
window.LVFinanceiro = (() => {
    const centavos = valor => LV.centavos(valor);
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

    function recebidoCentavos(pedido, registros) {
        if (Number.isFinite(pedido.valorRecebido)) return centavos(pedido.valorRecebido);
        if (registros.length) return registros.reduce((total, item) => total + centavos(item.valor), 0);
        return pedido.pago === 'Sim' ? centavos(pedido.total) : 0;
    }

    async function registrarPagamento(db, uid, id, entrada) {
        const valor = centavos(entrada.valor);
        const taxaReal = centavos(entrada.taxaReal || 0);
        if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe pelo menos R$ 0,01.');
        if (!Number.isFinite(taxaReal) || taxaReal < 0 || taxaReal > valor) throw new Error('Confira a taxa descontada.');
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
            tx.set(pagamentoRef, { ...entrada, valor: valor / 100, taxaReal: taxaReal / 100, usuario: uid, registradoPor: uid, pedidoId: id,
                clienteId: pedido.clienteId || '', cliente: pedido.cliente || '', criadoEm: new Date() });
            tx.update(ref, { valorRecebido: (recebido + valor) / 100,
                pago: recebido + valor >= total ? 'Sim' : 'Não', atualizadoEm: new Date() });
        });
    }

    function vencimentoMensal(primeiroVencimento, indice) {
        const partes = String(primeiroVencimento || '').split('-').map(Number);
        if (partes.length !== 3 || partes.some(valor => !Number.isInteger(valor))) throw new Error('Informe a data do primeiro vencimento.');
        const [ano, mes, dia] = partes;
        const ultimoDia = new Date(ano, mes + indice, 0).getDate();
        const data = new Date(ano, mes - 1 + indice, Math.min(dia, ultimoDia));
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    }

    async function criarParcelamento(db, uid, id, quantidade, primeiroVencimento) {
        quantidade = Number(quantidade);
        if (!Number.isInteger(quantidade) || quantidade < 2 || quantidade > 12) throw new Error('Escolha entre 2 e 12 parcelas.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(primeiroVencimento || ''))) throw new Error('Informe o primeiro vencimento.');
        const ref = db.collection('pedidos').doc(id);
        const historico = await db.collection('pagamentos').where('usuario', '==', uid).where('pedidoId', '==', id).get();
        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists || doc.data().usuario !== uid) throw new Error('Pedido não encontrado.');
            const pedido = doc.data();
            const total = centavos(pedido.total);
            if (total < 10000) throw new Error('O parcelamento está disponível para pedidos a partir de R$ 100,00.');
            const recebido = recebidoCentavos(pedido, historico.docs.map(item => item.data()));
            const saldo = total - recebido;
            if (saldo <= 0) throw new Error('Este pedido já está quitado.');
            const existentes = pedido.parcelamento?.parcelas || [];
            if (existentes.some(parcela => parcela.pago === true)) throw new Error('Já existe parcela paga. O plano não pode ser substituído.');
            const valorBase = Math.floor(saldo / quantidade);
            const resto = saldo % quantidade;
            const agora = new Date();
            const parcelas = Array.from({ length: quantidade }, (_, indice) => ({
                id: `parcela-${indice + 1}`,
                numero: indice + 1,
                valor: (valorBase + (indice < resto ? 1 : 0)) / 100,
                vencimento: vencimentoMensal(primeiroVencimento, indice),
                pago: false,
                pagoEm: null,
                pagamentoId: ''
            }));
            tx.update(ref, { parcelamento: { quantidade, valorFinanciado: saldo / 100, criadoEm: agora, criadoPor: uid, parcelas }, atualizadoEm: agora });
        });
    }

    async function registrarParcela(db, uid, id, parcelaId, entrada) {
        const ref = db.collection('pedidos').doc(id);
        const historico = await db.collection('pagamentos').where('usuario', '==', uid).where('pedidoId', '==', id).get();
        const pagamentoRef = db.collection('pagamentos').doc();
        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists || doc.data().usuario !== uid) throw new Error('Pedido não encontrado.');
            const pedido = doc.data();
            const parcelamento = pedido.parcelamento;
            const parcelas = Array.isArray(parcelamento?.parcelas) ? parcelamento.parcelas.map(parcela => ({ ...parcela })) : [];
            const indice = parcelas.findIndex(parcela => parcela.id === parcelaId);
            if (indice < 0) throw new Error('Parcela não encontrada.');
            if (parcelas[indice].pago === true) throw new Error('Esta parcela já foi registrada como paga.');
            const valor = centavos(parcelas[indice].valor);
            const taxaReal = centavos(entrada.taxaReal || 0);
            if (!Number.isFinite(taxaReal) || taxaReal < 0 || taxaReal > valor) throw new Error('Confira a taxa descontada.');
            const recebido = recebidoCentavos(pedido, historico.docs.map(item => item.data()));
            const total = centavos(pedido.total);
            if (valor <= 0 || valor > total - recebido) throw new Error('O valor da parcela supera o saldo atual. Atualize o pedido.');
            const agora = new Date();
            parcelas[indice] = { ...parcelas[indice], pago: true, pagoEm: agora, dataPagamento: entrada.data, forma: entrada.forma, pagamentoId: pagamentoRef.id };
            tx.set(pagamentoRef, { valor: valor / 100, taxaReal: taxaReal / 100, origem: entrada.origem || 'direta', data: entrada.data, forma: entrada.forma,
                parcelaId, parcelaNumero: parcelas[indice].numero, usuario: uid, registradoPor: uid, pedidoId: id,
                clienteId: pedido.clienteId || '', cliente: pedido.cliente || '', criadoEm: agora });
            tx.update(ref, { parcelamento: { ...parcelamento, parcelas }, valorRecebido: (recebido + valor) / 100,
                pago: recebido + valor >= total ? 'Sim' : 'Não', atualizadoEm: agora });
        });
    }

    function chaveClientePedido(pedido) {
        return `${LV.nome(pedido.cliente)}:${LV.telefone(pedido.telefone)}`;
    }

    async function criarParcelamentoCliente(db, uid, parcelamentoId, pedidoIds, quantidade, primeiroVencimento) {
        quantidade = Number(quantidade);
        if (!Number.isInteger(quantidade) || quantidade < 2 || quantidade > 12) throw new Error('Escolha entre 2 e 12 parcelas.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(primeiroVencimento || ''))) throw new Error('Informe o primeiro vencimento.');
        pedidoIds = [...new Set(Array.isArray(pedidoIds) ? pedidoIds : [])];
        if (!pedidoIds.length || pedidoIds.length > 50 || pedidoIds.some(id => !/^[^/]{1,150}$/.test(String(id)))) throw new Error('Pedidos inválidos para o parcelamento.');
        const grupoRef = parcelamentoId ? db.collection('parcelamentosClientes').doc(parcelamentoId) : db.collection('parcelamentosClientes').doc();
        const refs = pedidoIds.map(id => db.collection('pedidos').doc(id));
        await db.runTransaction(async tx => {
            const grupoDoc = parcelamentoId ? await tx.get(grupoRef) : null;
            const docs = [];
            for (const ref of refs) docs.push(await tx.get(ref));
            if (docs.some(doc => !doc.exists || doc.data().usuario !== uid)) throw new Error('Um dos pedidos não foi encontrado.');
            const pedidos = docs.map(doc => doc.data());
            const chave = chaveClientePedido(pedidos[0]);
            if (!chave || pedidos.some(pedido => chaveClientePedido(pedido) !== chave)) throw new Error('Os pedidos precisam pertencer ao mesmo cliente.');
            if (grupoDoc?.exists && grupoDoc.data().usuario !== uid) throw new Error('Parcelamento não encontrado.');
            if (grupoDoc?.exists && (grupoDoc.data().parcelas || []).some(parcela => parcela.pago)) throw new Error('Já existe parcela paga. O plano não pode ser substituído.');
            if (pedidos.some(pedido => pedido.parcelamentoGrupoId && pedido.parcelamentoGrupoId !== grupoRef.id)) throw new Error('Um dos pedidos já pertence a outro parcelamento. Atualize a tela.');
            if (pedidos.some(pedido => pedido.parcelamento?.parcelas?.length)) throw new Error('Um dos pedidos já possui parcelamento individual.');
            const saldos = pedidos.map(pedido => Math.max(0, centavos(pedido.total) - recebidoCentavos(pedido, [])));
            const saldo = saldos.reduce((total, valor) => total + valor, 0);
            const totalPedidos = pedidos.reduce((total, pedido) => total + centavos(pedido.total), 0);
            if (totalPedidos < 10000) throw new Error('O total conjunto precisa ser de pelo menos R$ 100,00.');
            if (saldo <= 0) throw new Error('Os pedidos já estão quitados.');
            const valorBase = Math.floor(saldo / quantidade);
            const resto = saldo % quantidade;
            const agora = new Date();
            const parcelas = Array.from({ length: quantidade }, (_, indice) => ({
                id: `parcela-${indice + 1}`, numero: indice + 1,
                valor: (valorBase + (indice < resto ? 1 : 0)) / 100,
                vencimento: vencimentoMensal(primeiroVencimento, indice), pago: false, pagoEm: null
            }));
            const dados = { usuario: uid, cliente: pedidos[0].cliente || '', clienteId: pedidos[0].clienteId || '',
                telefone: pedidos[0].telefone || '', pedidoIds, quantidade, valorFinanciado: saldo / 100,
                parcelas, atualizadoEm: agora };
            if (grupoDoc?.exists) tx.update(grupoRef, dados);
            else tx.set(grupoRef, { ...dados, criadoEm: agora });
            docs.forEach(doc => tx.update(doc.ref, { parcelamentoGrupoId: grupoRef.id, atualizadoEm: agora }));
        });
        return grupoRef.id;
    }

    async function registrarParcelaCliente(db, uid, parcelamentoId, parcelaId, entrada) {
        const grupoRef = db.collection('parcelamentosClientes').doc(parcelamentoId);
        await db.runTransaction(async tx => {
            const grupoDoc = await tx.get(grupoRef);
            if (!grupoDoc.exists || grupoDoc.data().usuario !== uid) throw new Error('Parcelamento não encontrado.');
            const grupo = grupoDoc.data();
            const parcelas = Array.isArray(grupo.parcelas) ? grupo.parcelas.map(parcela => ({ ...parcela })) : [];
            const indice = parcelas.findIndex(parcela => parcela.id === parcelaId);
            if (indice < 0) throw new Error('Parcela não encontrada.');
            if (parcelas[indice].pago) throw new Error('Esta parcela já foi registrada como paga.');
            const refs = (grupo.pedidoIds || []).map(id => db.collection('pedidos').doc(id));
            const docs = [];
            for (const ref of refs) docs.push(await tx.get(ref));
            if (!docs.length || docs.some(doc => !doc.exists || doc.data().usuario !== uid || doc.data().parcelamentoGrupoId !== parcelamentoId)) throw new Error('Os pedidos do parcelamento foram alterados. Atualize a tela.');
            let restante = centavos(parcelas[indice].valor);
            const valorParcela = restante;
            const taxaTotal = centavos(entrada.taxaReal || 0);
            if (!Number.isFinite(taxaTotal) || taxaTotal < 0 || taxaTotal > valorParcela) throw new Error('Confira a taxa descontada.');
            let taxaRestante = taxaTotal;
            const agora = new Date();
            for (const doc of docs) {
                if (restante <= 0) break;
                const pedido = doc.data();
                const recebido = recebidoCentavos(pedido, []);
                const saldoPedido = Math.max(0, centavos(pedido.total) - recebido);
                const aplicado = Math.min(restante, saldoPedido);
                if (aplicado <= 0) continue;
                const pagamentoRef = db.collection('pagamentos').doc();
                const taxaAplicada = restante === aplicado ? taxaRestante : Math.round(taxaTotal * aplicado / valorParcela);
                taxaRestante -= taxaAplicada;
                tx.set(pagamentoRef, { valor: aplicado / 100, taxaReal: taxaAplicada / 100, origem: entrada.origem || 'direta', data: entrada.data, forma: entrada.forma,
                    parcelaId, parcelaNumero: parcelas[indice].numero, parcelamentoGrupoId: parcelamentoId,
                    usuario: uid, registradoPor: uid, pedidoId: doc.id, clienteId: pedido.clienteId || '', cliente: pedido.cliente || '', criadoEm: agora });
                tx.update(doc.ref, { valorRecebido: (recebido + aplicado) / 100,
                    pago: recebido + aplicado >= centavos(pedido.total) ? 'Sim' : 'Não', atualizadoEm: agora });
                restante -= aplicado;
            }
            if (restante > 0) throw new Error('O valor da parcela supera o saldo conjunto atual. Atualize a tela.');
            parcelas[indice] = { ...parcelas[indice], pago: true, pagoEm: agora, dataPagamento: entrada.data, forma: entrada.forma };
            tx.update(grupoRef, { parcelas, atualizadoEm: agora });
        });
    }

    async function excluirPedido(db, uid, id) {
        const ref = db.collection('pedidos').doc(id);
        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists || doc.data().usuario !== uid) throw new Error('Pedido não encontrado.');
            if (doc.data().parcelamentoGrupoId) throw new Error('Este pedido pertence a um parcelamento conjunto e não pode ser excluído separadamente.');
            if (doc.data().excluido === true) throw new Error('Este pedido já está na lixeira.');
            const agora = new Date();
            const alteracoes = [...(doc.data().historicoAlteracoes || []), { acao: 'excluído', em: agora, por: uid }].slice(-100);
            tx.update(ref, { excluido: true, excluidoEm: agora, excluidoPor: uid, historicoAlteracoes: alteracoes });
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


    return { recebidoCentavos, pagamentosDoPedido, registrarPagamento, criarParcelamento, registrarParcela,
        criarParcelamentoCliente, registrarParcelaCliente,
        excluirPedido, custoPendente, lucro, recebimentos };
})();
