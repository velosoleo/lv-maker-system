/* Estado de leitura de uma rotina. Não repete gravações ou pagamentos. */
window.LVEstadoArea = {
    proteger(container) {
        let ocupada = false;
        let repetir = null;
        const estado = this.criar(container, () => executar(repetir));
        async function executar(leitura) {
            if (ocupada || typeof leitura !== 'function') return false;
            ocupada = true;
            repetir = leitura;
            estado.carregando();
            try {
                await leitura();
                estado.pronto();
                return true;
            } catch (erro) {
                console.warn('Não foi possível carregar esta área:', erro);
                estado.falhou();
                return false;
            } finally { ocupada = false; }
        }
        return { executar };
    },
    criar(container, tentarNovamente) {
        const painel = document.createElement('section');
        painel.className = 'card lv-area-estado';
        const estilo = document.createElement('style');
        estilo.textContent = '.lv-area-bloqueada > :not(.lv-area-estado):not(nav):not(h1) { display: none !important; }';
        document.head.append(estilo);
        painel.setAttribute('role', 'status');
        painel.setAttribute('aria-live', 'polite');
        painel.hidden = true;
        const mensagem = document.createElement('p');
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = 'Tentar novamente';
        botao.addEventListener('click', () => tentarNovamente());
        const navegacao = document.createElement('p');
        for (const [texto, destino] of [['Abrir pedidos', 'index.html'], ['Abrir produtos', 'produtos.html']]) {
            const link = document.createElement('a');
            link.textContent = texto;
            link.href = destino;
            navegacao.append(link, document.createTextNode('  '));
        }
        painel.append(mensagem, botao, navegacao);
        container.prepend(painel);
        let anteriores = null;
        let aviso;
        function bloquear() {
            clearTimeout(aviso);
            if (!anteriores) {
                anteriores = [...container.children].filter(el => el !== painel && el.tagName !== 'NAV' && el.tagName !== 'H1')
                    .map(el => ({ el, inert: el.inert }));
            }
            container.classList.add('lv-area-bloqueada');
            anteriores.forEach(({ el }) => { el.inert = true; });
            painel.hidden = false;
        }
        return {
            carregando() {
                bloquear();
                container.setAttribute('aria-busy', 'true');
                mensagem.textContent = 'Atualizando os dados desta área...';
                botao.hidden = true;
                aviso = setTimeout(() => {
                    mensagem.textContent = 'A conexão está demorando. Aguardando os dados; você pode acessar outra área pelos links abaixo.';
                }, 10000);
            },
            pronto() {
                clearTimeout(aviso);
                container.classList.remove('lv-area-bloqueada');
                anteriores?.forEach(({ el, inert }) => { el.inert = inert; });
                anteriores = null;
                painel.hidden = true;
                container.setAttribute('aria-busy', 'false');
            },
            falhou() {
                bloquear();
                container.setAttribute('aria-busy', 'false');
                mensagem.textContent = 'Não foi possível atualizar todos os dados desta área. Os resultados e as ações ficam indisponíveis para evitar informações incompletas. Confira sua conexão e tente novamente.';
                botao.hidden = false;
            }
        };
    }
};
