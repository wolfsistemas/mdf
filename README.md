# MDF Atelier

App local para marcenaria: orcamentos por cliente, catalogo de moveis parametricos, nesting (plano de corte), veio, fita de borda, custo com margem e orcamento do cliente pronto para impressao.

Roda no navegador. Os dados ficam salvos no localStorage.

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
