'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { Database, Timestamp, encode, decode, fields } = require('./firestore.cjs');
const { verifyJWT } = require('./auth.cjs');
const { enviarFCM } = require('./push.cjs');
const env = { FIREBASE_PROJECT_ID: 'lv-maker', testAccessToken: 'test-only' };
test('push usa FCM HTTP v1 e identifica aparelho inválido', async () => {
    let requisicao;
    const ok = await enviarFCM(env, 'token-valido', { title: 'Novo pedido' }, async (url, options) => {
        requisicao = { url, options };
        return Response.json({ name: 'projects/lv-maker/messages/1' });
    });
    assert.equal(ok.ok, true);
    assert.match(requisicao.url, /fcm\.googleapis\.com\/v1\/projects\/lv-maker\/messages:send$/);
    assert.equal(requisicao.options.headers.Authorization, 'Bearer test-only');
    assert.equal(JSON.parse(requisicao.options.body).message.token, 'token-valido');
    const invalido = await enviarFCM(env, 'token-antigo', {}, async () => Response.json({ error: { details: [
        { '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }
    ] } }, { status: 404 }));
    assert.equal(invalido.invalido, true);
});
test('REST chama fetch sem associar o receptor Database', async () => {
    let chamadas = 0;
    const db = new Database(env, async function () {
        assert.equal(this, undefined);
        chamadas++;
        return Response.json({ fields: fields({ usuario: 'admin' }) });
    });
    assert.equal((await db.doc('admins/admin').get()).data().usuario, 'admin');
    assert.equal(chamadas, 1);
});
test('REST preserva centavos, timestamps, objetos e documentos inexistentes', async () => {
    const value = { inteiro: 1234, decimal: 1.25, vazio: null, ativo: false, lista: ['a', 2], criado: Timestamp.fromMillis(1700000000123) };
    const decoded = decode(encode(value)); assert.equal(decoded.inteiro,1234);assert.equal(decoded.criado.toMillis(),1700000000123);assert.deepEqual(decoded.lista,['a',2]);
    const db = new Database(env,async()=>new Response('{}',{status:404}));assert.equal((await db.doc('checkouts/a').get()).exists,false);
    assert.throws(()=>db.doc('checkouts/../../a'));
});
test('REST lê batch fora de ordem e preserva atualização parcial e criação exclusiva na transação',async()=>{
    const calls=[];
    const db=new Database(env,async(url,options)=>{
        const body=options.body?JSON.parse(options.body):null;calls.push({url,body});
        if(url.endsWith(':beginTransaction'))return Response.json({transaction:'t1'});
        if(url.endsWith(':batchGet'))return Response.json([{missing:db.base+'/produtos/b'},{found:{name:db.base+'/produtos/a',fields:fields({estoquePronto:3})}}]);
        return Response.json({});
    });
    await db.runTransaction(async tx=>{
        const docs=await tx.getAll(db.doc('produtos/a'),db.doc('produtos/b'));
        assert.equal(docs[0].data().estoquePronto,3);assert.equal(docs[1].exists,false);
        tx.update(docs[0].ref,{estoquePronto:2});tx.create(db.doc('pedidos/p'),{total:10});
        await assert.rejects(tx.get(db.doc('produtos/a')));
    });
    const commit=calls.find(c=>c.url.endsWith(':commit')).body;
    assert.equal(commit.transaction,'t1');assert.deepEqual(commit.writes[0].updateMask,{fieldPaths:['estoquePronto']});assert.deepEqual(commit.writes[1].currentDocument,{exists:false});
    assert.equal(calls.find(c=>c.url.endsWith(':batchGet')).body.transaction,'t1');
});
test('REST repete somente conflito confirmado, não repete commit com resposta perdida',async()=>{
    let begin=0,commit=0;
    const db=new Database(env,async(url)=>{
        if(url.endsWith(':beginTransaction'))return Response.json({transaction:'t'+(++begin)});
        if(url.endsWith(':commit')&&++commit===1)return Response.json({error:{}},{status:409});
        return Response.json({});
    });
    await db.runTransaction(async tx=>tx.create(db.doc('pedidos/p'),{total:1}));assert.equal(begin,2);assert.equal(commit,2);
    let attempts=0;
    const lost=new Database(env,async url=>{if(url.endsWith(':beginTransaction')){attempts++;return Response.json({transaction:'t'});}if(url.endsWith(':commit'))throw Error('timeout');return Response.json({});});
    await assert.rejects(lost.runTransaction(tx=>tx.create(lost.doc('pedidos/p'),{total:1})));assert.equal(attempts,1);
});
test('JWT verifica assinatura, projeto, aplicativo, validade e algoritmo',async()=>{
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
    const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='teste';
    const config={issuer:'https://firebaseappcheck.googleapis.com/216355482221',audience:'projects/216355482221',subject:'app',jwksURL:'https://example.test/jwks'};
    const claims={iss:config.issuer,aud:[config.audience],sub:'app',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600};
    const signer=async(changes={},head={})=>{const body=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'teste',...head})).toString('base64url')+'.'+Buffer.from(JSON.stringify({...claims,...changes})).toString('base64url');return body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body))).toString('base64url');};
    const request=async()=>Response.json({keys:[jwk]},{headers:{'cache-control':'max-age=3600'}});
    assert.equal((await verifyJWT(await signer(),config,request)).sub,'app');
    for(const change of [{aud:['projects/outro']},{iss:'falso'},{sub:'outro'},{exp:1}])await assert.rejects(verifyJWT(await signer(change),config,request));
    await assert.rejects(verifyJWT(await signer({}, {alg:'HS256'}),config,request));
    const fake=(await signer()).split('.');fake[2]=Buffer.from('falsa').toString('base64url');await assert.rejects(verifyJWT(fake.join('.'),config,request));
});
