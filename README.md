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

Coloque o arquivo `public/logo.png` para o documento de orcamento mostrar a logo
no cabecalho e no rodape (veja `public/README.md`). Enquanto o arquivo nao existir,
o documento usa o monograma de texto e a impressao continua normal.

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
`src/landing.css`. Para o CTA dos planos Pro/Premium abrir conversa no
WhatsApp, preencha a constante `WHATSAPP` no topo de `src/landing.js`
(formato `55DDDNUMBER`). Enquanto vazio, os botoes levam para o app.

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

Para o build do GitHub Pages incluir a nuvem, adicione os repositorios secrets
`SUPABASE_URL` e `SUPABASE_ANON_KEY` (Settings -> Secrets and variables) — sem
eles o Pages roda apenas no modo local.
