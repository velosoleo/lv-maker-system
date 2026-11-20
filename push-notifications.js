/* Notificações de novos pedidos. A permissão é solicitada somente por ação do usuário. */
(() => {
    const CHAVE_ATIVA = 'lv_push_ativo';
    let messaging = null;

    const campoStatus = () => document.getElementById('statusNotificacoesPush');
    const botaoAtivar = () => document.getElementById('btnAtivarPush');
    const botaoDesativar = () => document.getElementById('btnDesativarPush');
    const definirStatus = (texto, ativo = false) => {
        if (campoStatus()) campoStatus().textContent = texto;
        if (botaoAtivar()) botaoAtivar().hidden = ativo;
        if (botaoDesativar()) botaoDesativar().hidden = !ativo;
    };

    async function suportado() {
        return 'Notification' in window && 'serviceWorker' in navigator
            && firebase.messaging && await firebase.messaging.isSupported();
    }

    async function idDoToken(token) {
        const bytes = new TextEncoder().encode(token);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    }

    async function registrarToken(mostrarErro = false) {
        const user = auth.currentUser;
        if (!user || !(await suportado())) return false;
        try {
            const registro = await navigator.serviceWorker.ready;
            messaging ||= firebase.messaging();
            const token = await messaging.getToken({ serviceWorkerRegistration: registro });
            if (!token) throw new Error('O navegador não forneceu um identificador para notificações.');
            const tokenId = await idDoToken(token);
            await db.collection('pushTokens').doc(tokenId).set({
                usuario: user.uid,
                token,
                ativo: true,
                plataforma: navigator.platform || '',
                userAgent: navigator.userAgent.slice(0, 300),
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            localStorage.setItem(CHAVE_ATIVA, 'true');
            localStorage.setItem('lv_push_token_id', tokenId);
            definirStatus('Ativadas neste aparelho. Você receberá avisos de novos pedidos.', true);
            return true;
        } catch (erro) {
            console.warn('Não foi possível registrar notificações:', erro);
            definirStatus('Não foi possível ativar neste aparelho. Confira a permissão do navegador.');
            if (mostrarErro) alert('Não foi possível ativar as notificações. Confira se elas estão permitidas nas configurações do navegador e tente novamente.');
            return false;
        }
    }

    window.ativarNotificacoesPush = async () => {
        if (!(await suportado())) {
            alert('Este navegador não oferece notificações para este aplicativo. No iPhone, instale o aplicativo pela Tela de Início e abra pelo ícone.');
            return;
        }
        if (!auth.currentUser) return;
        const botao = botaoAtivar();
        if (botao) botao.disabled = true;
        try {
            const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
            if (permissao !== 'granted') {
                definirStatus('Notificações bloqueadas. Libere a permissão nas configurações do navegador.');
                return;
            }
            await registrarToken(true);
        } finally { if (botao) botao.disabled = false; }
    };

    window.desativarNotificacoesPush = async () => {
        const user = auth.currentUser;
        const tokenId = localStorage.getItem('lv_push_token_id');
        try {
            if (user && tokenId) await db.collection('pushTokens').doc(tokenId).set({
                usuario: user.uid, ativo: false,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            messaging ||= firebase.messaging();
            await messaging.deleteToken().catch(() => false);
        } finally {
            localStorage.removeItem(CHAVE_ATIVA);
            localStorage.removeItem('lv_push_token_id');
            definirStatus('Desativadas neste aparelho. Você pode ativá-las novamente quando quiser.');
        }
    };

    auth.onAuthStateChanged(async user => {
        if (!user) return;
        if (!(await suportado())) {
            definirStatus('Notificações não disponíveis neste navegador.');
            return;
        }
        if (Notification.permission === 'denied') {
            definirStatus('Notificações bloqueadas nas configurações do navegador.');
            return;
        }
        if (Notification.permission === 'granted' && localStorage.getItem(CHAVE_ATIVA) === 'true') {
            await registrarToken();
        } else {
            definirStatus('Ative para receber novos pedidos mesmo com o aplicativo fechado.');
        }
    });

})();
