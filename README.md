# MDF Atelier

App local para marcenaria: projetos, pecas, nesting (plano de corte), veio, fita de borda, orcamento e exportacao PDF/CSV.

Roda no navegador. Os dados ficam salvos no localStorage.

## Como usar

```bash
# Instalar dependencias
npm install

# Ambiente de desenvolvimento
npm run dev
```

Abra o endereco que o Vite mostrar (padrao `http://localhost:5173`).

## Funcoes

- Projetos com lista de pecas (L x A x espessura, quantidade)
- Sentido do veio (livre, comprimento ou largura)
- Fita de borda por lado (frente, fundo, esquerda, direita)
- Plano de corte 2D: serra/guilhotina ou nesting livre
- Kerf (perda da serra) e refilo
- Chapa padrao 2750 x 1830 mm
- Custo de chapas + fita
- Exportar CSV das pecas e PDF do plano + orcamento

## Medidas

Tudo em milimetros. Preco da chapa e da fita em reais, editavel em Config.
