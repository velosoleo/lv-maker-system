'use strict';
let checkoutDisponivel = false;
let promocaoCheckout = { ativa: false };
function descontoCarrinho() {
    const r = promocaoCheckout;
    if (!r.ativa) return 0;
    const subtotal = carrinho.filter(i => r.escopo === 'todos' || (r.produtos || []).includes(i.produto.docId))
        .reduce((s, i) => s + Math.round(Number(i.produto.preco) * 100) * i.qtd, 0);
    return subtotal > r.minimoCentavos ? r.valorCentavos : 0;
}
function mostrarPromocao() {
    const desconto = descontoCarrinho();
    const aviso = checkoutCampo('promocaoLoja');
    if (aviso) {
        aviso.hidden = !promocaoCheckout.ativa;
        aviso.textContent = promocaoCheckout.ativa ? 'Promoção no pagamento online: ' + dinheiroCheckout(promocaoCheckout.valorCentavos)
            + ' de desconto em compras acima de ' + dinheiroCheckout(promocaoCheckout.minimoCentavos)
            + (promocaoCheckout.escopo === 'todos' ? ' em produtos da loja.' : ' em produtos participantes.') : '';
    }
    for (const id of ['descontoCheckout', 'descontoCarrinho']) {
        const campo = checkoutCampo(id);
        if (campo) { campo.hidden = !desconto; campo.textContent = 'Desconto da promoção: − ' + dinheiroCheckout(desconto); }
    }
    return desconto;
}
let permiteRetirada = false;
let transportadorasCheckout = false;
let cotacaoCheckout = null;
let versaoFrete = 0;
let consultandoFrete = false;
const checkoutCampo = id => document.getElementById(id);
const dinheiroCheckout = centavos => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const prazoProducaoCheckout = () => cotacaoCheckout?.prazoProducaoDias ?? (carrinho.length && carrinho.every(i => i.produto.disponibilidade === 'pronta_entrega') ? 0 : 1);
const itemCheckoutServidor = i => ({ produtoId: i.produto.docId, qtd: i.qtd, opcaoId: i.produto.opcaoId || '', personalizacao: i.produto.personalizacao || {} });
function opcoesEntregaCheckout() {
    const opcoes = permiteRetirada ? [{ id: 'retirada', tipo: 'retirada', nome: 'Retirada no local', precoCentavos: 0 }] : [];
    return [...opcoes, ...(cotacaoCheckout?.opcoes || []).filter(o => o.id !== 'retirada')];
}
function montarOpcoesEntrega() {
    const select = checkoutCampo('opcaoEntrega');
    const anterior = select.value;
    select.replaceChildren();
    const vazio = document.createElement('option');
    vazio.value = ''; vazio.textContent = 'Escolha como receber'; select.appendChild(vazio);
    opcoesEntregaCheckout().forEach(o => {
        const option = document.createElement('option');
        option.value = o.id; option.textContent = `${o.nome} — ${dinheiroCheckout(o.precoCentavos)}${o.prazoDias == null || o.tipo === 'retirada' ? '' : ` (${o.prazoDias} dias úteis ${prazoProducaoCheckout() ? 'após a produção' : 'para entrega'})`}`;
        select.appendChild(option);
    });
    select.value = opcoesEntregaCheckout().some(o => o.id === anterior) ? anterior : '';
    selecionarEntrega();
}
function invalidarFrete() {
    if (!checkoutCampo('opcaoEntrega')) return;
    versaoFrete++;
    cotacaoCheckout = null;
    montarOpcoesEntrega();
}
function selecionarEntrega() {
    const o = opcoesEntregaCheckout().find(o => o.id === checkoutCampo('opcaoEntrega').value);
    checkoutCampo('enderecoCheckout').hidden = !o || o.tipo === 'retirada';
    const subtotal = carrinho.reduce((s, i) => s + Math.round(Number(i.produto.preco) * 100) * i.qtd, 0);
    const desconto = mostrarPromocao();
    checkoutCampo('totalCheckout').textContent = dinheiroCheckout(subtotal - desconto + (o?.precoCentavos || 0));
    const prazo = prazoProducaoCheckout();
    checkoutCampo('resumoFrete').textContent = o ? `Produtos: ${dinheiroCheckout(subtotal)} ${desconto ? ' · Desconto: − ' + dinheiroCheckout(desconto) : ''} · Entrega: ${dinheiroCheckout(o.precoCentavos)} · Total: ${dinheiroCheckout(subtotal - desconto + o.precoCentavos)} · ${prazo ? 'Produção: 1 dia antes do envio ou retirada. Pedidos mistos são enviados juntos.' : 'Pronta entrega: sem prazo de produção; preparação para envio ou retirada após o pagamento.'}` : 'Calcule o frete ou selecione a retirada, se disponível.';
}
async function calcularFreteCatalogo() {
    if (consultandoFrete || enviandoPedido || !carrinho.length) return;
    const cep = checkoutCampo('cepComprador').value.replace(/\D/g, '');
    if (!/^[0-9]{8}$/.test(cep)) { marcarErroCheckout('cepComprador', 'Informe um CEP com 8 dígitos.'); checkoutCampo('cepComprador').focus(); return; }
    limparErroCheckout('cepComprador');
    const versao = ++versaoFrete;
    consultandoFrete = true;
    checkoutCampo('botaoFrete').disabled = true;
    checkoutCampo('resumoFrete').textContent = 'Consultando opções de entrega...';
    try {
        const { data } = await LVIntegracoes.chamar(transportadorasCheckout ? 'cotarFrete' : 'cotarEntregaLocal', { cep, itens: carrinho.map(itemCheckoutServidor) });
        if (versao !== versaoFrete) return;
        cotacaoCheckout = { ...data, opcoes: data.opcoes.filter(o => o.tipo !== 'transportadora' || data.ambiente === 'producao') };
        if (data.rua) checkoutCampo('ruaComprador').value = data.rua;
        if (data.bairro) checkoutCampo('bairroComprador').value = data.bairro;
        montarOpcoesEntrega();
        if (!cotacaoCheckout.opcoes.length) checkoutCampo('resumoFrete').textContent = 'Nenhuma entrega disponível para compra neste CEP. Consulte a loja pelo WhatsApp.';
        else if (data.aviso) checkoutCampo('resumoFrete').textContent = data.aviso;
    } catch (erro) {
        if (versao !== versaoFrete) return;
        cotacaoCheckout = null;
        montarOpcoesEntrega();
        checkoutCampo('resumoFrete').textContent = erro.message || 'Não foi possível calcular o frete. Tente novamente.';
    } finally { consultandoFrete = false; checkoutCampo('botaoFrete').disabled = false; }
}

function resumoErrosCheckout() {
    let resumo = checkoutCampo('errosCheckout');
    if (!resumo) {
        resumo = document.createElement('p'); resumo.id = 'errosCheckout';
        resumo.className = 'checkout-erros'; resumo.setAttribute('role', 'alert');
        checkoutCampo('botaoPagamento').insertAdjacentElement('beforebegin', resumo);
    }
    return resumo;
}
function limparErroCheckout(id) {
    const campo = checkoutCampo(id), erro = checkoutCampo('erro_' + id);
    campo?.removeAttribute('aria-invalid');
    campo?.setCustomValidity('');
    if (erro) { erro.textContent = ''; erro.hidden = true; }
    if (campo) {
        const ids = (campo.getAttribute('aria-describedby') || '').split(' ').filter(v => v && v !== 'erro_' + id);
        if (ids.length) campo.setAttribute('aria-describedby', ids.join(' ')); else campo.removeAttribute('aria-describedby');
    }
}
function marcarErroCheckout(id, mensagem) {
    const campo = checkoutCampo(id);
    let erro = checkoutCampo('erro_' + id);
    if (!erro) { erro = document.createElement('p'); erro.id = 'erro_' + id; erro.className = 'checkout-erro-campo'; campo.insertAdjacentElement('afterend', erro); }
    erro.textContent = mensagem; erro.hidden = false;
    campo.setAttribute('aria-invalid', 'true');
    campo.setCustomValidity(mensagem);
    const ids = new Set((campo.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); ids.add(erro.id);
    campo.setAttribute('aria-describedby', [...ids].join(' '));
}
function documentoCheckoutValido(value) {
    const s = String(value || '').replace(/[.\s\/-]/g, '').toUpperCase();
    if (/^\d{11}$/.test(s)) {
        if (/^(\d)\1+$/.test(s)) return false;
        for (let n = 9; n <= 10; n++) {
            const resto = [...s.slice(0, n)].reduce((soma, v, i) => soma + Number(v) * (n + 1 - i), 0) * 10 % 11;
            if ((resto === 10 ? 0 : resto) !== Number(s[n])) return false;
        }
        return true;
    }
    if (!/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(\d)\1+$/.test(s)) return false;
    for (let n = 12; n <= 13; n++) {
        let peso = n === 12 ? 5 : 6;
        const soma = [...s.slice(0, n)].reduce((total, v) => { const resultado = total + (v.charCodeAt(0) - 48) * peso; peso = peso === 2 ? 9 : peso - 1; return resultado; }, 0);
        const resto = soma % 11;
        if ((resto < 2 ? 0 : 11 - resto) !== Number(s[n])) return false;
    }
    return true;
}
const camposValidacaoCheckout = ['nomeComprador', 'telefoneComprador', 'observacaoPedido', 'opcaoEntrega', 'cepComprador', 'documentoComprador', 'ruaComprador', 'bairroComprador', 'numeroComprador', 'complementoComprador'];
function validarDadosCheckout(entrega) {
    camposValidacaoCheckout.forEach(limparErroCheckout);
    const erros = [];
    const texto = id => checkoutCampo(id).value.trim();
    const tamanho = (id, min, max, mensagem) => { if (texto(id).length < min || texto(id).length > max) erros.push([id, mensagem]); };
    tamanho('nomeComprador', 2, 100, 'Informe seu nome, com 2 a 100 caracteres.');
    if (!/^(?:55)?[0-9]{10,11}$/.test(texto('telefoneComprador').replace(/\D/g, ''))) erros.push(['telefoneComprador', 'Informe um WhatsApp válido com DDD.']);
    tamanho('observacaoPedido', 0, 500, 'Use até 500 caracteres na observação.');
    if (!entrega) {
        if (!/^[0-9]{8}$/.test(texto('cepComprador').replace(/\D/g, ''))) erros.push(['cepComprador', 'Para entrega, informe o CEP e clique em Calcular frete; ou escolha retirada no local.']);
        erros.push(['opcaoEntrega', 'Escolha como deseja receber. Para envio, calcule o frete com seu CEP.']);
    }
    if (entrega && entrega.tipo !== 'retirada') {
        if (!/^[0-9]{8}$/.test(texto('cepComprador').replace(/\D/g, ''))) erros.push(['cepComprador', 'Informe um CEP com 8 dígitos e calcule o frete.']);
        else if (!cotacaoCheckout || cotacaoCheckout.expiraEm < Date.now()) erros.push(['cepComprador', 'Calcule o frete novamente antes de continuar.']);
        tamanho('ruaComprador', 2, 150, 'Informe a rua do endereço de entrega.');
        tamanho('bairroComprador', 2, 100, 'Informe o bairro do endereço de entrega.');
        tamanho('numeroComprador', 1, 20, 'Informe o número ou S/N, se o endereço não tiver número.');
        tamanho('complementoComprador', 0, 100, 'Use até 100 caracteres no complemento.');
        if (entrega.tipo === 'transportadora' && !documentoCheckoutValido(texto('documentoComprador'))) erros.push(['documentoComprador', 'Informe um CPF ou CNPJ válido para a etiqueta de envio.']);
    }
    const resumo = resumoErrosCheckout();
    resumo.hidden = !erros.length;
    resumo.textContent = erros.length ? 'Não foi possível continuar: ' + erros.map(([, mensagem]) => mensagem).join(' ') : '';
    erros.forEach(([id, mensagem]) => marcarErroCheckout(id, mensagem));
    if (erros.length) { const primeiro = checkoutCampo(erros[0][0]); primeiro.focus({ preventScroll: true }); primeiro.scrollIntoView({ block: 'center', behavior: 'instant' }); primeiro.reportValidity(); }
    return !erros.length;
}
camposValidacaoCheckout.forEach(id => {
    const campo = checkoutCampo(id);
    campo.addEventListener(id === 'opcaoEntrega' ? 'change' : 'input', () => {
        limparErroCheckout(id);
        if (!camposValidacaoCheckout.some(id => checkoutCampo(id).getAttribute('aria-invalid') === 'true')) resumoErrosCheckout().hidden = true;
    });
});
let conferindoTentativaCheckout = false;
let checkoutAnteriorConfirmado = null;
function linkCheckoutSeguro(valor) {
    try { const u = new URL(valor); return u.protocol === 'https:' && ['checkout.infinitepay.com.br', 'checkout.infinitepay.io'].includes(u.hostname) && !u.username && !u.password && !u.port; }
    catch (_) { return false; }
}
function mostrarCompraAnterior(tentativa) {
    const resultado = checkoutCampo('resultadoPagamento');
    resultado.replaceChildren();
    const aviso = document.createElement('p');
    aviso.textContent = 'Seu carrinho mudou. A compra anterior ainda tem um link de pagamento aberto. Se você já pagou, confira a confirmação antes de iniciar outra compra.';
    const retomar = document.createElement('a');
    retomar.href = checkoutAnteriorConfirmado.url;
    retomar.textContent = 'Retomar pagamento da compra anterior';
    const nova = document.createElement('button'); nova.type = 'button'; nova.className = 'btn-continuar';
    nova.textContent = 'Não paguei; continuar com o carrinho atual';
    nova.onclick = () => {
        try {
            const atual = JSON.parse(sessionStorage.getItem('lv_checkout') || 'null');
            if (atual?.chave !== tentativa.chave) { resultado.textContent = 'A tentativa mudou. Clique novamente em Ir para pagamento.'; return; }
            // Preserva o acesso à compra anterior: fechar a página não cancela o link no provedor.
            sessionStorage.setItem('lv_checkout_anterior', JSON.stringify(atual));
            sessionStorage.removeItem('lv_checkout');
        } catch (_) { resultado.textContent = 'Não foi possível guardar a tentativa anterior. Tente novamente.'; return; }
        checkoutAnteriorConfirmado = null;
        pagarCatalogo();
    };
    resultado.append(aviso, retomar, nova);
    resultado.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function conferirLiberacaoTentativa() {
    checkoutAnteriorConfirmado = null;
    let anterior;
    try { anterior = JSON.parse(sessionStorage.getItem('lv_checkout') || 'null'); } catch (_) { return false; }
    if (!anterior?.incerta || !anterior.pedidoId || !anterior.token) return false;
    conferindoTentativaCheckout = true;
    checkoutCampo('botaoPagamento').disabled = true;
    try {
        const { data } = await LVIntegracoes.chamar('consultarPagamento', { pedido: anterior.pedidoId, token: anterior.token });
        if (data.pago === true) {
            sessionStorage.setItem('lv_checkout_anterior', JSON.stringify(anterior));
            sessionStorage.removeItem('lv_checkout');
            checkoutCampo('resultadoPagamento').textContent = 'A compra anterior foi paga. Confira seu pedido antes de iniciar outra compra.';
            checkoutCampo('resultadoPagamento').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return true;
        }
        if (data.pago === false && linkCheckoutSeguro(data.url)) checkoutAnteriorConfirmado = { url: data.url };
        if (data.reiniciar === true && data.pago === false) {
            sessionStorage.removeItem('lv_checkout');
            invalidarFrete();
            checkoutCampo('resultadoPagamento').textContent = 'A tentativa anterior foi encerrada sem pagamento. Calcule o frete novamente, escolha como receber e clique em Ir para pagamento.';
            return true;
        }
    } catch (_) { /* Falhas de consulta mantêm a tentativa protegida. */ }
    finally { conferindoTentativaCheckout = false; checkoutCampo('botaoPagamento').disabled = false; }
    return false;
}
async function pagarCatalogo() {
    try { await executarPagamentoCatalogo(); }
    catch (_) {
        const aviso = resumoErrosCheckout();
        aviso.hidden = false;
        aviso.textContent = 'Não foi possível continuar. Confira os dados e tente novamente. Se persistir, entre em contato com a loja.';
        aviso.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}
async function executarPagamentoCatalogo() {
    if (enviandoPedido || conferindoTentativaCheckout) return;
    if (!checkoutDisponivel || !carrinho.length) {
        const aviso = resumoErrosCheckout(); aviso.hidden = false;
        aviso.textContent = !carrinho.length ? 'Adicione um produto ao carrinho antes de continuar.' : 'O pagamento está indisponível. Consulte a conexão ou tente novamente.';
        aviso.scrollIntoView({ block: 'center', behavior: 'smooth' }); return;
    }
    const resultado = checkoutCampo('resultadoPagamento');
    const entrega = opcoesEntregaCheckout().find(o => o.id === checkoutCampo('opcaoEntrega').value);
    if (!validarDadosCheckout(entrega)) return;
    if (await conferirLiberacaoTentativa()) return;
    const dados = { descontoEsperadoCentavos: descontoCarrinho(), itens: carrinho.map(itemCheckoutServidor), entregaId: entrega.id,
        cotacaoId: cotacaoCheckout?.cotacaoId || null,
        cliente: { nome: checkoutCampo('nomeComprador').value.trim(), telefone: checkoutCampo('telefoneComprador').value,
            documento: entrega.tipo === 'transportadora' ? checkoutCampo('documentoComprador').value.trim() : '',
            observacao: checkoutCampo('observacaoPedido').value.trim(), endereco: entrega.tipo === 'retirada' ? null : {
                cep: checkoutCampo('cepComprador').value.replace(/\D/g, ''), rua: checkoutCampo('ruaComprador').value.trim(),
                bairro: checkoutCampo('bairroComprador').value.trim(), numero: checkoutCampo('numeroComprador').value.trim(), complemento: checkoutCampo('complementoComprador').value.trim() } } };
    if (!navigator.onLine) { resultado.textContent = 'Conecte-se à internet para pagar.'; return; }
    // Mantém a identificação mesmo após uma resposta perdida ou um novo toque.
    const assinatura = JSON.stringify({ ...dados, cotacaoId: null });
    let tentativa;
    try {
        tentativa = JSON.parse(sessionStorage.getItem('lv_checkout') || 'null');
        let assinaturaAnterior = tentativa?.assinatura;
        try { assinaturaAnterior = JSON.stringify({ ...JSON.parse(assinaturaAnterior), cotacaoId: null }); } catch (_) {}
        if (tentativa?.incerta && checkoutAnteriorConfirmado) {
            if (assinaturaAnterior === assinatura) { window.location.assign(checkoutAnteriorConfirmado.url); return; }
            mostrarCompraAnterior(tentativa);
            return;
        }
        if (!tentativa || assinaturaAnterior !== assinatura) {
            if (tentativa?.incerta) { resultado.textContent = 'Há uma tentativa aguardando conferência. Consulte a loja antes de iniciar outra compra.'; resultado.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            tentativa = { assinatura, chave: crypto.randomUUID(), token: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') };
            sessionStorage.setItem('lv_checkout', JSON.stringify(tentativa));
        }
    } catch (_) { resultado.textContent = 'Permita o armazenamento neste navegador para iniciar o pagamento com segurança.'; return; }
    enviandoPedido = true;
    checkoutCampo('botaoPagamento').disabled = true;
    document.querySelector('button[onclick="finalizarPedido()"]').disabled = true;
    resultado.textContent = 'Preparando seu pagamento...';
    try {
        tentativa.incerta = true;
        tentativa.pedidoId = tentativa.chave;
        sessionStorage.setItem('lv_checkout', JSON.stringify(tentativa));
        const { data } = await LVIntegracoes.chamar('criarPagamento', { ...dados, chave: tentativa.chave, token: tentativa.token });
        const url = new URL(data.url);
        if (url.protocol !== 'https:' || !['checkout.infinitepay.com.br', 'checkout.infinitepay.io'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Link de pagamento inválido.');
        tentativa.pedidoId = data.pedidoId;
        tentativa.incerta = true;
        sessionStorage.setItem('lv_checkout', JSON.stringify(tentativa));
        window.location.assign(url.href);
    } catch (erro) {
        if (['functions/invalid-argument', 'functions/resource-exhausted', 'functions/permission-denied', 'functions/failed-precondition'].includes(erro.code) && !erro.details?.compraIniciada) sessionStorage.removeItem('lv_checkout');
        else { tentativa.incerta = true; sessionStorage.setItem('lv_checkout', JSON.stringify(tentativa)); }
        resultado.textContent = erro.message || 'Não foi possível preparar o pagamento. Consulte a loja antes de tentar outra compra.';
    } finally {
        enviandoPedido = false;
        checkoutCampo('botaoPagamento').disabled = false;
        document.querySelector('button[onclick="finalizarPedido()"]').disabled = false;
    }
}
let consultaOpcoesCheckout = null;
async function atualizarOpcoesCheckout() {
    if (consultaOpcoesCheckout || enviandoPedido) return consultaOpcoesCheckout;
    const status = checkoutCampo('statusCheckout');
    status.textContent = 'Consultando entrega e pagamento...';
    checkoutCampo('tentarCheckout').hidden = true;
    consultaOpcoesCheckout = Promise.resolve().then(() => LVIntegracoes.chamar('opcoesCheckout', {})).then(({ data }) => {
        const mudouEntrega = permiteRetirada !== (data.retirada === true) || transportadorasCheckout !== (data.transportadoras === true);

        promocaoCheckout = data.ativo === true ? (data.promocao || { ativa: false }) : { ativa: false };
        checkoutDisponivel = data.ativo === true;
        atualizarCarrinho(true);
        permiteRetirada = data.retirada === true;
        transportadorasCheckout = data.transportadoras === true;
        checkoutCampo('checkoutOnline').hidden = modoCheckout === 'pedido' || !checkoutDisponivel;
        checkoutCampo('botaoPagamento').hidden = modoCheckout === 'pedido' || !checkoutDisponivel;
        status.textContent = checkoutDisponivel ? '' : 'O pagamento online está desativado nesta loja. Você ainda pode enviar o pedido diretamente para a LV Maker.';
        if (mudouEntrega || !checkoutDisponivel) { versaoFrete++; cotacaoCheckout = null; }
        if (checkoutDisponivel) {
            montarOpcoesEntrega();
            try {
                const anterior = JSON.parse(sessionStorage.getItem('lv_checkout') || 'null');
                if (anterior?.incerta && anterior.pedidoId) {
                    const link = document.createElement('a');
                    link.href = `pagamento.html?pedido=${encodeURIComponent(anterior.pedidoId)}&token=${encodeURIComponent(anterior.token)}`;
                    link.textContent = 'Conferir pagamento da tentativa anterior';
                    checkoutCampo('resultadoPagamento').replaceChildren(link);
                }
            } catch (_) {}
        }
    }).catch(() => {
        promocaoCheckout = { ativa: false };
        atualizarCarrinho(true);
        checkoutDisponivel = false;
        versaoFrete++;
        cotacaoCheckout = null;
        checkoutCampo('checkoutOnline').hidden = true;
        checkoutCampo('botaoPagamento').hidden = true;
        selecionarEntrega();
        status.textContent = 'Não foi possível consultar entrega e pagamento. Tente novamente ou envie seu pedido diretamente para a LV Maker.';
    }).finally(() => {
        checkoutCampo('tentarCheckout').hidden = checkoutDisponivel;
        consultaOpcoesCheckout = null;
    });
    return consultaOpcoesCheckout;
}
window.addEventListener('online', () => {
    if (checkoutCampo('janelaCheckout').open) atualizarOpcoesCheckout();
});
atualizarOpcoesCheckout();
