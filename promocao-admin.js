/* Promoção editada separadamente do banner; grava apenas o campo promocao. */
let promocaoBase = null;
async function carregarPromocao() {
    const doc = await db.collection('configuracoes').doc('checkout').get({ source: 'server' });
    if (!doc.exists || doc.data().usuario !== auth.currentUser?.uid) throw new Error('Configuração da loja indisponível.');
    promocaoBase = doc.data().promocao || null;
    const r = promocaoBase || {};
    document.getElementById('promocaoAtiva').checked = r.ativa === true;
    document.getElementById('promocaoValor').value = (r.valorCentavos ?? 1000) / 100;
    document.getElementById('promocaoMinimo').value = (r.minimoCentavos ?? 5000) / 100;
    document.getElementById('promocaoEscopo').value = r.escopo || 'todos';
    document.getElementById('promocaoProdutos').dataset.preenchido = '';
    renderProdutosPromocao();
}
function renderProdutosPromocao() {
    const lista = document.getElementById('promocaoProdutos');
    const marcados = new Set(lista.dataset.preenchido
        ? [...lista.querySelectorAll('input:checked')].map(c => c.value) : promocaoBase?.produtos || []);
    lista.replaceChildren();
    produtos.forEach(p => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.value = p.docId; checkbox.checked = marcados.has(p.docId);
        label.append(checkbox, document.createTextNode(' ' + p.nome + (p.ativo ? '' : ' (inativo)')));
        label.style.display = 'block'; lista.appendChild(label);
    });
    lista.dataset.preenchido = 'sim';
    lista.hidden = document.getElementById('promocaoEscopo').value !== 'selecionados';
}
async function salvarPromocao() {
    const botao = document.getElementById('salvarPromocao');
    if (botao.disabled) return;
    botao.disabled = true;
    const aviso = document.getElementById('promocaoStatus');
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('Entre na sua conta antes de salvar.');
        const valor = document.getElementById('promocaoValor').value;
        const minimo = document.getElementById('promocaoMinimo').value;
        const r = { ativa: document.getElementById('promocaoAtiva').checked,
            valorCentavos: LV.centavos(valor), minimoCentavos: LV.centavos(minimo),
            escopo: document.getElementById('promocaoEscopo').value,
            produtos: [...document.querySelectorAll('#promocaoProdutos input:checked')].map(c => c.value) };
        if (!valor || !minimo || !Number.isSafeInteger(r.valorCentavos) || r.valorCentavos <= 0
            || !Number.isSafeInteger(r.minimoCentavos) || r.minimoCentavos < r.valorCentavos || r.minimoCentavos > 10000000) {
            throw new Error('Informe desconto maior que zero e mínimo igual ou maior que o desconto.');
        }
        if (r.escopo === 'selecionados' && (!r.produtos.length || r.produtos.length > 100)) throw new Error('Selecione de 1 a 100 produtos.');
        if (r.escopo === 'todos') r.produtos = [];
        const ref = db.collection('configuracoes').doc('checkout');
        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (!doc.exists || doc.data().usuario !== uid) throw new Error('Configuração de outra loja ou indisponível.');
            if (JSON.stringify(doc.data().promocao || null) !== JSON.stringify(promocaoBase)) throw new Error('A promoção mudou em outra tela. Recarregue antes de salvar.');
            tx.update(ref, { promocao: r });
        });
        promocaoBase = r;
        aviso.textContent = r.ativa ? 'Promoção salva e ativada. Atualize também o banner com os mesmos valores.' : 'Promoção salva e desativada.';
    } catch (erro) { aviso.textContent = erro.message || 'Não foi possível salvar a promoção.'; }
    finally { botao.disabled = false; }
}
