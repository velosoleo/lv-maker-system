'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const e = require('./etiqueta');
test('documentos rejeitam dígitos inválidos e sequências repetidas', () => {
    assert.equal(e.documentoValido('529.982.247-25'),true);
    assert.equal(e.documentoValido('11.222.333/0001-81'),true);
    for(const value of ['11111111111','52998224724','11222333000180','abc','']) assert.equal(e.documentoValido(value),false);
});
test('preço, embalagem e link de impressão rejeitam entradas inseguras', () => {
    assert.equal(e.centavos('12.34'),1234);
    for(const value of [null,'',-1,'abc']) assert.throws(()=>e.centavos(value));
    assert.throws(()=>e.volume({width:2,height:3,length:4,weight:'1'}));
    assert.equal(e.imprimirURL('https://melhorenvio.com.br/imprimir/123'),true);
    for(const value of ['javascript:alert(1)','https://melhorenvio.com.br.evil.com','https://user:pass@melhorenvio.com.br']) assert.equal(e.imprimirURL(value),false);
});
test('etiqueta comercial usa nota, documento, valores do pedido e uma embalagem', () => {
    const pessoa={nome:'Cliente teste',documento:'52998224725',cep:'89270000',telefone:'47999999999',email:'teste@example.com',rua:'Rua teste',numero:'10',bairro:'Centro',cidade:'Guaramirim',uf:'SC'};
    const c={status:'pago',cliente:{...pessoa,endereco:pessoa},entrega:{tipo:'transportadora',servicoId:1},itens:[{nome:'Peça',qtd:2,precoCentavos:500}]};
    const cfg={remetente:pessoa,cepOrigem:'89270000',servicosEnvio:[{id:1,ponto:'Agência confirmada'}]};
    const dados={checkoutId:'teste',chaveNota:'1'.repeat(43)+'2',cidadeDestino:'Guaramirim',ufDestino:'SC',volume:{width:20,height:10,length:20,weight:1}};
    const p=e.payload(c,cfg,dados); assert.equal(p.options.insurance_value,10); assert.equal(p.volumes.length,1); assert.equal(p.to.document,pessoa.documento);
    assert.throws(()=>e.payload(c,cfg,{...dados,chaveNota:''}));
    assert.throws(()=>e.payload({...c,status:'pendente'},cfg,dados));
    assert.throws(()=>e.payload(c,{...cfg,servicosEnvio:[]},dados));
    const declaracao = {...dados,documentoFiscal:'declaracao',dispensaNotaConfirmada:true,chaveNota:''};
    const d=e.payload(c,cfg,declaracao);
    assert.equal(Object.hasOwn(d.options,'invoice'),false);
    assert.equal(d.products[0].unitary_value*d.products[0].quantity,d.options.insurance_value);
    assert.throws(()=>e.payload(c,cfg,{...declaracao,dispensaNotaConfirmada:false}));
    assert.throws(()=>e.payload(c,cfg,{...declaracao,chaveNota:dados.chaveNota}));
    assert.throws(()=>e.payload(c,{...cfg,remetente:{...pessoa,inscricaoEstadual:'123456789'}},declaracao));
});
test('PDF da declaração aceita apenas domínio do provedor ou armazenamento oficial documentado',()=>{
    assert.equal(e.declaracaoURL('https://me-0047-prod.s3.amazonaws.com/pdf/teste.pdf'),true);
    for(const url of ['https://evil.s3.amazonaws.com/arquivo','http://me-0047-prod.s3.amazonaws.com/arquivo','https://me-0047-prod.s3.amazonaws.com.evil.com/arquivo']) assert.equal(e.declaracaoURL(url),false);
});
