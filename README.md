# MDF Atelier

App local para marcenaria: orcamentos por cliente, catalogo de moveis parametricos, nesting (plano de corte), veio, fita de borda, custo com margem e orcamento do cliente pronto para impressao.

Roda no navegador. Os dados ficam salvos no localStorage e, opcionalmente,
podem ser sincronizados com uma conta na nuvem (Supabase) pelo botão
**Backup na nuvem** na barra lateral.

## Como usar

```bash
# Instalar dependencias
npm install

# Ambiente de desenvolvimento
npm run dev
```

Abra o endereco que o Vite mostrar (padrao `http://localhost:5173`).

## Fluxo

1. Crie um orcamento na barra lateral e informe o cliente.
2. Na aba **Orcamento** clique no botao flutuante **+ Adicionar movel**: escolha o modelo no catalogo e o app abre um modal com o desenho do movel ao lado das configuracoes (medidas, gavetas, portas, saia, cores e pecas extras).
3. No modal voce pode **Duplicar**, **Excluir** ou salvar o item. O documento fica paginado: **capa** com a logo e dados do cliente, **uma folha por movel** (foto + descricao completa + valor unitario) e **folha final** com os itens em lista, o **total** e o contato com QR do WhatsApp. Pronto para **Imprimir / PDF**.
4. Na aba **Custos** defina o custo de cada item e a **margem** (por movel ou padrao global em Config). Escolha tambem a **base de cobranca das chapas** deste orcamento (por area usada ou incluindo o custo das sobras rateado entre os itens). O valor de venda calculado alimenta o orcamento do cliente.
5. As abas **Pecas**, **Corte** e **Config** continuam com a lista de pecas, plano de corte e configuracoes de chapa/fita/empresa.

## Funcoes

- Catalogo parametrico com esquema 2D (+ perspectiva na mesa em L)
- Modal "montar movel" com preview ao lado das configuracoes e acoes editar/duplicar/excluir
- Orcamento do cliente em documento claro e paginado: capa moderna com logo, um movel por pagina e folha final com lista, total, assinaturas e QR de WhatsApp
- Tela de custos separada: custo de material por item, margem individual/padrao e lucro previsto
- Base de cobranca das chapas **por orcamento**: por area usada ou incluindo o custo das sobras (aproveitamento) rateado entre os itens; fita sempre por metro usado
- Documento do orcamento com espaco para **logo** (`public/logo.png`) e **QR code de WhatsApp** no rodape com mensagem pre-preenchida (nome do orcamento + valor total)
- Impressao / PDF do orcamento pronto para o cliente (esconde ferramentas internas)
- Altura e largura de gavetas configuraveis; gavetas no chao, coluna suspensa ou caixote suspenso sob o tampo da mesa
- Saia com altura configuravel em todas as mesas
- Identificacao por cor e codigo no plano de corte
- Sentido do veio (livre, comprimento ou largura)
- Fita de borda por lado (fitamento padrao, frente, laterais, perimetro...)
- Tamponamento de faces aparentes (laterais, topo e base; painel inteiro ou sarrafo)
- Tamponamento de tampo de mesa: reforco (dobrar/engrossar o tampo) ou borda de 30/50/100 mm, no tampo e nas laterais/pes
- Gaveteiro suspenso com fechadura configuravel
- Plano de corte 2D: serra/guilhotina ou nesting livre
- Pecas ocultas (fundos, caixotes de gaveta e tamponamento) entram como aproveitamento: podem girar e sao posicionadas por ultimo, para preencher sobras antes de abrir outra chapa (o app testa variacoes e usa a de menor numero de chapas)
- Depois do encaixe, pecas da ultima chapa sao recolocadas nas sobras das chapas anteriores, se couberem, para nao abrir chapa extra
- Numeracao e sequencia de corte por chapa (faixas) e exportacao do plano em PNG
- Kerf (perda da serra) e refilo
- Chapa padrao 2750 x 1830 mm, espessura padrao 15 mm
- Outros tamanhos de chapa (ex.: 25 mm para tamponamento, 2440 x 1220): o plano escolhe a menor chapa que couber, respeitando a espessura, e o custo soma o preco de cada chapa usada
- Custo de chapas + fita + mao de obra (percentual)
- Exportar CSV das pecas, planilha CorteCloud e PDF interno do plano + custos

## Medidas

Tudo em milimetros. Preco da chapa e da fita em reais, editavel em Config, junto com a empresa, o **WhatsApp** (usado no QR code do orcamento) e a margem padrao de venda.

## Logo do orcamento

Na aba **Conta**, no plano Pro, envie a logo da marcenaria (PNG/JPEG/WebP, ate
800 KB). Ela fica salva nas configuracoes e aparece na capa e no rodape do
orcamento. No Grátis o documento usa o monograma MDF Atelier.

Tambem e possivel deixar um `public/logo.png` de fallback (veja
`public/README.md`).

## Celular, envio e PWA

No smartphone (ate 900 px) o orcamento abre em lista: cliente, itens e total.
**Enviar PDF** usa o compartilhamento nativo (WhatsApp, e-mail) quando o
navegador permite; senao baixa o arquivo. **Imprimir** monta o documento
completo. A aba Corte mostra o resumo das chapas; o plano desenhado fica no
computador ou no PDF plano.

O app registra um service worker e um manifest (`start_url` em `/#/app`) para
abrir em tela cheia a partir da tela inicial.

## Publicar no GitHub Pages (teste)

Este repositorio fica em `https://github.com/wolfsistemas/mdf`, entao o app e
servido sob o caminho `/mdf/`. O build para Pages usa esse caminho:

```bash
npm run build:pages
```

O deploy e feito pelo workflow `.github/workflows/gh-pages.yml` (roda no push
para `main` ou manualmente na aba Actions). Primeira vez, no GitHub:

1. Repositorio -> **Settings -> Pages**: em "Build and deployment", escolha
   **Source: GitHub Actions** (o workflow cuida do resto).
2. Suba o codigo para `main` (merge do branch de trabalho via Pull Request).
3. Apos o workflow concluir, o app aparece em
   `https://wolfsistemas.github.io/mdf/`.

Importante: nesse modo os dados continuam no **localStorage** do navegador
(dados por maquina, nada vai para um servidor).

## Landing page (site de vendas)

A raiz (`/mdf/`) abre a pagina de apresentacao com recursos, planos e FAQ; o
app fica em `/mdf/#/app` (botao "Abrir o app" / "Testar gratis").

Textos, precos e planos ficam em `src/landing.js` e o visual em
`src/landing.css`. Termos em `#/termos` e privacidade em `#/privacidade`.
Suporte: `SALE.email` (padrao wolfsaasbr@gmail.com). Se preencher
`SALE.whatsapp` em `src/billing.js`, o botao de suporte abre o WhatsApp.

## Nuvem com Supabase (para vender / varios clientes)

Schema pronto em `supabase/schema.sql` (tabelas `profiles` e `projects` +
Row Level Security). Para criar no seu projeto:

1. Crie o projeto em https://supabase.com (free).
2. Abra **SQL Editor**, cole o conteudo inteiro de `supabase/schema.sql` e
   execute (e seguro rodar de novo).
3. Em **Project Settings -> API** copie a `URL` e a `anon key`.
4. Copie `.env.example` para `.env` e preencha as duas chaves
   (o `.env` nao vai para o git).

O schema cria automaticamente um perfil para cada usuario novo (login via
Supabase Auth). Cada usuario ve apenas os proprios orcamentos. `settings` da
oficina ficam no perfil; cada orcamento vira uma linha em `projects` com os
moveis em `furniture` (jsonb), espelhando o que o app hoje guarda no
localStorage.

Depois de rodar o schema, use o botao **Backup na nuvem** (barra lateral) do
app para criar a conta e sincronizar. Primeiro login com a conta vazia envia os
dados do navegador para a nuvem; nas proximas vezes a nuvem e a fonte dos dados.

### Planos (Gratis / Pro)

Contas novas entram no **Gratis**: ate 3 orcamentos ativos (vale tambem
deslogado). Pro (R$ 49/mes) e ilimitado e libera a **logo da marcenaria**
no documento. O plano efetivo vem das colunas `profiles.plan` e
`profiles.plan_expires_at` (o cliente autenticado nao consegue se promover).
O Ultra esta oculto na oferta ate ter feature propria (equipe compartilhada).

Assinatura: Mercado Pago hospedado (`preapproval_plan` + `init_point`).
O front nunca tokeniza cartao. Backend: **Supabase Edge Function**
(`supabase/functions/billing/index.ts`). O antigo `gas/billing.js` fica
apenas como referencia e nao e mais usado.

Pagamento avulso (sem recorrencia): **InfinityPay Checkout Integrado**
(`POST /links`), por PIX ou cartao a vista, em 1 mes (R$ 49) ou 3 meses
(R$ 129). O front nao guarda credencial: a funcao usa o secret
`INFINITEPAY_HANDLE` (a InfiniteTag, ex.: `maiconvss`) e devolve o link.
Cada pedido vira uma linha em `ip_orders`; o webhook da InfinityPay libera os
dias de Pro. O usuario ve so "pagamento unico" ou "assinatura mensal", sem
nome de banco.

1. Rode `supabase/billing.sql` no SQL Editor (projeto que ja tem o schema).
   Ele cria as colunas de plano, a tabela `mp_events` (dedupe do MP) e a
   tabela `ip_orders` (pedidos avulsos).
2. Configure os secrets da funcao:
   `supabase secrets set MP_ACCESS_TOKEN=APP_USR-... PRO_PRICE_CENTS=4900 ULTRA_PRICE_CENTS=8900 INFINITEPAY_HANDLE=maiconvss --project-ref <ref>`.
   Opcionais: `MP_WEBHOOK_SECRET` (valida a assinatura do webhook),
   `INFINITEPAY_API` (default `https://api.checkout.infinitepay.io`),
   `ONCE_1M_CENTS`/`ONCE_3M_CENTS` (precos do avulso),
   `RESEND_API_KEY`/`EMAIL_FROM`/`EMAIL_LOG` (aviso por e-mail) ou
   `NOTIFY_URL` (relay para um Web App do GAS).
   Para testar: `MP_ACCESS_TOKEN` de teste + duas contas de teste (vendedor
   e comprador). O app sempre abre o `init_point` (checkout de producao,
   aceita usuario de teste). Nao use sandbox: o `sandbox_init_point` do
   Checkout Pro costuma abrir pagina quebrada. `MP_USE_SANDBOX` nao existe
   mais.
3. Publique a funcao: `supabase functions deploy billing --no-verify-jwt
   --project-ref <ref>` (`--no-verify-jwt` porque os webhooks nao mandam
   JWT; as acoes de usuario sao validadas dentro da funcao pelo JWT).
4. Webhooks:
   - Mercado Pago (painel MP) na URL
     `https://<ref>.supabase.co/functions/v1/billing`: eventos de Planos e
     assinaturas + `payment`.
   - InfinityPay: na criacao do link a propria funcao manda
     `webhook_url = <funcao>?infinity=1`. Nao ha assinatura; a funcao confere
     o `order_nsu` em `ip_orders` antes de liberar.
5. A URL da funcao ja vai no app (`src/billing.js`) e no `.env.example`
   (`VITE_BILLING_URL`). So mude se o project ref mudar.
6. Pages: secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY`. `BILLING_URL` e
   opcional (ha fallback no codigo).

As acoes `subscribe`, `checkout`, `infinity_once`, `infinity_confirm`,
`cancel_subscription` e `sync_subscription` exigem o JWT do Supabase e so
mexem no proprio `user_id`; os webhooks nao usam JWT.

### Alterar o preco do plano

O valor vem do secret `PRO_PRICE_CENTS` (em centavos: `4900` = R$ 49).
Para mudar, use uma das opcoes e **redeploye a funcao** (secrets entram em
vigor no deploy):

- Painel Supabase -> Edge Functions -> Manage secrets -> editar
  `PRO_PRICE_CENTS` -> Deploy; ou
- CLI:
  `supabase secrets set PRO_PRICE_CENTS=4900 --project-ref <ref>`
  seguido de
  `supabase functions deploy billing --no-verify-jwt --project-ref <ref>`.

ATENCAO: no momento o Pro esta com **R$ 1 (`100`) apenas para teste**.
Antes de vender, volte para `PRO_PRICE_CENTS=4900`. Um plano do Mercado
Pago com preco antigo nao e reaproveitado: ao mudar o valor, a proxima
assinatura cria um plano novo automaticamente.

Precos do avulso: `ONCE_1M_CENTS` (default `4900`) e `ONCE_3M_CENTS`
(default `12900`). Mudar o valor exige redeploy da funcao. Os dias liberados
(30 e 90) ficam em `ONCE_DEFS` no codigo da funcao.

Volta do checkout: `?plano=ok#/app` chama `sync_subscription` (ate 4
tentativas). O avulso volta com `?avulso=ok` + `order_nsu`/`slug`/
`transaction_nsu` (o app chama `infinity_confirm`). O webhook do MP pode
falhar na 1a vez; o sync e a rede de seguranca. Cancelar nao corta o mes ja
pago; no avulso nao ha o que cancelar.

Para o build do GitHub Pages incluir a nuvem, adicione os repositorios secrets
`SUPABASE_URL` e `SUPABASE_ANON_KEY` (Settings -> Secrets and variables) — sem
eles o Pages roda apenas no modo local.
