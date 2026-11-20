/* Instalação e atualização compartilhadas. Dados de negócio continuam no Firebase. */
(() => {
    const publico = location.pathname.endsWith('/catalogo.html');
    const barra = document.createElement('div');
    barra.className = 'app-ferramentas';
    barra.setAttribute('aria-label', 'Aplicativo e conexão');
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const instalar = document.createElement('button');
    instalar.textContent = 'Instalar aplicativo';
    instalar.hidden = true;
    const atualizar = document.createElement('button');
    atualizar.textContent = 'Atualização disponível';
    atualizar.hidden = true;
    barra.append(status, instalar, atualizar);
    document.body.prepend(barra);
    const style = document.createElement('style');
    style.textContent = `.app-ferramentas{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;padding:8px 12px;font:13px Arial,sans-serif;color:#0f243e;background:#edf3fa;box-sizing:border-box}.app-ferramentas button{width:auto;margin:0;padding:10px 12px;min-height:44px;border:0;border-radius:8px;background:#0f243e;color:white;cursor:pointer}.app-ferramentas [hidden],.app-ferramentas[hidden]{display:none}.app-ferramentas.offline{background:#fff3cd;color:#664d03}`;
    document.head.appendChild(style);
    const conexao = () => {
        status.textContent = navigator.onLine ? '' : 'Sem conexão. Conecte-se para carregar e salvar dados.';
        barra.classList.toggle('offline', !navigator.onLine);
        barra.hidden = navigator.onLine && instalar.hidden && atualizar.hidden;
    };
    window.addEventListener('online', conexao);
    window.addEventListener('offline', conexao);
    conexao();
    let convite = null;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (!publico && !standalone) {
        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            convite = event;
            instalar.hidden = false;
            conexao();
        });
        if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) {
            instalar.hidden = false;
            instalar.textContent = 'Adicionar à Tela de Início';
            conexao();
        }
    }
    instalar.addEventListener('click', async () => {
        if (!convite) {
            alert('No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Abra pelo novo ícone para usar como aplicativo.');
            return;
        }
        instalar.disabled = true;
        try {
            await convite.prompt();
            await convite.userChoice;
            convite = null;
            instalar.hidden = true;
            conexao();
        } catch (erro) {
            console.warn('Não foi possível instalar:', erro);
            alert('Não foi possível instalar agora. Tente a opção Instalar aplicativo no menu do navegador.');
        } finally { instalar.disabled = false; }
    });
    window.addEventListener('appinstalled', () => {
        convite = null;
        instalar.hidden = true;
        conexao();
    });
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js').then(registro => {
        const mostrarAtualizacao = () => {
            if (registro.waiting && navigator.serviceWorker.controller) {
                atualizar.hidden = false;
                conexao();
            }
        };
        mostrarAtualizacao();
        registro.addEventListener('updatefound', () => {
            registro.installing?.addEventListener('statechange', mostrarAtualizacao);
        });
        atualizar.addEventListener('click', () => {
            if (!registro.waiting) return;
            if (!confirm('A página será recarregada. Salve os formulários antes de atualizar. Continuar?')) return;
            atualizar.disabled = true;
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
            registro.waiting.postMessage({ type: 'ATIVAR_ATUALIZACAO' });
        });
    }).catch(erro => console.warn('Não foi possível preparar o aplicativo:', erro));
})();
