# Conectar LV Maker ao Cloudflare

O site, login e dados continuam no Firebase Spark. O Worker executa pagamento,
frete, confirmação e etiquetas usando as regras de negócio já existentes. Esta
adaptação não altera as permissões públicas do Firestore e não exige Blaze.

## 1. Entrar no Cloudflare

No terminal, na pasta do sistema:

```powershell
npx --yes wrangler@4.148.0 login --scopes account:read user:read workers:write workers_scripts:write
```

Entre na conta criada e revise a autorização antes de confirmar. Este comando
abre a autorização oficial e guarda a sessão local do Wrangler; não envie senha,
código OAuth ou tokens no chat. O callback volta ao computador local.

## 2. Identidade do servidor no Firebase

Use o mesmo projeto `lv-maker` no Google Cloud, sem contratar outro plano.
Em IAM e administração → Contas de serviço, crie uma conta exclusiva, por exemplo
`lv-maker-cloudflare`, e conceda apenas **Cloud Datastore User**
(`roles/datastore.user`). Gere uma chave JSON dessa conta e guarde fora da pasta
do sistema, por exemplo em Downloads. Não use credenciais de proprietário/editor
nem envie o arquivo no chat. A conta precisa ler e gravar o Firestore para
confirmar pagamentos em transações; as verificações de usuário e administrador
continuam sendo feitas pelo serviço. A criação e concessão de acesso são feitas
pelo titular do projeto. Se a organização proibir chaves, não contorne a política.

## 3. Conectar e publicar

Antes de cadastrar segredos, fixe o identificador público da conta conectada no
campo `account_id` de `wrangler.json`; isso impede seleção de outra conta durante
o cadastro protegido. O identificador pode ser conferido com `wrangler whoami`.

Após o login, publique o Worker inicial com:

```powershell
npx --yes wrangler@4.148.0 deploy --config functions/cloudflare/wrangler.json
```

Esse Worker ainda não habilita vendas sem a identidade do servidor. Execute o
script protegido `functions/cloudflare/configurar-credenciais.ps1` em PowerShell
7 para enviar o JSON ao segredo `FIREBASE_SERVICE_ACCOUNT` e o token Melhor Envio
ao segredo `MELHOR_ENVIO_TOKEN`. O script usa stdin, não grava segredos na pasta
do sistema, e pode atualizar a versão do Worker ao cadastrar os segredos.

O endereço publicado será `https://lv-maker-integracoes.<sua-conta>.workers.dev`.
Use esse endereço público em `integracoes.js` (`LVIntegracoes.url`) e no parâmetro
`CHECKOUT_WEBHOOK_BASE_URL` de `wrangler.json`. Sem esse parâmetro o Worker bloqueia
a criação de cobranças. Publique novamente o Worker e as telas após conferir.
O endereço vazio no cliente preserva a configuração Firebase antiga; não
direcione compradores para um serviço não validado.

`MELHOR_ENVIO_SANDBOX=true` mantém testes separados. Uma credencial de produção
não deve ser usada no sandbox; confirme a conta e o ambiente antes de trocar
para `false`. Configure remetente, pontos, embalagens e repasse de juros no
administrativo. Só ative pagamento depois de testar Auth, App Check, confirmação
de compra, estoque, etiquetas e declaração na conta correta.

## Custos e limites

O Worker Free tem limites de requisições e de CPU por execução. A assinatura de
tokens usa Web Crypto, e as chaves e o acesso Google são reaproveitados até a
expiração. Uma execução completa ainda precisa de medição no ambiente publicado,
inclusive partidas a frio. Se ultrapassar limites, não habilite vendas sem
resolver o problema. Taxas de pagamento, transporte e quotas do Firebase
continuam independentes. Não foi contratado um plano pago.

## Validação

31 testes locais passaram, incluindo serialização REST, transação com conflito,
commit de resposta incerta, assinatura JWT, projeto, validade e aplicação.
Wrangler empacotou o Worker sem SDK administrativo pesado (aproximadamente 80 KiB).
Servidor local: health, preflight, bloqueio sem App Check e origem não autorizada.
Cloudflare autorizado e Worker inicial publicado em 07/10/2026 em
`https://lv-maker-integracoes.lv-maker-system.workers.dev`.
As duas credenciais privadas foram cadastradas como segredos no Cloudflare.
O health confirmou a presença delas; isso não confirma a validade no provedor.
O token foi criado no painel de produção, então `MELHOR_ENVIO_SANDBOX=false`.
As telas v26 foram conectadas e publicadas em 08/10/2026. Ainda falta validar
Auth, App Check, acesso ao Firestore e consultas de frete reais com uma sessão
administrativa antes de ativar o pagamento e liberar o fluxo completo.

Fontes oficiais:
[Workers](https://developers.cloudflare.com/workers/),
[Firestore REST](https://firebase.google.com/docs/firestore/use-rest-api),
[App Check em serviço próprio](https://firebase.google.com/docs/app-check/custom-resource-backend),
[papéis Firestore](https://cloud.google.com/firestore/native/docs/security/iam).
