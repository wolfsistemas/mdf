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
- Altura e largura de gavetas configuraveis; gavetas no chao ou suspensas
- Saia com altura configuravel em todas as mesas
- Identificacao por cor e codigo no plano de corte
- Sentido do veio (livre, comprimento ou largura)
- Fita de borda por lado
- Plano de corte 2D: serra/guilhotina ou nesting livre
- Kerf (perda da serra) e refilo
- Chapa padrao 2750 x 1830 mm, espessura padrao 15 mm
- Custo de chapas + fita + mao de obra (percentual)
- Exportar CSV das pecas e PDF interno do plano + custos

## Medidas

Tudo em milimetros. Preco da chapa e da fita em reais, editavel em Config, junto com a empresa, o **WhatsApp** (usado no QR code do orcamento) e a margem padrao de venda.

## Logo do orcamento

Na aba **Config** da oficina, envie a logo da marcenaria (PNG/JPEG/WebP, ate
800 KB). Ela fica salva nas configuracoes e aparece na capa e no rodape do
orcamento. Sem logo, o documento usa o monograma de texto.

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
`src/landing.css`. O WhatsApp comercial e o link de assinatura ficam
unificados em `src/billing.js` (`SALE.whatsapp` / `SALE.url`) e valem
para a landing e para o modal de upgrade do app. Enquanto os dois
estiverem vazios, os CTAs levam para o app.

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

### Planos (Gratis / Pro / Ultra)

Contas novas entram no **Gratis**: ate 3 orcamentos ativos. Pro (R$ 49/mes)
e Ultra (R$ 89/mes) sao ilimitados. O plano efetivo vem das colunas
`profiles.plan` e `profiles.plan_expires_at` (o cliente autenticado nao
consegue se promover). Sem login (demo local) nao ha limite.

Assinatura: Mercado Pago hospedado (`preapproval_plan` + `init_point`).
O front nunca tokeniza cartao. Codigo do GAS em `gas/billing.js`.

1. Rode `supabase/billing.sql` no SQL Editor (projeto que ja tem o schema).
2. Cole `gas/billing.js` no Apps Script, publique Web app (Execute as: Me,
   Anyone) e use **Nova versao no mesmo deployment**.
3. Script Properties: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`,
   `PAYMENT_PROVIDER=mp`, `MP_ACCESS_TOKEN`, `PRO_PRICE_CENTS=4900`,
   `ULTRA_PRICE_CENTS=8900`. Em teste: `MP_USE_SANDBOX=true`.
4. Painel MP → Webhooks na URL do GAS: eventos de Planos e assinaturas +
   `payment` (modo teste e, depois, producao).
5. `.env`: `VITE_BILLING_URL` = URL `/exec` do GAS. Sem isto o app esconde
   Assinar e cai no WhatsApp (`SALE.whatsapp`) se estiver preenchido.
6. Pages: secret `BILLING_URL` alem de `SUPABASE_URL` / `SUPABASE_ANON_KEY`.

Volta do checkout: `#/app?plano=ok` chama `sync_subscription`. Cancelar
nao corta o mes ja pago.

Para o build do GitHub Pages incluir a nuvem, adicione os repositorios secrets
`SUPABASE_URL` e `SUPABASE_ANON_KEY` (Settings -> Secrets and variables) — sem
eles o Pages roda apenas no modo local.
