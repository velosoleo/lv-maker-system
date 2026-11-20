'use strict';
// O diagnóstico é privado do administrador. Remover os valores enviados antes de exibir o motivo.
function motivoSeguro(resposta, payload) {
    if (!payload || typeof payload !== 'object') return '';
    const mensagens = [];
    function coletar(v, nivel = 0) {
        if (nivel > 5 || mensagens.length >= 12) return;
        if (typeof v === 'string') mensagens.push(v.slice(0, 1000));
        else if (v && typeof v === 'object') Object.values(v).slice(0, 20).forEach(x => coletar(x, nivel + 1));
    }
    coletar(resposta?.message); coletar(resposta?.error); coletar(resposta?.errors);
    let texto = mensagens.join(' ');
    const valores = [];
    function valoresEnviados(v) {
        if (typeof v === 'string' && v.length >= 3) valores.push(v);
        else if (v && typeof v === 'object') Object.values(v).forEach(valoresEnviados);
    }
    valoresEnviados(payload);
    for (const v of valores.sort((a,b) => b.length - a.length)) texto = texto.split(v).join('[dado ocultado]');
    return texto.replace(/https?:\/\/\S+/gi, '[link ocultado]')
        .replace(/Bearer\s+\S+/gi, '[credencial ocultada]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail ocultado]')
        .replace(/\d[\d.\s/()+-]{7,}\d/g, '[número ocultado]')
        .replace(/[A-Za-z0-9_=-]{48,}(?:\.[A-Za-z0-9_=-]+)*/g, '[credencial ocultada]')
        .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 700);
}
function camposInvalidos(resposta) {
    const grupos = { from: 'dados do remetente', to: 'dados do destinatário', products: 'produtos da declaração', volumes: 'peso ou medidas da embalagem', service: 'serviço de transporte', agency: 'ponto de postagem', options: 'documentos ou opções do envio' };
    return [...new Set(Object.keys(resposta?.errors && typeof resposta.errors === 'object' ? resposta.errors : {})
        .map(k => grupos[k.split('.')[0]]).filter(Boolean))];
}
function diagnostico(status, path, resposta, payload) {
    const etapa = path === 'cart' ? 'criar envio' : path === 'shipment/checkout' ? 'pagar etiqueta' : path === 'shipment/generate' ? 'gerar etiqueta' : 'consultar serviço';
    const campos = camposInvalidos(resposta);
    const mensagem = status === 401 ? 'Melhor Envio recusou a credencial. Confira o token e o ambiente configurado.'
        : status === 403 ? 'Melhor Envio recusou o acesso. Confira as permissões do token para esta operação.'
        : status === 422 ? 'Melhor Envio recusou os dados' + (campos.length ? ': confira ' + campos.join(', ') : ' do envio') + '.'
        : status === 429 ? 'Melhor Envio limitou as consultas. Aguarde antes de tentar novamente.'
        : 'Melhor Envio não confirmou a operação. Confira a situação na sua conta antes de repetir.';
    const motivo = status === 422 ? motivoSeguro(resposta, payload) : '';
    return { httpStatus: status, etapa, mensagem: mensagem + ' Etapa: ' + etapa + ' (código ' + status + ').' + (motivo ? '\nMotivo informado: ' + motivo : '') };
}
module.exports = { diagnostico };
