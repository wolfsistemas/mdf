import './landing.css'
import { PLANS, ONCE_PLANS, freeProjectLimit } from './billing.js'

function priceParts(label) {
  const raw = String(label || '').trim()
  const i = raw.indexOf('/')
  if (i === -1) return { main: raw, suffix: '' }
  return { main: raw.slice(0, i).trim(), suffix: raw.slice(i + 1).trim() }
}

const CABINET_SVG = `
<svg viewBox="0 0 220 260" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="6" width="208" height="248" rx="10" fill="#f3ece3" stroke="#e4dccd" stroke-width="2"/>
  <rect x="18" y="18" width="184" height="26" rx="4" fill="#b0803e"/>
  <rect x="18" y="60" width="184" height="120" fill="#cfc2aa"/>
  <line x1="110" y1="60" x2="110" y2="180" stroke="#fbf8f2" stroke-width="4"/>
  <rect x="30" y="78" width="64" height="84" rx="5" fill="#e8c39a" stroke="#241d15" stroke-width="3"/>
  <rect x="126" y="78" width="64" height="84" rx="5" fill="#e8c39a" stroke="#241d15" stroke-width="3"/>
  <circle cx="76" cy="120" r="4" fill="#241d15"/>
  <circle cx="144" cy="120" r="4" fill="#241d15"/>
  <rect x="18" y="196" width="184" height="44" rx="4" fill="#e4dccd"/>
  <line x1="18" y1="196" x2="18" y2="240" stroke="#b0803e" stroke-width="3"/>
</svg>`

/* ---------------------------------------------------------------------
   Mock das telas do app (tema escuro), usados no "carrossel" do hero
   e nas seções de detalhe. Nao sao telas reais: sao desenhos em HTML/CSS
   que mostram os pontos fortes do sistema.
   --------------------------------------------------------------------- */

const APP_NAV = [
  ['orc', 'Orçamento'],
  ['pecas', 'Peças'],
  ['corte', 'Corte'],
  ['custos', 'Custos'],
  ['config', 'Config'],
  ['conta', 'Conta']
]

function mkSide(active) {
  const links = APP_NAV.map(
    ([key, label]) => `<span class="${active === key ? 'on' : ''}">${label}</span>`
  ).join('')
  return `<aside class="mk-side"><div class="mk-brand"><span>MDF</span> ATELIER</div><nav class="mk-nav">${links}</nav></aside>`
}

function bodyCatalog() {
  return `
  <div class="mk-top">
    <div class="mk-title"><b>A-01</b> Armário escritório</div>
    <div class="mk-actions"><span>Duplicar</span><span>Excluir</span><span class="solid">Salvar</span></div>
  </div>
  <div class="mk-split">
    <div class="mk-preview">${CABINET_SVG}</div>
    <div class="mk-fields">
      <div class="mk-field"><label>Largura</label><b>1200 mm</b></div>
      <div class="mk-field"><label>Altura</label><b>1800 mm</b></div>
      <div class="mk-field"><label>Prof.</label><b>500 mm</b></div>
      <div class="mk-field"><label>Portas</label><b>3</b></div>
      <div class="mk-field"><label>Gavetas</label><b>0</b></div>
      <div class="mk-field"><label>Saia</label><b>0 mm</b></div>
      <div class="mk-chips"><span>MDF 15 mm</span><span>Fita PVC 22 mm</span><span>Veio: comprimento</span><span>Tamponamento</span></div>
    </div>
  </div>`
}

function cutBoardHTML() {
  return `
  <div class="mk-cut">
    <div class="mk-board">
      <div class="mk-strip" style="flex:600">
        <div class="mk-pc a" style="flex:1800">LAT 600×1800</div>
        <div class="mk-free" style="flex:30"></div>
      </div>
      <div class="mk-strip" style="flex:600">
        <div class="mk-pc a" style="flex:1800">LAT 600×1800</div>
        <div class="mk-free" style="flex:30"></div>
      </div>
      <div class="mk-strip" style="flex:1550">
        <div class="mk-pc b" style="flex:500">TAMPO 1500×500</div>
        <div class="mk-pc b" style="flex:500">BASE 1500×500</div>
        <div class="mk-pc b" style="flex:500">PRAT 1500×500</div>
        <div class="mk-hid" style="flex:300">FUNDO 1500×300</div>
        <div class="mk-free" style="flex:30"></div>
      </div>
    </div>
    <div class="mk-stats">
      <div><b>3</b><span>chapas</span></div>
      <div><b>87%</b><span>aproveitado</span></div>
      <div><b>42</b><span>peças</span></div>
    </div>
  </div>`
}

function bodyCut() {
  return `
  <div class="mk-top">
    <div class="mk-title">Plano de corte <b>· Chapa 1/3</b></div>
    <div class="mk-modes"><span>Serra</span><span class="on">BBW</span><span>MAC</span><span>Livre</span><span>Manual</span></div>
  </div>
  ${cutBoardHTML()}
  <div class="mk-seq"><span>1 · LAT ×2</span><span>2 · TAMPO</span><span>3 · BASE</span><span>4 · PRAT ×3</span><span>5 · FUNDO</span></div>`
}

function bodyManual() {
  return `
  <div class="mk-top">
    <div class="mk-title">Modo manual <b>· Chapa 1</b></div>
    <div class="mk-actions"><span>Desfazer</span><span>Limpar ajustes</span><span class="solid">Encaixar no canto</span></div>
  </div>
  <div class="mk-cut">
    <div class="mk-board manual">
      <div class="mk-strip" style="flex:600">
        <div class="mk-pc a" style="flex:1800">LAT 600×1800</div>
        <div class="mk-free" style="flex:30"></div>
      </div>
      <div class="mk-strip" style="flex:2150">
        <div class="mk-pc sel" style="flex:500">TAMPO 1500×500</div>
        <div class="mk-pc b" style="flex:500">BASE 1500×500</div>
        <div class="mk-hid" style="flex:300">FUNDO 1500×300</div>
        <div class="mk-free" style="flex:530">SOBRA 1550×530</div>
      </div>
      <div class="mk-ghost" style="left:26%;top:7%;width:70%;height:26%">TAMPO ↻</div>
    </div>
    <div class="mk-stats">
      <div><b>↻</b><span>girar</span></div>
      <div><b>||</b><span>alinhar</span></div>
      <div><b>=</b><span>distribuir</span></div>
    </div>
  </div>
  <div class="mk-tools"><span>↻ Girar</span><span>Alinhar</span><span>Distribuir</span><span>Mover p/ chapa 2</span><span>Desfazer</span></div>`
}

function bodyBudget() {
  return `
  <div class="mk-paper">
    <div class="lpage flat">
      <div class="lpage-top">
        <span class="lp-brand">SUA MARCENARIA</span>
        <span class="lp-no">ORÇAMENTO Nº 2026-0042</span>
      </div>
      <div class="lpage-body">
        <div class="lp-item">
          <span class="lp-swatch" style="background:#e8c39a"></span>
          <div class="lp-item-info">
            <strong>[A-01] Armário escritório</strong>
            <span>3 portas · 1200×1800×500 · MDF 15 mm · fita PVC 22 mm</span>
          </div>
          <div class="lp-price"><span>Valor unitário</span><strong>R$ 2.340,00</strong></div>
        </div>
        <div class="lp-visual-row">
          <div class="lp-svg">${CABINET_SVG}</div>
          <div class="lp-chips"><span>18 peça(s)</span><span>3,240 m² de chapa</span><span>11,42 m de fita</span></div>
        </div>
      </div>
      <div class="lp-qr">
        <span class="lp-qr-box"></span>
        <div><strong>Fale com a gente</strong><small>Escaneie para abrir o WhatsApp com nome e valor do orçamento.</small></div>
      </div>
    </div>
  </div>`
}

function bodyCosts() {
  return `
  <div class="mk-top">
    <div class="mk-title">Custos e margem</div>
    <div class="mk-modes"><span class="on">Área usada</span><span>Rateio das sobras</span></div>
  </div>
  <table class="mk-table">
    <thead><tr><th>Item</th><th>Custo</th><th>Margem</th><th>Venda</th></tr></thead>
    <tbody>
      <tr><td>[A-01] Armário</td><td>1.315,20</td><td>78%</td><td class="pos">2.340,00</td></tr>
      <tr><td>[A-02] Mesa em L</td><td>680,00</td><td>60%</td><td class="pos">1.088,00</td></tr>
      <tr><td>[A-03] Gaveteiro</td><td>412,00</td><td>55%</td><td class="pos">638,60</td></tr>
    </tbody>
  </table>
  <div class="mk-totals">
    <div><b>R$ 2.407,20</b><span>custo</span></div>
    <div><b class="pos">R$ 1.659,40</b><span>lucro previsto</span></div>
    <div><b>R$ 4.066,60</b><span>total</span></div>
  </div>`
}

const SHOTS = [
  {
    cap: ['Catálogo paramétrico', '52 móveis prontos: ajuste medidas, portas, gavetas e saia vendo o esquema 2D.'],
    active: 'orc',
    body: bodyCatalog
  },
  {
    cap: ['Plano de corte em 5 modos', 'BBW mantém as faixas da serra e ainda testa ordens e geometrias para gastar menos chapa.'],
    active: 'corte',
    body: bodyCut
  },
  {
    cap: ['Ajuste manual do plano', 'Arraste, gire e leve peças para outra chapa. Gruda no kerf e mostra a maior sobra contínua.'],
    active: 'corte',
    body: bodyManual
  },
  {
    cap: ['Orçamento do cliente', 'Capa com a sua logo, uma folha por móvel, lista final, total e QR do WhatsApp.'],
    active: 'orc',
    body: bodyBudget
  },
  {
    cap: ['Custo real e margem', 'Chapa, fita, ferragens e mão de obra. Por área usada ou sobras rateadas, com lucro por item.'],
    active: 'custos',
    body: bodyCosts
  }
]

function windowBar() {
  return `<div class="lshot-bar"><i></i><i></i><i></i><em>wolfsaas.com.br/mdf/#/app</em></div>`
}

function shotsHTML() {
  const slides = SHOTS.map(
    (s, i) => `
    <article class="lshot${i === 0 ? ' is-on' : ''}" data-shot="${i}">
      <div class="mk">${mkSide(s.active)}<div class="mk-main">${s.body()}</div></div>
      <div class="lshot-cap"><strong>${s.cap[0]}</strong><span>${s.cap[1]}</span></div>
    </article>`
  ).join('')
  const dots = SHOTS.map(
    (s, i) => `<button class="lshot-dot${i === 0 ? ' is-on' : ''}" data-go="${i}" aria-label="${s.cap[0]}"></button>`
  ).join('')
  return `
  <div class="lshots" data-shots>
    <div class="lshot-frame">
      ${windowBar()}
      <div class="lshot-stage">${slides}</div>
    </div>
    <button class="lshot-arrow prev" data-prev aria-label="Tela anterior">‹</button>
    <button class="lshot-arrow next" data-next aria-label="Próxima tela">›</button>
    <div class="lshot-dots">${dots}</div>
  </div>`
}

function soloShot(active, body) {
  return `
  <div class="lshot-frame">
    ${windowBar()}
    <div class="lshot-stage">
      <article class="lshot is-on"><div class="mk">${mkSide(active)}<div class="mk-main">${body}</div></div></article>
    </div>
  </div>`
}

const CARDS = [
  ['Catálogo paramétrico', '52 móveis em 7 categorias. Ajuste medidas, portas, gavetas, saia e cores vendo o esquema 2D ao lado.'],
  ['5 modos de corte', 'Serra/guilhotina, BBW, MAC, nesting livre e manual. Você escolhe o equilíbrio entre sequência e economia.'],
  ['Aproveitamento real', 'Fundos, caixotes e tamponamento entram como aproveitamento: giram e preenchem sobras antes de abrir chapa.'],
  ['Veio e fita por peça', 'Veio livre, no comprimento ou na largura, e fitamento por lado: frente, laterais, perímetro e mais.'],
  ['Orçamento que impressiona', 'Capa com a logo, uma folha por móvel, lista final com total, assinaturas e QR do WhatsApp.'],
  ['Custo e margem', 'Chapa, fita, ferragens e mão de obra. Base por área usada ou sobras rateadas e lucro previsto por item.'],
  ['Ajuste manual', 'Arraste peças, encaixe no kerf, gire, mova entre chapas e use alinhar/distribuir para fechar a chapa.'],
  ['Pronto para a oficina', 'Sequência de corte por faixa ou coluna, PNG do plano, CSV das peças e planilha CorteCloud.'],
  ['Nuvem e celular', 'Backup na conta, orçamento no celular e instalação na tela inicial como aplicativo.']
]

export function landingHTML() {
  const pro = priceParts(PLANS.pro.priceLabel)
  const free = priceParts(PLANS.gratis.priceLabel)
  const limit = freeProjectLimit()
  const once1 = ONCE_PLANS['1m'].priceLabel
  const once3 = ONCE_PLANS['3m'].priceLabel
  return `
<div class="landing">
  <header class="lnav">
    <div class="lnav-in">
      <a class="lmark" href="#/"><span class="lmark-b">MDF</span><span class="lmark-w">ATELIER</span></a>
      <nav class="lnav-links">
        <a href="#/recursos">Recursos</a>
        <a href="#/plano-de-corte">Plano de corte</a>
        <a href="#/manual">Manual</a>
        <a href="#/como-funciona">Como funciona</a>
        <a href="#/planos">Planos</a>
        <a href="#/faq">FAQ</a>
      </nav>
      <a class="btn-l primary" href="#/app">Abrir o app</a>
    </div>
  </header>

  <section class="lhero">
    <div class="lhero-in">
      <div class="lhero-copy">
        <p class="lkicker">PARA MARCENARIAS DE MÓVEIS PLANEJADOS</p>
        <h1>Do desenho do móvel ao plano de corte e ao orçamento fechado</h1>
        <p class="lsub">
          Escolha o móvel no catálogo, ajuste medidas, veio e fita, e o app calcula
          chapas, sobras, ferragens e margem. Saem juntos o orçamento do cliente em
          PDF e o plano de corte para a serra — com 5 modos, incluindo o BBW.
        </p>
        <div class="lcta">
          <a class="btn-l primary big" href="#/app">Testar grátis</a>
          <a class="btn-l ghost big" href="#/planos">Ver planos</a>
        </div>
        <p class="lmini">Sem cartão no Grátis · Cancele o Pro quando quiser · Seus dados ficam com você</p>
      </div>
      <div class="lhero-visual">${shotsHTML()}</div>
    </div>
  </section>

  <section class="lstrip">
    <div class="lwrap lstrip-in">
      <div><b>52</b><span>móveis prontos</span></div>
      <div><b>5</b><span>modos de corte</span></div>
      <div><b>4</b><span>exportações da oficina</span></div>
      <div><b>PDF</b><span>com a sua marca</span></div>
    </div>
  </section>

  <section class="lsection" id="recursos">
    <div class="lwrap">
      <h2>Pensado para quem vive de móveis planejados</h2>
      <p class="lsec-sub">Projeto, custo e produção no mesmo lugar — sem planilha paralela.</p>
      <div class="lcards">
        ${CARDS.map(
          ([t, d], i) => `<div class="lcard"><span class="lcard-n">${String(i + 1).padStart(2, '0')}</span><h3>${t}</h3><p>${d}</p></div>`
        ).join('')}
      </div>
    </div>
  </section>

  <section class="lsection lspot" id="plano-de-corte">
    <div class="lwrap">
      <div class="lspot-grid">
        <div class="lspot-visual">${soloShot('corte', bodyCut())}</div>
        <div class="lspot-copy">
          <p class="lkicker">PLANO DE CORTE</p>
          <h2>5 modos para encaixar melhor cada chapa</h2>
          <p>
            O mesmo projeto pode ser cortado de formas diferentes. O app testa
            variações e mostra quantas chapas cada modo gasta, com a sequência de
            corte e a sobra de cada uma.
          </p>
          <ul class="lticks">
            <li>Serra/guilhotina: a sequência clássica, em faixas.</li>
            <li><b>BBW</b>: mantém as linhas da serra e ainda testa ordens e geometrias, compactando as chapas.</li>
            <li>MAC: agrupa o aproveitamento no canto e deixa uma faixa contínua reaproveitável.</li>
            <li>Nesting livre para o encaixe máximo e manual para o ajuste fino.</li>
            <li>Outros tamanhos de chapa: escolhe a menor que couber e soma o preço de cada uma.</li>
          </ul>
          <a class="btn-l primary" href="#/app">Ver no app</a>
        </div>
      </div>
    </div>
  </section>

  <section class="lsection lspot alt lsteps-bg" id="manual">
    <div class="lwrap">
      <div class="lspot-grid">
        <div class="lspot-visual">${soloShot('corte', bodyManual())}</div>
        <div class="lspot-copy">
          <p class="lkicker">AJUSTE MANUAL</p>
          <h2>O plano nas suas mãos, peça por peça</h2>
          <p>
            Quando a serra pede um encaixe específico, você ajusta direto na chapa.
            O app ajuda a manter tudo válido e a não perder material.
          </p>
          <ul class="lticks">
            <li>Arraste cada peça: ela encaixa nas bordas e no kerf da serra.</li>
            <li>Fica vermelha em posição inválida, com Desfazer e Limpar ajustes.</li>
            <li>Peças de aproveitamento (sem veio) giram 90° no botão ↻.</li>
            <li>Clique para selecionar (Shift/Ctrl soma várias) e use alinhar e distribuir.</li>
            <li>Mova peças para outra chapa, use Encaixar no canto e veja a maior sobra contínua.</li>
          </ul>
          <a class="btn-l primary" href="#/app">Testar o modo manual</a>
        </div>
      </div>
    </div>
  </section>

  <section class="lsection lsteps" id="como-funciona">
    <div class="lwrap">
      <h2>Do pedido ao papel e à serra em 4 passos</h2>
      <ol class="lstep-list">
        <li><span class="lnum">1</span><div><strong>Escolha o móvel</strong><p>Pegue as medidas do cliente e escolha um dos 52 modelos — ou monte peças avulsas.</p></div></li>
        <li><span class="lnum">2</span><div><strong>Ajuste os detalhes</strong><p>Portas, gavetas, saia, cores, sentido do veio e fita de borda, conferindo o esquema 2D.</p></div></li>
        <li><span class="lnum">3</span><div><strong>Confira custo e corte</strong><p>O app calcula chapas, sobras, ferragens, mão de obra e margem — e monta o plano de corte.</p></div></li>
        <li><span class="lnum">4</span><div><strong>Gere e envie</strong><p>PDF do orçamento com a sua logo e QR do WhatsApp, mais CSV, CorteCloud e PNG do plano.</p></div></li>
      </ol>
    </div>
  </section>

  <section class="lsection lpricing" id="planos">
    <div class="lwrap">
      <h2>Planos simples, por oficina</h2>
      <div class="lplans">
        <div class="lplan">
          <h3>Grátis</h3>
          <p class="lprice">${free.main}<span>/${free.suffix || 'mês'}</span></p>
          <ul>
            <li>Até ${limit} orçamentos ativos</li>
            <li>Catálogo com 52 móveis + peças avulsas</li>
            <li>Plano de corte em 5 modos, com veio e fita</li>
            <li>Custo, margem e orçamento em PDF</li>
            <li>Exportar CSV, CorteCloud e PNG do plano</li>
            <li>Backup na nuvem com login</li>
            <li>Marca "MDF Atelier" no documento</li>
          </ul>
          <a class="btn-l outline full" href="#/app">Começar grátis</a>
        </div>
        <div class="lplan hot">
          <h3>Pro</h3>
          <p class="lprice">${pro.main}<span>/${pro.suffix || 'mês'}</span></p>
          <ul>
            <li>Orçamentos ilimitados</li>
            <li>Logo da sua marcenaria no documento</li>
            <li>Nome, WhatsApp e QR no orçamento</li>
            <li>Tudo do Grátis, sem o teto de ${limit}</li>
            <li>Cancele quando quiser na aba Conta</li>
          </ul>
          <a class="btn-l primary full" href="#/app?upgrade=pro">Quero o Pro</a>
        </div>
      </div>
      <p class="lpricing-note">Assinatura mensal com renovação automática ou pagamento único de 1 mês (${once1}) ou 3 meses (${once3}), por PIX ou cartão à vista. A assinatura pode ser cancelada quando quiser na aba Conta; o período já pago segue até o vencimento. O plano Grátis não precisa de cartão.</p>
    </div>
  </section>

  <section class="lsection lfaq" id="faq">
    <div class="lwrap lwrap-narrow">
      <h2>Perguntas frequentes</h2>
      <details>
        <summary>Preciso instalar alguma coisa?</summary>
        <p>Não. O MDF Atelier roda no navegador do celular ou do computador. Dá para instalar na tela inicial como aplicativo e, no plano com nuvem, seus dados ficam salvos na sua conta.</p>
      </details>
      <details>
        <summary>Quais modos de plano de corte existem?</summary>
        <p>São cinco: serra/guilhotina (padrão), BBW, MAC, nesting livre e manual. O BBW é o "melhor dos dois mundos": mantém as linhas de corte da serra, mas testa várias ordens de encaixe e geometrias para gastar menos chapa. No manual você arrasta as peças direto na chapa.</p>
      </details>
      <details>
        <summary>Consigo ajustar o plano de corte na mão?</summary>
        <p>Sim. No modo manual você arrasta cada peça, encaixa nas bordas e no kerf da serra, gira peças sem veio em 90°, move peças entre chapas e usa alinhar/distribuir. Posições inválidas ficam vermelhas e você pode desfazer ou limpar os ajustes.</p>
      </details>
      <details>
        <summary>Consigo usar minha própria logo e meu WhatsApp?</summary>
        <p>O WhatsApp e o QR code já estão no Grátis. A logo da sua marcenaria no documento é do plano Pro. Sem Pro, o orçamento sai com a marca MDF Atelier.</p>
      </details>
      <details>
        <summary>Os cálculos de chapa e sobra são confiáveis?</summary>
        <p>Sim. O plano de corte é feito em cima da chapa real (2750x1830), considerando kerf da serra, refilo, sentido do veio e fita de borda. As peças ocultas entram como aproveitamento e as sobras podem ser cobradas por área usada ou rateadas entre os itens.</p>
      </details>
      <details>
        <summary>Como cancelo a assinatura?</summary>
        <p>Na aba Conta, toque em Cancelar assinatura. A próxima cobrança não acontece. O Pro segue até a data de vencimento; depois a conta volta ao Grátis. Se você escolheu pagamento único, não há cobrança para cancelar: o Pro vale até o fim do período pago.</p>
      </details>
      <details>
        <summary>O que acontece com meus dados se eu cancelar?</summary>
        <p>Você pode exportar CSV e PDF a qualquer momento. Depois que o período pago acaba, a conta volta ao Grátis: até 3 orçamentos e a marca MDF Atelier no documento.</p>
      </details>
      <div class="lfaq-cta">
        <a class="btn-l primary" href="#/app">Testar grátis agora</a>
      </div>
    </div>
  </section>

  <footer class="lfoot">
    <div class="lwrap lfoot-in">
      <div>
        <p class="lf-brand">MDF ATELIER</p>
        <p class="lf-tag">Software para marcenarias de móveis planejados.</p>
      </div>
      <nav>
        <a href="#/recursos">Recursos</a>
        <a href="#/planos">Planos</a>
        <a href="#/faq">FAQ</a>
        <a href="#/termos">Termos</a>
        <a href="#/privacidade">Privacidade</a>
        <a href="#/app">Entrar no app</a>
      </nav>
    </div>
    <p class="lf-copy">MDF Atelier — todos os direitos reservados. Contato: wolfsaasbr@gmail.com</p>
  </footer>
</div>`
}

function legalShell(title, body) {
  return `
<div class="landing">
  <header class="lnav">
    <div class="lnav-in">
      <a class="lmark" href="#/"><span class="lmark-b">MDF</span><span class="lmark-w">ATELIER</span></a>
      <nav class="lnav-links">
        <a href="#/">Início</a>
        <a href="#/app">Abrir o app</a>
      </nav>
      <a class="btn-l primary" href="#/app">Abrir o app</a>
    </div>
  </header>
  <section class="lsection llegal">
    <div class="lwrap lwrap-narrow">
      <h1>${title}</h1>
      ${body}
      <p class="llegal-back"><a href="#/">Voltar ao início</a></p>
    </div>
  </section>
</div>`
}

export function termosHTML() {
  const pro = priceParts(PLANS.pro.priceLabel)
  const limit = freeProjectLimit()
  return legalShell(
    'Termos de uso',
    `
      <p>O MDF Atelier é um software para marcenarias calcularem orçamentos e planos de corte. Ao usar o app, você concorda com estes termos.</p>
      <h2>Conta e planos</h2>
      <p>O plano Grátis permite até ${limit} orçamentos ativos e usa a marca MDF Atelier no documento. O plano Pro (${pro.main}${pro.suffix ? '/' + pro.suffix : '/mês'}) libera orçamentos ilimitados e a logo da sua marcenaria. A cobrança é feita por um processador de pagamento seguro, no próprio checkout dele. O cartão nunca é digitado neste site.</p>
      <h2>Cancelamento</h2>
      <p>Você pode cancelar a assinatura a qualquer momento na aba Conta do app. O cancelamento impede a próxima cobrança. O período já pago continua válido até a data de vencimento; depois a conta volta ao Grátis.</p>
      <h2>Uso aceitável</h2>
      <p>Você é responsável pelos orçamentos, preços e documentos que gera para seus clientes. O app auxilia no cálculo; a conferência final das medidas e do corte é sua.</p>
      <h2>Disponibilidade</h2>
      <p>O serviço depende de internet para abrir, autenticar e sincronizar. Dados no aparelho podem permanecer salvos localmente. Não garantimos funcionamento sem rede nem ausência de interrupções.</p>
      <h2>Contato</h2>
      <p>Dúvidas: <a href="mailto:wolfsaasbr@gmail.com">wolfsaasbr@gmail.com</a>.</p>
    `
  )
}

export function privacidadeHTML() {
  return legalShell(
    'Privacidade',
    `
      <p>Tratamos dados para operar o MDF Atelier, nos termos da LGPD (Lei 13.709/2018).</p>
      <h2>O que coletamos</h2>
      <p>Na conta: e-mail e senha (autenticação). Nos orçamentos: nome do cliente, telefone, notas, móveis, medidas, logo e WhatsApp da marcenaria que você informar. No pagamento: o processador de pagamento cuida dos dados do cartão; este site não recebe nem armazena número de cartão.</p>
      <h2>Onde fica</h2>
      <p>Sem login, os dados ficam neste aparelho (navegador). Com login, sincronizamos na sua conta na nuvem (Supabase) para você acessar de outro dispositivo.</p>
      <h2>Para que usamos</h2>
      <p>Gerar orçamentos, plano de corte, PDF e cobrança da assinatura. Não vendemos sua lista de clientes.</p>
      <h2>Seus direitos</h2>
      <p>Você pode acessar, corrigir ou pedir a exclusão dos dados da conta pelo e-mail <a href="mailto:wolfsaasbr@gmail.com">wolfsaasbr@gmail.com</a>. Ao sair da conta neste aparelho, os orçamentos da nuvem deixam de aparecer aqui e volta o projeto de exemplo.</p>
      <h2>Contato do responsável</h2>
      <p>Wolf Sistemas — <a href="mailto:wolfsaasbr@gmail.com">wolfsaasbr@gmail.com</a>.</p>
    `
  )
}

/* ---------------------------------------------------------------------
   Carrossel do hero: troca as telas do app a cada poucos segundos.
   CSS faz a transicao; este modulo so controla o indice ativo.
   --------------------------------------------------------------------- */

let landingTimer = null

export function stopLanding() {
  if (landingTimer) {
    clearInterval(landingTimer)
    landingTimer = null
  }
}

export function initLanding() {
  stopLanding()
  const root = document.querySelector('[data-shots]')
  if (!root) return
  const shots = Array.from(root.querySelectorAll('.lshot'))
  const dots = Array.from(root.querySelectorAll('.lshot-dot'))
  if (shots.length < 2) return

  let index = 0
  const show = (n) => {
    index = (n + shots.length) % shots.length
    shots.forEach((s, k) => s.classList.toggle('is-on', k === index))
    dots.forEach((d, k) => d.classList.toggle('is-on', k === index))
  }
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const cycle = () => show(index + 1)
  const play = () => {
    stopLanding()
    if (!reduce) landingTimer = setInterval(cycle, 3800)
  }

  dots.forEach((d) => {
    d.addEventListener('click', () => {
      show(Number(d.dataset.go))
      play()
    })
  })
  const prev = root.querySelector('[data-prev]')
  const next = root.querySelector('[data-next]')
  if (prev) {
    prev.addEventListener('click', () => {
      show(index - 1)
      play()
    })
  }
  if (next) {
    next.addEventListener('click', () => {
      show(index + 1)
      play()
    })
  }
  root.addEventListener('mouseenter', stopLanding)
  root.addEventListener('mouseleave', play)

  show(0)
  play()
}
