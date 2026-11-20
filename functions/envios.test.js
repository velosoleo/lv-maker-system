'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const {Timestamp}=require('firebase-admin/firestore');
function contexto(status='preparado') {
    const registros=new Map(Object.entries({
        'admins/a':{},'configuracoes/checkout':{usuario:'a'},'pedidos/ip_c_0':{usuario:'a',status:'Pronto'},
        'checkouts/c':{usuario:'a',status:'pago',entrega:{tipo:'transportadora'}},
        'envios/c':{usuario:'a',checkoutId:'c',status,ambiente:'sandbox',revisao:'r',custoCentavos:1000,ponto:'Agência',expiraEm:Timestamp.fromMillis(Date.now()+600000),payload:{service:1,to:{postal_code:'89270000'}}}
    }));
    const doc=path=>({path,get:async()=>({exists:registros.has(path),data:()=>registros.get(path)}),update:async d=>registros.set(path,{...registros.get(path),...d})});
    let fila=Promise.resolve();
    const db={doc,runTransaction:fn=>{const p=fila.then(()=>fn({get:r=>r.get(),set:(r,d)=>registros.set(r.path,d),update:(r,d)=>{registros.set(r.path,{...registros.get(r.path),...d});}}));fila=p.catch(()=>{});return p;}};
    const f=require('./envios')(db,{token:{value:()=> 'test'},sandbox:{value:()=>true},contato:{value:()=> 'teste@example.com'}});
    return {registros,f,request:{auth:{uid:'a'},data:{checkoutId:'c',revisao:'r',limiteCentavos:1000,confirmarCompra:true}}};
}
test('consulta de pontos distingue acesso recusado e resposta inválida sem comprar etiqueta', async () => {
    const { f, request } = contexto(); const antigo = global.fetch;
    const consulta = { ...request, data: { empresaId: 2, cidade: 'Guaramirim' } };
    try {
        global.fetch = async (_url, opcoes) => { assert.equal(opcoes.method, 'GET'); return { ok: false, status: 403 }; };
        await assert.rejects(f.listarPontosEnvio.run(consulta), erro => erro.code === 'unavailable' && erro.details.httpStatus === 403 && /permissões/.test(erro.message));
        global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('resposta HTML'); } });
        await assert.rejects(f.listarPontosEnvio.run(consulta), erro => erro.details.httpStatus === 200 && /formato inesperado/.test(erro.message));
    } finally { global.fetch = antigo; }
});

test('pedido conjunto aguarda todos os itens prontos antes de cotar etiqueta', async () => {
    const {f,registros,request}=contexto(); const antigo=global.fetch;
    registros.set('checkouts/c',{...registros.get('checkouts/c'),itens:[{},{}]});
    registros.set('pedidos/ip_c_1',{usuario:'a',status:'Aguardando'});
    global.fetch=async()=>{assert.fail('Não deve consultar transportadora com produção pendente');};
    try { await assert.rejects(f.prepararEnvio.run(request),e=>e.code==='failed-precondition'&&/todos os itens/.test(e.message)); }
    finally {global.fetch=antigo;}
});
test('tentativas concorrentes contratam um único envio; impressão é privada',async()=>{
    const {f,registros,request}=contexto(); const antigo=global.fetch; let carts=0,checkouts=0,generates=0,paid=false,generated=false;
    global.fetch=async(url,opts)=>{
        let data;
        if(url.endsWith('/cart')) {carts++; data={id:'etiqueta1'};}
        else if(url.endsWith('/orders/etiqueta1')) data={id:'etiqueta1',reminder:'LV Maker c',service_id:1,to:{postal_code:'89270000'},price:'10.00',status:'released',paid_at:paid?'data':null,generated_at:generated?'data':null};
        else if(url.endsWith('/shipment/checkout')) {checkouts++;paid=true;data={};}
        else if(url.endsWith('/shipment/generate')) {generates++;generated=true;data={etiqueta1:{status:true}};}
        else if(url.endsWith('/shipment/print')) {assert.equal(JSON.parse(opts.body).mode,'private');data={url:'https://sandbox.melhorenvio.com.br/imprimir/teste'};}
        else throw new Error('unexpected');
        return {ok:true,json:async()=>data};
    };
    try {
        const results=await Promise.allSettled([f.contratarEnvio.run(request),f.contratarEnvio.run(request)]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        await f.contratarEnvio.run(request);
        assert.equal(carts,1);assert.equal(checkouts,1);assert.equal(generates,1);
        assert.equal(registros.get('envios/c').status,'gerado');
        assert.match((await f.imprimirEnvio.run(request)).url,/imprimir/);
    } finally {global.fetch=antigo;}
});
test('resposta incerta de criação bloqueia outro carrinho e permite vincular somente o pedido correspondente',async()=>{
    const {f,registros,request}=contexto(); const antigo=global.fetch;let carts=0;
    global.fetch=async url=>{if(url.endsWith('/cart')){carts++;throw Error('timeout');}return {ok:true,json:async()=>({id:'existente',reminder:'LV Maker outro',service_id:1,to:{postal_code:'89270000'},price:'10'})};};
    try {
        await assert.rejects(f.contratarEnvio.run(request));
        assert.equal(registros.get('envios/c').status,'incerto');
        await assert.rejects(f.contratarEnvio.run(request));assert.equal(carts,1);
        await assert.rejects(f.vincularEnvio.run({...request,data:{checkoutId:'c',orderId:'existente'}}),{code:'failed-precondition'});
        global.fetch=async()=>({ok:true,json:async()=>({id:'existente',reminder:'LV Maker c',service_id:1,to:{postal_code:'89270000'},price:'10',paid_at:'data',generated_at:'data'})});
        await f.vincularEnvio.run({...request,data:{checkoutId:'c',orderId:'existente'}});
        assert.equal(registros.get('envios/c').orderId,'existente');assert.equal(registros.get('envios/c').status,'gerado');
    } finally {global.fetch=antigo;}
});

test('recusa de dados guarda diagnóstico seguro e não repete a criação', async () => {
    const { f, registros, request } = contexto(); const antigo = global.fetch; let chamadas = 0;
    global.fetch = async url => {
        chamadas++; assert.ok(url.endsWith('/cart'));
        return { ok: false, status: 422, json: async () => ({ errors: { 'to.document': ['Documento pessoal secreto'] } }) };
    };
    try {
        await assert.rejects(f.contratarEnvio.run(request), erro => erro.details.httpStatus === 422 && /destinatário/.test(erro.message));
        const envio = registros.get('envios/c');
        assert.equal(envio.status, 'recusado');
        assert.equal(envio.diagnostico.etapa, 'criar envio');
        assert.match((await f.consultarEnvio.run(request)).diagnostico, /destinatário/);
        await assert.rejects(f.contratarEnvio.run(request));
        assert.equal(chamadas, 1);
    } finally { global.fetch = antigo; }
});

test('pagamento externo continua geração sem cobrar novamente e aguarda confirmação para imprimir', async () => {
    const { f, registros, request } = contexto('conferir'); const antigo = global.fetch;
    registros.set('envios/c', { ...registros.get('envios/c'), orderId: 'etiqueta1', diagnostico: { etapa: 'pagar etiqueta', mensagem: 'Saldo antigo insuficiente' } });
    let gerado = false, geracoes = 0;
    global.fetch = async (url, opcoes) => {
        if (url.endsWith('/shipment/generate')) {
            geracoes++; return { ok: true, json: async () => ({ etiqueta1: { status: true } }) };
        }
        assert.equal(opcoes.method, 'GET'); assert.ok(url.endsWith('/orders/etiqueta1'));
        return { ok: true, json: async () => ({ id: 'etiqueta1', reminder: 'LV Maker c', service_id: 1, to: { postal_code: '89270000' }, price: '10', status: 'released', paid_at: 'data', generated_at: gerado ? 'data' : null }) };
    };
    try {
        const inicio = await f.contratarEnvio.run(request);
        assert.equal(inicio.gerado, false);
        const pendente = await f.consultarEnvio.run(request);
        assert.equal(pendente.status, 'gerando'); assert.equal(pendente.pago, true);
        assert.equal(pendente.diagnostico, ''); assert.equal(pendente.geracaoSolicitada, true);
        await assert.rejects(f.imprimirEnvio.run(request), { code: 'failed-precondition' });
        await f.contratarEnvio.run(request);
        assert.equal(geracoes, 1);
        registros.set('envios/c', { ...registros.get('envios/c'), geracaoSolicitadaEm: Timestamp.fromMillis(Date.now() - 61000) });
        await f.contratarEnvio.run({ ...request, data: { ...request.data, somenteGerar: true } });
        assert.equal(geracoes, 2);
        gerado = true;
        assert.equal((await f.consultarEnvio.run(request)).gerado, true);
        await f.contratarEnvio.run({ ...request, data: { ...request.data, somenteGerar: true } });
        assert.equal(geracoes, 2);
    } finally { global.fetch = antigo; }
});

test('continuar somente geração não cobra se pagamento deixar de ser confirmado', async () => {
    const { f, registros, request } = contexto('conferir'); const antigo = global.fetch;
    registros.set('envios/c', { ...registros.get('envios/c'), orderId: 'etiqueta1', pagoNoMelhorEnvio: true });
    global.fetch = async (url, opcoes) => {
        assert.equal(opcoes.method, 'GET'); assert.ok(url.endsWith('/orders/etiqueta1'));
        return { ok: true, json: async () => ({ id: 'etiqueta1', reminder: 'LV Maker c', service_id: 1, to: { postal_code: '89270000' }, price: '10', status: 'pending', paid_at: null, generated_at: null }) };
    };
    try {
        await assert.rejects(f.contratarEnvio.run({ ...request, data: { ...request.data, somenteGerar: true } }), erro => /nenhuma nova cobrança/.test(erro.message));
    } finally { global.fetch = antigo; }
});
test('preparação confere destino e preço personalizado sem criar etiqueta ou debitar saldo',async()=>{
    const {f,registros,request}=contexto();const antigo=global.fetch;
    const remetente={nome:'Loja teste',documento:'52998224725',cep:'89270000',telefone:'47999999999',email:'teste@example.com',rua:'Rua teste',numero:'10',bairro:'Centro',cidade:'Guaramirim',uf:'SC'};
    registros.set('configuracoes/checkout',{usuario:'a',cepOrigem:'89270000',remetente,servicosEnvio:[{id:1,ponto:'Agência conferida'}]});
    registros.set('checkouts/c',{usuario:'a',status:'pago',cliente:{nome:'Cliente',telefone:'47999999999',documento:'52998224725',endereco:{cep:'89270000',rua:'Rua teste',numero:'1',bairro:'Centro'}},entrega:{tipo:'transportadora',servicoId:1,precoCentavos:1000},itens:[{nome:'Produto',precoCentavos:500,qtd:2}]});
    global.fetch=async(url,opts)=>{
        if(url.includes('viacep'))return {ok:true,json:async()=>({cep:'89270-000',localidade:'Guaramirim',uf:'SC'})};
        if(url.endsWith('/shipment/services'))return {ok:true,json:async()=>[{id:1,name:'PAC',company:{id:1,name:'Correios'}}]};
        assert.equal(url.endsWith('/shipment/calculate'),true);
        const payload=JSON.parse(opts.body);assert.equal(payload.volumes.length,1);assert.equal(payload.volumes[0].insurance,10);
        return {ok:true,json:async()=>[{id:1,price:'15',custom_price:'12'}]};
    };
    try {
        const resultado=await f.prepararEnvio.run({...request,data:{checkoutId:'c',chaveNota:'1'.repeat(43)+'2',volume:{width:20,height:10,length:20,weight:1}}});
        assert.equal(resultado.custoCentavos,1200);assert.equal(registros.get('envios/c').status,'preparado');assert.equal(registros.get('envios/c').orderId,undefined);
    }finally{global.fetch=antigo;}
});
test('aumento de preço no carrinho interrompe antes de debitar a carteira',async()=>{
    const {f,registros,request}=contexto();const antigo=global.fetch;
    global.fetch=async url=>{
        if(url.endsWith('/cart'))return {ok:true,json:async()=>({id:'etiqueta1'})};
        assert.equal(url.endsWith('/orders/etiqueta1'),true);
        return {ok:true,json:async()=>({id:'etiqueta1',reminder:'LV Maker c',service_id:1,to:{postal_code:'89270000'},price:'11',paid_at:null})};
    };
    try{await assert.rejects(f.contratarEnvio.run(request),{code:'failed-precondition'});assert.equal(registros.get('envios/c').orderId,'etiqueta1');assert.equal(registros.get('envios/c').status,'conferir');}
    finally{global.fetch=antigo;}
});
test('impressão da DC-e exige envio liberado com declaração e retorna somente PDF verificado',async()=>{
    const {f,registros,request}=contexto('gerado');const antigo=global.fetch;
    registros.set('envios/c',{...registros.get('envios/c'),orderId:'etiqueta1',documentoFiscal:'declaracao'});
    global.fetch=async url=>({ok:true,json:async()=>url.endsWith('/orders/etiqueta1')?{id:'etiqueta1',reminder:'LV Maker c',service_id:1,to:{postal_code:'89270000'},price:'10',generated_at:'data'}:{pdf:'https://me-0047-prod.s3.amazonaws.com/pdf/teste.pdf'}});
    try{
        assert.match((await f.imprimirDeclaracao.run(request)).url,/teste.pdf/);
        registros.set('envios/c',{...registros.get('envios/c'),documentoFiscal:'nota'});
        await assert.rejects(f.imprimirDeclaracao.run(request),{code:'failed-precondition'});
    }finally{global.fetch=antigo;}
});
test('acesso de outro usuário e limite insuficiente impedem compra; trava vencida exige conferência',async()=>{
    const {f,registros,request}=contexto();
    await assert.rejects(f.contratarEnvio.run({...request,auth:{uid:'outro'}}),{code:'permission-denied'});
    await assert.rejects(f.contratarEnvio.run({...request,data:{...request.data,limiteCentavos:999}}),{code:'failed-precondition'});
    registros.set('envios/c',{...registros.get('envios/c'),status:'iniciando',operacao:'travada',operacaoEm:Timestamp.fromMillis(Date.now()-200000)});
    assert.equal((await f.consultarEnvio.run(request)).status,'incerto');
    await assert.rejects(f.contratarEnvio.run(request),{code:'failed-precondition'});
});

test('preparo aceita cotação única ou lista, confere seguro e não compra etiqueta', async () => {
    const pessoa={nome:'Cliente teste',documento:'52998224725',cep:'89274052',telefone:'47999999999',email:'teste@example.com',rua:'Rua teste',numero:'10',bairro:'Centro',cidade:'Guaramirim',uf:'SC'};
    for (const unica of [true,false]) {
        const {registros,f,request}=contexto();
        registros.delete('envios/c');
        registros.set('configuracoes/checkout',{usuario:'a',remetente:pessoa,cepOrigem:pessoa.cep,servicosEnvio:[{id:2,ponto:'Agência confirmada'}]});
        registros.set('checkouts/c',{usuario:'a',status:'pago',cliente:{...pessoa,endereco:pessoa},entrega:{tipo:'transportadora',servicoId:2,precoCentavos:2000},itens:[{nome:'Peça',qtd:1,precoCentavos:100}]});
        const antigo=global.fetch; const chamadas=[];
        global.fetch=async(url,opts={})=>{
            chamadas.push(url);
            let data;
            if(url.includes('viacep.com.br')) data={cep:'89274-052',localidade:'Guaramirim',uf:'SC'};
            else if(url.endsWith('/shipment/services')) data=[{id:2,company:{id:1,name:'Correios'}}];
            else if(url.endsWith('/shipment/calculate')) {
                const payload=JSON.parse(opts.body);
                assert.equal(payload.services,'2'); assert.equal(payload.volumes[0].insurance,1);
                const cotacao={id:2,custom_price:'20.00'}; data=unica?cotacao:[cotacao];
            } else throw Error('Operação inesperada: '+url);
            return {ok:true,json:async()=>data};
        };
        try {
            const r=await f.prepararEnvio.run({...request,data:{checkoutId:'c',documentoFiscal:'declaracao',dispensaNotaConfirmada:true,volume:{weight:.1,width:15,height:15,length:15}}});
            assert.equal(r.custoCentavos,2000);
            assert.equal(registros.get('envios/c').status,'preparado');
            assert.equal(chamadas.some(u=>/cart|checkout|generate/.test(u)),false);
        } finally {global.fetch=antigo;}
    }
});
