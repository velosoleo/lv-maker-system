# Planejamento futuro — possível comercialização do sistema

> Documento de especulação. Não faz parte das funcionalidades autorizadas do LV Maker atual e não deve orientar alterações ou deploys sem nova solicitação explícita do proprietário.

## Situação atual

- O LV Maker continua sendo o sistema próprio da LV Maker.
- A versão publicada mencionada nesta conversa é a v69.
- Nenhuma mudança comercial, multiempresa ou de onboarding foi autorizada.
- As ideias abaixo devem permanecer separadas da manutenção normal do sistema.

## Ideia de produto futuro

Avaliar futuramente a transformação da base do LV Maker em um produto comercial, possivelmente chamado **Mix Sistema**. A experiência desejada é semelhante à instalação de um aplicativo: o comprador responde a perguntas em um assistente e, ao terminar, o sistema abre pronto para uso.

## Experiência desejada para o comprador

Assistente inicial com etapas para:

1. dados da empresa e responsável;
2. módulos desejados;
3. logotipo, cores e identidade visual;
4. pagamentos;
5. retirada, entrega local e transportadora;
6. produção e prazos;
7. primeiros produtos ou importação;
8. equipe e permissões;
9. revisão e abertura do sistema.

O comprador não deve precisar entender Firebase, Cloudflare, IAM, regras de banco ou comandos de terminal.

## Possíveis modelos comerciais

### Implantação separada por empresa

- Cada cliente teria uma instalação e infraestrutura próprias.
- O cliente seria dono das contas, dados e faturamento.
- Haveria cobrança de implantação e possível manutenção mensal.
- A participação do cliente seria limitada às autorizações, contratos e formas de pagamento que exigem consentimento pessoal.

### Plataforma por assinatura

- Uma infraestrutura administrada pelo fornecedor atenderia várias empresas.
- Cada empresa teria dados, loja, identidade, usuários e permissões isolados.
- O comprador apenas criaria a conta e concluiria o assistente inicial.
- Este é o modelo considerado mais simples para o comprador, mas exige arquitetura multiempresa e isolamento rigoroso de dados.

## Firebase e infraestrutura

- Hoje a solução combina recursos gratuitos do Firebase e Cloudflare.
- Em uma instalação com Firebase Blaze, processos protegidos poderiam ser migrados para Cloud Functions.
- No mesmo projeto Firebase, a ativação do faturamento não exige importar novamente os dados existentes.
- Em projeto novo de outro cliente, seria necessário preparar configurações, administrador, regras e dados iniciais.
- Uma futura plataforma deve prever alertas de orçamento, limites de instância, App Check, backups, logs e proteção contra abuso.

## Pagamentos

### InfinitePay

- Para a configuração básica, o comprador poderia informar a InfiniteTag depois de habilitar o Checkout Integrado na própria conta.
- Recursos avançados podem exigir uma API Key guardada somente no servidor.
- A experiência futura ideal seria uma etapa simples de conexão e verificação, sem expor segredos no navegador.
- Pagamento online deve ser opcional; pedido direto precisa continuar funcionando mesmo sem integração.

## Entregas

### Retirada e entrega local

- Configuração totalmente interna no assistente.
- Endereço de retirada, cidades, bairros, valores, gratuidade e prazos.

### Melhor Envio

- A configuração manual por token usada no projeto atual não é a experiência desejada para compradores futuros.
- Uma plataforma comercial poderia ter um aplicativo próprio no Melhor Envio e usar autorização OAuth.
- O comprador clicaria em **Conectar Melhor Envio**, entraria na conta, autorizaria e retornaria ao sistema.
- A plataforma cuidaria de tokens e renovação; o comprador preencheria remetente, ponto de postagem, serviços e embalagens.
- A integração deve ser opcional e não impedir o início do uso do sistema.

## Requisitos antes de comercializar

- separação segura entre empresas;
- gestão de usuários e permissões;
- recuperação de acesso;
- configurações e identidade por empresa;
- backup, auditoria, logs e suporte;
- política de privacidade, termos e adequação à LGPD;
- revisão das licenças e condições das integrações;
- planos, limites e cobrança;
- assistente de implantação;
- processo seguro de conexão com serviços externos.

## Regra para trabalhos futuros

Não implementar nenhuma ideia deste documento no LV Maker atual por inferência. Retomar somente quando o usuário pedir explicitamente para iniciar o projeto comercial ou revisar este planejamento.
