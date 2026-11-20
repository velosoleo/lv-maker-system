'use strict';
const camposRemetente = [
    ['nome', 'Nome do remetente'], ['documento', 'CPF ou CNPJ'], ['inscricaoEstadual', 'Inscrição estadual (ou ISENTO)'],
    ['email', 'E-mail'], ['telefone', 'Telefone com DDD'], ['rua', 'Rua'], ['numero', 'Número'],
    ['complemento', 'Complemento'], ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'Estado (UF)']
];
let servicosDisponiveis = [];
function carregarRemetenteServicos(c) {
    const card = document.createElement('section'); card.className = 'card';
    const titulo = document.createElement('h2'); titulo.textContent = 'Remetente e pontos de postagem'; card.append(titulo);
    const info = document.createElement('p');
    info.textContent = 'Preencha os dados usados na etiqueta. O CEP será o de origem acima. Os documentos ficam na configuração privada da loja. Na preparação de cada envio, selecione nota fiscal ou declaração eletrônica, conforme a documentação aplicável.'; card.append(info);
    camposRemetente.forEach(([chave, label]) => {
        const l = document.createElement('label'); l.htmlFor = 'rem_' + chave; l.textContent = label;
        const input = document.createElement('input'); input.id = l.htmlFor; input.maxLength = 150;
        input.value = c.remetente?.[chave] || ({ email: 'velosoleo@live.com', cidade: 'Guaramirim', uf: 'SC', inscricaoEstadual: 'ISENTO' })[chave] || '';
        card.append(l, input);
    });
    const button = document.createElement('button'); button.type = 'button'; button.id = 'conectarEnvio';
    button.textContent = 'Conferir conexão e transportadoras'; button.onclick = consultarConexaoEnvio;
    const aviso = document.createElement('p'); aviso.id = 'conexaoEnvio'; aviso.setAttribute('role', 'status');
    aviso.textContent = 'Salve as configurações primeiro. A conexão depende da credencial protegida no servidor. Habilite apenas serviços com um ponto de postagem que você já conferiu.';
    const lista = document.createElement('div'); lista.id = 'servicosEnvio'; card.append(button, aviso, lista);
    document.getElementById('camposEntrega').insertBefore(card, document.getElementById('configuracaoPagamento'));
    renderizarServicosEnvio(c.servicosEnvio || []);
}
function lerServicosEnvio() {
    return [...document.querySelectorAll('#servicosEnvio fieldset')].filter(row => row.querySelector('input[type=checkbox]').checked).map(row => ({
        id: Number(row.dataset.id), nome: row.dataset.nome, empresaId: Number(row.dataset.empresa),
        agenciaId: Number(row.dataset.agencia) || null, ponto: row.querySelector('textarea').value.trim().slice(0, 500)
    }));
}
function renderizarServicosEnvio(salvos) {
    const lista = document.getElementById('servicosEnvio'); lista.replaceChildren();
    const mapa = new Map([...salvos, ...servicosDisponiveis].map(s => [s.id, s]));
    mapa.forEach(s => {
        const salvo = salvos.find(a => a.id === s.id);
        const row = document.createElement('fieldset'); row.style.margin = '12px 0';
        Object.assign(row.dataset, { id: s.id, nome: s.nome, empresa: s.empresaId, agencia: salvo?.agenciaId || '' });
        const legend = document.createElement('legend'); legend.textContent = s.nome;
        const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.style.width = 'auto'; checkbox.checked = !!salvo;
        label.append(checkbox, document.createTextNode(' Oferecer na loja virtual; conferi onde posso postar'));
        const text = document.createElement('textarea'); text.maxLength = 500; text.style.width = '100%'; text.rows = 3;
        text.placeholder = 'Nome e endereço do ponto de postagem confirmado para este serviço'; text.value = salvo?.ponto || '';
        text.setAttribute('aria-label', 'Ponto de postagem de ' + s.nome); text.oninput = () => { row.dataset.agencia = ''; };
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Buscar pontos próximos';
        const resultado = document.createElement('div'); resultado.setAttribute('role', 'status');
        button.onclick = async () => {
            button.disabled = true; resultado.textContent = 'Consultando pontos...';
            try {
                const { data } = await LVIntegracoes.chamar('listarPontosEnvio', { empresaId: s.empresaId, cidade: document.getElementById('rem_cidade').value.trim() });
                if (!data.pontos?.length) { resultado.textContent = 'Nenhum ponto listado. Confira no Melhor Envio um local que aceite este serviço e registre o endereço acima.'; return; }
                const select = document.createElement('select'); select.setAttribute('aria-label', 'Selecionar ponto');
                const vazio = document.createElement('option'); vazio.textContent = 'Selecione um ponto'; vazio.value = ''; select.append(vazio);
                data.pontos.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.nome + ' — ' + p.endereco; select.append(o); });
                select.onchange = () => { const p = data.pontos.find(p => String(p.id) === select.value); if (p) { text.value = p.nome + ' — ' + p.endereco; row.dataset.agencia = p.id; } };
                resultado.replaceChildren(select);
            } catch (e) { resultado.textContent = e.message || 'Não foi possível consultar.'; }
            finally { button.disabled = false; }
        };
        row.append(legend, label, text, button, resultado); lista.append(row);
    });
}
async function consultarConexaoEnvio() {
    const button = document.getElementById('conectarEnvio'); button.disabled = true;
    const aviso = document.getElementById('conexaoEnvio'); aviso.textContent = 'Conferindo conexão...';
    try {
        if (!configuracaoInicial || salvandoEntrega) throw new Error('Salve as configurações antes de conferir a conexão.');
        const salvos = lerServicosEnvio();
        const { data } = await LVIntegracoes.chamar('consultarConexaoEnvio', {});
        servicosDisponiveis = data.servicos; renderizarServicosEnvio(salvos);
        aviso.textContent = data.ambiente === 'sandbox' ? 'Conectado ao ambiente de testes. As cotações não serão usadas para vendas reais.' : 'Conectado à conta de produção. Confira os pontos e salve os serviços que deseja oferecer.';
    } catch (e) { aviso.textContent = e.message || 'Não foi possível conectar.'; }
    finally { button.disabled = false; }
}
function dadosRemetenteServicos(ativo, cep) {
    const remetente = Object.fromEntries(camposRemetente.map(([key]) => [key, document.getElementById('rem_' + key).value.trim()]));
    remetente.cep = cep; remetente.documento = remetente.documento.replace(/[.\s\/-]/g, '').toUpperCase();
    remetente.telefone = remetente.telefone.replace(/\D/g, ''); remetente.uf = remetente.uf.toUpperCase();
    const servicosEnvio = lerServicosEnvio();
    if (ativo && (!servicosEnvio.length || servicosEnvio.some(s => !s.ponto))) throw new Error('Selecione as transportadoras e confirme o ponto de postagem de cada serviço.');
    if (ativo && ['nome', 'documento', 'email', 'telefone', 'rua', 'numero', 'bairro', 'cidade', 'uf'].some(key => !remetente[key])) throw new Error('Complete os dados do remetente antes de ativar as transportadoras.');
    return { remetente, servicosEnvio };
}
