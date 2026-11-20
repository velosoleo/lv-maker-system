# LV Maker PRO

Sistema web para controle de pedidos de impressão 3D.

## Funcionalidades

- Cadastro de pedidos
- Controle de status
- Controle de pagamento
- Filtro mensal de vendas
- Geração de recibos
- Envio direto para WhatsApp
- Dados salvos na nuvem com Firebase

## Tecnologias utilizadas

- HTML
- CSS
- JavaScript
- Firebase

## Objetivo

O sistema foi criado para melhorar a organização dos pedidos e da produção no dia a dia da LV Maker.

## Status do projeto

Em desenvolvimento 🚀

## Uso no celular

O sistema pode ser instalado como aplicativo web (PWA), mantendo as mesmas páginas,
conta e dados usados no computador. No Android, use o botão **Instalar aplicativo**
quando o navegador o disponibilizar. No iPhone, abra no Safari e use
**Compartilhar → Adicionar à Tela de Início**. Abra pelo ícone criado.

As telas possuem controles para toque e navegação horizontal fixa no celular.
É necessário estar conectado para autenticar, consultar dados atualizados e salvar
pedidos, pagamentos e estoque. O cache guarda as telas, não garante operação
financeira offline. Quando surgir **Atualização disponível**, salve seus formulários
antes de atualizar. A atualização não recarrega automaticamente a página em uso.

## Desempenho do catálogo

- Produtos são consultados em lotes de 12, com botão para carregar mais.
- Categorias são consultadas separadamente; filtros buscam produtos da categoria
  no servidor e preservam a paginação.
- Fotos fora da primeira parte da tela usam carregamento sob demanda.
- `catalogo-imagens.js` associa URLs públicas atuais a versões comprimidas em
  `assets/catalogo/`. A associação usa a URL original exata: uma foto alterada no
  cadastro não recebe uma miniatura antiga. A galeria usa as fotos originais.
- Novos produtos podem receber uma URL HTTPS de miniatura otimizada no cadastro.
  Prefira cerca de 480 pixels de largura em WebP ou JPEG comprimido.
- Falhas de leitura mostram uma mensagem e permitem tentar novamente.

## Preparação de entregas e InfinitePay

A página `entregas.html` permite ao administrador preparar o CEP de origem
89270-000, prazo de produção, entrega própria em Guaramirim, bairros atendidos,
retirada e identificação pública InfiniteTag. A entrega própria começa desativada
e não recebe uma taxa inventada. As configurações são privadas em
`configuracoes/checkout`, protegidas pelo requisito de administrador já existente.
As alterações usam transação com detecção de edição concorrente.

No cadastro de produtos, informe peso em kg e dimensões em cm do produto embalado.
Os campos são opcionais para os registros antigos, mas todos são obrigatórios para
cotar o envio pela transportadora. Esses campos não alteram o estoque nem o preço.

O servidor de cotação está em `functions/`, separado do site estático e excluído
do Firebase Hosting. Ele confere preço e estoque no Firestore, verifica o CEP no
ViaCEP e consulta o Melhor Envio. Não aceita preço de frete enviado pelo navegador.
As cotações são privadas, válidas por 15 minutos e não criam cobranças ou etiquetas.
O teste administrativo está na página Entregas. O servidor exige App Check válido.
O ambiente inicial do Melhor Envio é sandbox: não use seus valores em vendas reais.

Para preparar o servidor (sem publicar automaticamente):

1. Instale as dependências com `npm --prefix functions ci` e rode
   `npm --prefix functions test` usando Node.js 22.
2. Configure `MELHOR_ENVIO_TOKEN` no Secret Manager do Firebase, por exemplo com
   `firebase functions:secrets:set MELHOR_ENVIO_TOKEN`. O token deve ser da conta e
   ambiente escolhidos; nunca o coloque nos arquivos HTML, na configuração do
   Firestore ou em mensagens do chat.
3. Defina `MELHOR_ENVIO_CONTATO` com seu email de suporte e mantenha
   `MELHOR_ENVIO_SANDBOX=true` durante os testes. Configure parâmetros pelas
   ferramentas oficiais do Firebase. Arquivos `.env` não devem entrar no Git.
4. Salve as configurações pela conta administradora e cadastre as embalagens dos
   produtos. A habilitação de transportadoras exige uma conta Melhor Envio conectada.
5. Apenas com autorização de publicação, publique a função `cotarFrete`, as regras
   e as páginas. A execução de Functions exige um projeto habilitado para esse
   serviço e a configuração de faturamento correspondente.

O fluxo de pagamento está implementado em `functions/checkout.js`,
`checkout-publico.js` e `pagamento.html`. As telas foram publicadas; as funções
ainda não foram publicadas nem ativadas (veja o registro de deploy abaixo).
A InfiniteTag atual é `lvmaker3d`. O usuário confirmou parcelamento de até 12x,
com juros pagos pelo cliente. Configurar o repasse na conta InfinitePay antes de ativar a cobrança.
A preferência salva não configura o provedor; o Link de Pagamento disponibiliza
até 12x e não permite restringir a quantidade de parcelas.

O catálogo só mostra o pagamento se a função `opcoesCheckout` confirmar a ativação.
O WhatsApp continua disponível. A cobrança aceita apenas IDs e quantidades do
carrinho: os preços são lidos no servidor. O frete usa a cotação privada, válida e
compatível com o carrinho; frete sandbox não pode gerar uma compra real. Retirada
somente aparece quando habilitada pelo administrador.

O webhook em `/api/infinitepay` usa um token individual por compra e confirma a
venda em `payment_check`, conferindo o valor em centavos, forma e parcelas. O retorno
do navegador também consulta o servidor; parâmetros da URL nunca comprovam pagamento.
Uma transação grava produção em `Aguardando`, recebimentos, cliente e baixa de
estoque. IDs determinísticos e uma associação única da transação evitam duplicação
quando webhook e retorno chegam juntos. O frete é distribuído entre os itens em
centavos e incluído nos recebimentos; juros do cliente não são receita da loja.
As taxas descontadas do vendedor ainda precisam ser conciliadas no financeiro.

O estoque é conferido antes de gerar a cobrança e baixado após a confirmação.
Ainda não há reserva de estoque enquanto um link está aberto: se acabar durante
o pagamento, a venda paga é registrada e sinalizada para atendimento, sem estoque
negativo. Evite divulgar pagamento de pronta entrega com estoque disputado antes
de validar esta operação. Não existe cancelamento ou reembolso automático.

O aviso de nova venda aparece com o painel aberto; não é uma notificação push com
o aplicativo fechado. Endereço, opção de entrega e alertas de estoque aparecem
na lista de pedidos. O botão “Preparar envio / imprimir etiqueta” abre `envio.html`
para pedidos pagos com transportadora. A etiqueta é contratada após a produção,
com conferência da embalagem, documentos e confirmação explícita do custo.
Os testes locais cobrem confirmação de valor, token inválido, repetição concorrente,
baixa de estoque, preservação de cliente legado, cobrança de frete e cotação expirada
ou desatualizada. O carrinho foi conferido em tela de 375 px com dados simulados,
incluindo o total com frete, a rolagem e a invalidação quando o CEP muda. As regras
novas foram revisadas; falta validá-las no Emulator ou em um projeto de teste.

Revisão local de 05/10/2026: 16 testes passaram, sem vulnerabilidades reportadas
nas dependências de produção. A gravação do link agora preserva um pagamento já
confirmado, mesmo se o webhook chegar antes de a geração do link terminar.
Sintaxe, referências de arquivos e cache v25 foram conferidos; o catálogo carregou
12 itens e mais 12 na paginação, com filtro de categoria e redirecionamento para
login nas configurações. O teste no endereço local apresentou erro reCAPTCHA do
App Check; falta conferir a proteção no domínio publicado, as regras no Emulator
ou projeto de teste, uma compra real controlada e a instalação em celular real.

Para publicar pagamentos sem a conta Melhor Envio, publique apenas
`opcoesCheckout`, `criarPagamento`, `consultarPagamento`, `webhookInfinitepay` e
`cotarEntregaLocal`, além das regras e do Hosting. A função `cotarEntregaLocal`
consulta retirada e entrega própria sem segredo Melhor Envio; `cotarFrete` fica
para a conexão das transportadoras. O parâmetro `CHECKOUT_SITE_URL` deve ser a origem HTTPS do site
publicado (padrão `https://lv-maker.web.app`), nunca um endereço de localhost.
Mantenha o pagamento desativado em Entregas até publicar as funções, conferir
App Check, confirmar repasse e habilitar ao menos retirada ou entrega válida.
Teste uma compra controlada e o recebimento automático no projeto publicado;
não houve cobrança real nos testes locais. Um erro ao criar o link pode ser
ambíguo: a tentativa fica para conferência administrativa e não gera outra cobrança.
Referências oficiais: [InfinitePay Checkout](https://www.infinitepay.io/checkout-documentacao),
[repasse de taxas](https://ajuda.infinitepay.io/pt-BR/articles/11731276-como-configurar-o-repasse-de-taxas-no-link-de-pagamento),
[Melhor Envio](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos).

## Publicação e verificações pendentes

Adaptação Cloudflare preparada em 07/10/2026, para manter Firebase Spark.
Veja [conexão Cloudflare](functions/cloudflare/CONECTAR.md). O serviço reaproveita
as regras de negócio de `functions/`, com adaptador REST transacional e validação
criptográfica de Firebase Auth e App Check. O cliente usa `integracoes.js`, cujo
endereço permanece vazio até conectar a conta e validar o serviço. O cache local
passou para v26; o site publicado na etapa anterior ainda está em v25. Passaram
31 testes locais e a preparação do pacote Wrangler. O servidor local respondeu
health/preflight e rejeitou ausência de App Check e origem não autorizada.
Faltam autorização Cloudflare, credenciais protegidas, validação na conta real e
medição dos limites de CPU do Workers Free antes de disponibilizar compras.
Nenhum segredo foi colocado no Git ou em JavaScript do navegador; nenhum plano
pago foi contratado. O caminho Firebase Functions anterior continua disponível,
mas não é necessário ativar Blaze para testar a alternativa Cloudflare.

Deploy autorizado em 05/10/2026: Hosting, regras e índices publicados no projeto
`lv-maker`. O Firebase compilou as regras com sucesso. Conferidos os arquivos
publicados de Entregas, Envio, catálogo e cache v25, além do redirecionamento de
Entregas para login sem autenticação. Os índices podem levar tempo para construir.
O plano gratuito bloqueou o Secret Manager e a publicação das Functions; falta
habilitar Blaze pelo titular da conta, cadastrar a credencial Melhor Envio,
publicar as funções e validar uma operação controlada. Nenhum plano pago foi
contratado, pagamento realizado ou etiqueta real gerada pelo agente.
Este deploy das telas usou uma configuração temporária sem o rewrite do webhook
para uma função ainda ausente. `firebase.json` mantém o rewrite definitivo para
a publicação completa com Functions após a configuração. A configuração
temporária foi removida.

### Melhor Envio: configuração e etiquetas

O contato da integração é `velosoleo@live.com`. O backend `functions/envios.js`
consulta serviços e pontos, prepara uma cotação da embalagem pronta, insere o
envio no carrinho, compra com saldo da carteira, gera e abre a impressão privada.
O saldo da carteira Melhor Envio deve ser abastecido pelo lojista; ele não recebe
automaticamente o valor pago pelo cliente na InfinitePay.

1. Na conta Melhor Envio, abra **Integrações → Permissões de Acesso** e gere um
   token para LV Maker. Conceda os acessos necessários a consulta de serviços,
   agências, frete e pedidos, inserção no carrinho, compra, geração e impressão.
   Não envie o token por chat e não coloque em HTML, Firestore ou Git.
2. No terminal local, dentro deste projeto, use
   `firebase functions:secrets:set MELHOR_ENVIO_TOKEN --project lv-maker` e informe
   o token apenas no campo protegido do comando. Use credenciais do ambiente
   escolhido: a conta sandbox é separada da conta de produção.
   O atalho local `functions/configurar-melhor-envio.ps1` executa esse mesmo
   cadastro com entrada protegida, via stdin, e `--non-interactive` para impedir
   republicação automática. Ele requer PowerShell 7 e não grava o token em arquivo.
   No comando interativo direto, se o Firebase oferecer republicar funções antigas,
   responda não até que a publicação seja autorizada.
3. O padrão `MELHOR_ENVIO_SANDBOX=true` mantém testes isolados. Antes de oferecer
   frete real, defina `MELHOR_ENVIO_SANDBOX=false` nos parâmetros do deploy
   (ou em `functions/.env.lv-maker`, ignorado pelo Git). Mantenha o contato correto.
   Uma alteração de segredo ou parâmetro precisa de nova publicação das funções.
4. Em **Entregas**, salve o remetente completo e consulte a conexão. Selecione
   somente serviços cujo ponto de postagem foi confirmado. A busca usa a cidade
   do remetente em SC; quando a API não listar um ponto, confirme no Melhor Envio
   antes de cadastrar seu endereço manualmente. Salve as opções e confira um CEP
   de teste. Serviços sem ponto cadastrado não aparecem no catálogo.
5. Para cada venda, termine a produção, abra **Preparar envio**, confira documento
   do destinatário, nota fiscal ou dispensa aplicável para DC-e e peso/medidas reais de uma
   única embalagem. A integração não emite nota fiscal. Consulte o custo, marque
   a confirmação e compre a etiqueta. A medida final pode alterar o frete; a tela
   permite comparar o custo com o frete recebido antes de gastar o saldo.
6. Abra a etiqueta com login Melhor Envio no navegador, imprima, fixe na embalagem
   e leve ao ponto cadastrado que aceita o serviço escolhido. Consulte a situação
   e o código de rastreio nessa mesma tela.

Esta primeira versão trabalha com Correios, Jadlog, Loggi e J&T quando disponíveis
na conta e com um pacote por pedido. Outros serviços que exigem dados específicos,
coleta agendada e múltiplas etiquetas ficam fora deste fluxo. As cotações do
catálogo usam as embalagens dos produtos; confira cadastros e a diferença de preço
na embalagem consolidada. A entrega própria permanece desativada até definir taxa,
prazo e bairros.

Os dados de etiqueta são privados em `envios/{checkoutId}`; só o administrador
proprietário lê e somente as funções escrevem. A compra requer Auth + App Check,
pagamento confirmado, proprietário correto, revisão da cotação e limite de custo.
Uma trava transacional impede compras concorrentes. Uma resposta incerta na
criação bloqueia nova etiqueta: consulte o carrinho e vincule o identificador
encontrado. O servidor confere pedido, serviço e CEP antes de vincular. Uma operação
interrompida por mais de três minutos libera a consulta para conferência, mantendo
a proteção contra nova criação. Cancelamento e reembolso não são automáticos.

Validação local adicional: testes simulados de contratação concorrente, recuperação,
limite, autorização e impressão privada, além de CPF/CNPJ, documentos e embalagem.
Os 27 testes passaram. A tela de envio foi conferida em 375 px, com contratação e
link de impressão simulados e sem rolagem horizontal. O acesso sem login foi
redirecionado para a página de autenticação.
Nenhuma etiqueta real ou débito da carteira foi feito. Ainda é necessário publicar,
conectar a conta e testar o fluxo com uma venda controlada. As regras precisam de
validação no Emulator/projeto de teste; Java não está instalado neste ambiente.

Após autorização de publicação, o deploy completo inclui `functions`,
`firestore:rules`, `firestore:indexes` e `hosting`; publicar apenas Hosting não
disponibiliza os endpoints de frete e etiquetas. Mantenha o pagamento desativado
até concluir a configuração e os testes no domínio publicado.

Referências: [token no painel](https://centraldeajuda.melhorenvio.com.br/hc/pt-br/articles/31220726011284-O-que-%C3%A9-um-token-e-para-o-que-ele-%C3%A9-usado-nas-integra%C3%A7%C3%B5es-do-Melhor-Envio),
[API Melhor Envio](https://docs.melhorenvio.com.br/).

As alterações locais só chegam ao site e ao aplicativo depois de publicadas.
Publique os índices de `firestore.indexes.json` antes de publicar as páginas, usando
`firebase deploy --only firestore:indexes` e aguardando sua construção. Depois,
o comando de publicação do sistema é `firebase deploy --only hosting,firestore:rules`.
Esses comandos devem ser executados apenas quando a publicação for autorizada.
Sem o índice de categoria, o catálogo mantém o filtro e a paginação, usando a ordem
por ID em vez da ordem dos produtos mais recentes.

O App Check continua habilitado. Verifique no console Firebase/Google Cloud os
domínios da chave reCAPTCHA Enterprise, métricas e erros de token. Testes em
localhost precisam do procedimento oficial de debug; não habilite esse modo em
produção. Não substitua nem desative a proteção para contornar falhas de conexão.

Antes da publicação, confirme os fluxos autenticados de pagamentos, estoque,
aprovação e ficha do cliente numa conta ou projeto de teste, além da instalação
em Android/iPhone reais. O financeiro preserva a consulta do histórico completo
para manter filtros anuais, saldos e registros antigos corretos; suas consultas
independentes agora rodam em paralelo e os pagamentos são agrupados por pedido.

### Declaração de conteúdo eletrônica

A preparação permite selecionar nota fiscal ou DC-e por envio. A declaração
exige confirmação explícita de que o envio está dispensado de nota e remetente
com inscrição estadual ausente/ISENTO. O sistema não determina enquadramento
fiscal por CPF, valor faturado, Shopee, WhatsApp ou venda pelo catálogo.
Os itens, quantidades, valores e seguro vêm do pedido confirmado; a declaração
omite `options.invoice`. Para transportadoras privadas, aplica limite conservador
de R$ 1.000 (Jadlog R$ 1.500); demais restrições são verificadas pelo provedor.
Após liberar a etiqueta, “Abrir declaração eletrônica” solicita o PDF da DACE
no endpoint oficial e verifica o domínio do link. Imprima e afixe o documento
junto da etiqueta. Falha de emissão não autoriza despachar sem documentação.
No sandbox, a documentação informa impressão de DACE disponível apenas na Jadlog.
A integração real e o formato do retorno ainda precisam ser conferidos na conta
conectada; não houve emissão fiscal real ou deploy. A seleção padrão continua
nota fiscal e pedidos antigos preservam o documento com que foram preparados.

Referências: [documentos na API](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho),
[impressão de DACE](https://docs.melhorenvio.com.br/reference/impressao-dace).

### Publicação Cloudflare — 08/10/2026

A revisão v27 adiciona a opção de salvar os dados sem ativar pagamento e
transportadoras. Ela resolve a configuração inicial: guardar o remetente,
conferir a conexão e só então selecionar serviços e pontos para ativar.
A validação da ativação continua exigindo serviços e pontos confirmados.
Validação local: rascunho grava com pagamento/frete desativados e preserva
o dono; tentativa de ativação sem serviços continua recusada.

A revisão v28 compara configurações sem depender da ordem dos campos e lê
o estado inicial diretamente do servidor. Evita conflitos falsos por ordenação,
mas continua recusando sobrescrever mudanças reais feitas desde a abertura da
página. Testes locais confirmaram igualdade de mapas reordenados e divergência
de valores, ordem de listas e criação concorrente.

Em 08/10/2026, uma consulta administrativa real confirmou Auth, App Check,
acesso ao Firestore e conexão Melhor Envio em produção. Corrigida a chamada
ao fetch nativo do Worker sem receptor Database, que causava TypeError.
32 testes locais passaram, incluindo regressão dessa chamada. Removido o
diagnóstico temporário de execução; mensagens de configuração conhecidas
continuam sem expor credenciais. Cotação, pagamento e etiqueta reais ainda
dependem de serviços/pontos e embalagens configurados e validação controlada.

Hosting, regras e índices foram publicados com sucesso. As telas v26 usam
`https://lv-maker-integracoes.lv-maker-system.workers.dev`; o webhook de pagamento
vai diretamente ao Worker, sem rewrite para Cloud Functions no Hosting.
As duas credenciais estão cadastradas como segredos e o ambiente Melhor Envio
está em produção. O health responde, os arquivos publicados foram conferidos
e chamadas sem App Check são recusadas. Nenhuma etiqueta ou pagamento foi comprado
nessa verificação. A presença das credenciais não comprova a validade delas:
consulta autenticada, cotação real e venda controlada ainda precisam ser validadas
com uma sessão administrativa. Dados completos do remetente, embalagem e pontos
de postagem devem ser definidos antes de ativar a transportadora e o pagamento.

Para esta configuração, publique o backend com Wrangler e o site com
`firebase deploy --only hosting,firestore:rules,firestore:indexes`.
Os comandos de Cloud Functions acima descrevem a alternativa Firebase com Blaze,
que não foi usada nesta publicação.

Validação adicional de frete: Jogo de Equilibrio tem embalagem cadastrada
(0,1 kg; 15 × 15 × 15 cm), mas a cotação de produção recebeu rejeição de dados
do Melhor Envio. Mensagens agora distinguem dados do remetente, embalagem,
autorização, formato de resposta e campos recusados, sem divulgar os valores
de documentos, endereços ou credenciais. PAC/SEDEX estão selecionados e a
cotação habilitada; pagamento permanece desativado até a validação real.

Consulta de CEP no backend usa ViaCEP e, em falha de rede ou formato, a
BrasilAPI v2. Não aceita CEP confirmado como inexistente nem resposta com CEP
diferente do solicitado. O mesmo helper confirma destino na cotação e na
preparação da etiqueta. São 36 testes locais passando, incluindo essas falhas.
Fonte: [BrasilAPI CEP v2](https://brasilapi.com.br/docs#tag/CEP-V2).

Após atualizar o CEP e reativar transportadoras (o salvamento de rascunho
as havia desativado), a cotação real de 1 Jogo de Equilibrio para 01001-000
retornou PAC R$ 22,17/8 dias e SEDEX R$ 34,71/4 dias após produção.
Valores são apenas evidência do teste, sujeitos à validade da cotação.
O pagamento permanece desativado; falta confirmação da regra de juros na
InfinitePay e teste controlado do pagamento/confirmacão/etiqueta.

### Promoção automática configurável

Na área Produtos, a seção Promoção automática da loja permite ativar/desativar
um desconto fixo por compra, definir o mínimo e escolher todos os produtos ou
até 100 produtos participantes. O subtotal dos participantes deve ser
estritamente maior que o mínimo; frete não integra o mínimo nem recebe desconto.
A imagem do banner é configurada separadamente e deve anunciar a mesma regra.
A promoção vale para pagamento online; o pedido combinado pelo WhatsApp mantém
seu fluxo próprio. A loja mostra o desconto no carrinho e na finalização.
O servidor recalcula a promoção com preços cadastrados, confere a expectativa
do cliente e registra o recebimento líquido, sem confiar em valores do navegador.
Configuração privada: configuracoes/checkout.promocao, com acesso administrativo
pelas regras existentes; a consulta pública retorna apenas a regra da promoção.
Validação local: 56 testes de integração e regras de negócio, mais 6 testes de
proteção de áreas e módulos; prévia administrativa móvel com salvamento simulado.

### Imagens da loja — otimização do banner

O banner promocional cadastrado em 12/10/2026 passou de 2.019.658 bytes (PNG)
para 172.148 bytes (WebP, 1600 pixels de largura), mantendo a mesma arte.
O mapa catalogo-imagens.js associa a URL original à cópia local com nome
baseado no conteúdo. A página antecipa o download dessa cópia, mas só mostra
o banner após confirmar sua configuração no Firestore. Ao substituir a arte,
atualizar também essa associação e o preload; o preload sozinho não publica
nem ativa uma promoção. As imagens em assets/catalogo usam nomes imutáveis:
ao mudar uma imagem, gerar um novo nome para preservar o cache de um ano.
Verificação: scripts e páginas sem erros de sintaxe; banner local carregado
em viewport de 390 pixels sem rolagem horizontal. Não mede ganho de tempo
em conexão móvel real; a redução comprovada é do tamanho do arquivo.

### Entrega própria e frete grátis local

Em Entregas, a entrega própria permite selecionar Guaramirim e/ou Jaraguá do Sul
(SC), configurar a taxa normal e um valor opcional para gratuidade. Deixar o
mínimo vazio desativa a gratuidade. O subtotal dos produtos após a promoção
precisa ser estritamente maior que esse mínimo; frete não entra na comparação.
A gratuidade vale somente para a opção de entrega própria, nunca para Correios
ou outras transportadoras. A restrição opcional de bairros é independente por cidade
(bairrosPorCidade); registros antigos usam bairros como alternativa. Configurações antigas sem cidades continuam cobrindo
apenas Guaramirim. Configuração nova em entregaLocal: cidades (lista permitida)
e gratisAcimaCentavos (centavos ou null). Cotação e criação do pagamento conferem
os produtos, a promoção e a regra local no servidor. Cotações com preço antigo
ou gratuidade indevida são recusadas antes de criar a cobrança.
Validação local: 66 testes passando, incluindo limite de R$ 100 após descontos,
ambas as cidades, destinos fora da região e cobrança com cotação desatualizada;
prévia móvel da configuração sem rolagem horizontal. Regra solicitada: R$ 15
até R$ 100 líquidos; entrega própria grátis acima disso, nas duas cidades.

Ativação confirmada em 12/10/2026: Guaramirim atende todos os bairros; Jaraguá
do Sul atende Ilha da Figueira, Centenário e Vieira. Taxa R$ 15 e gratuidade
acima de R$ 100 líquidos. Verificação real sem cobrança: taxa R$ 15 na Ilha da
Figueira para carrinho de R$ 35; frete grátis para carrinho líquido de R$ 170
na Ilha da Figueira e no Centro de Guaramirim; Centro de Jaraguá sem entrega
própria. O CEP geral antigo 89270-000 não foi confirmado pelo serviço; utilizar
o CEP específico da rua. Backend e Hosting publicados; configurações restantes
preservadas ao atualizar somente os campos da entrega local.
