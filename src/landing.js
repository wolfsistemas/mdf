import './landing.css'

// Preencha com seu WhatsApp comercial (formato 55DDDNUMBER) para o CTA dos
// planos Pro/Premium abrir conversa. Vazio = CTA leva para o app.
const WHATSAPP = ''

function wa(plan) {
  if (!WHATSAPP) return '#/app'
  const msg = encodeURIComponent(`Olá! Quero o plano ${plan} do MDF Atelier.`)
  return `https://wa.me/${WHATSAPP}?text=${msg}`
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

export function landingHTML() {
  return `
<div class="landing">
  <header class="lnav">
    <div class="lnav-in">
      <a class="lmark" href="#/app"><span class="lmark-b">MDF</span><span class="lmark-w">ATELIER</span></a>
      <nav class="lnav-links">
        <a href="#recursos">Recursos</a>
        <a href="#como-funciona">Como funciona</a>
        <a href="#planos">Planos</a>
        <a href="#faq">FAQ</a>
      </nav>
      <a class="btn-l primary" href="#/app">Abrir o app</a>
    </div>
  </header>

  <section class="lhero">
    <div class="lhero-in">
      <div class="lhero-copy">
        <p class="lkicker">PARA MARCENARIAS DE MÓVEIS PLANEJADOS</p>
        <h1>Orçamentos que fecham venda, direto do seu celular</h1>
        <p class="lsub">
          Monte o móvel, o app calcula chapas, sobras, fita e margem — e gera um
          orçamento impresso ou em PDF com foto técnica, capa e QR do WhatsApp.
          Pronto para enviar ao cliente.
        </p>
        <div class="lcta">
          <a class="btn-l primary big" href="#/app">Testar grátis</a>
          <a class="btn-l ghost big" href="#planos">Ver planos</a>
        </div>
        <p class="lmini">Sem cartão de crédito · Funciona no navegador · Seus dados ficam com você</p>
      </div>
      <div class="lhero-visual">
        <div class="lpage">
          <div class="lpage-top">
            <span class="lp-brand">MDF ATELIER</span>
            <span class="lp-no">ORÇAMENTO Nº 05092026</span>
          </div>
          <div class="lpage-body">
            <div class="lp-item">
              <span class="lp-swatch" style="background:#e8c39a"></span>
              <div class="lp-item-info">
                <strong>[A-01] Armário escritório</strong>
                <span>3 portas · 1200x1800x500 · MDF 15 mm · fita PVC 22 mm</span>
              </div>
              <div class="lp-price">
                <span>Valor unitário</span>
                <strong>R$ 2.340,00</strong>
              </div>
            </div>
            <div class="lp-visual-row">
              <div class="lp-svg">${CABINET_SVG}</div>
              <div class="lp-chips">
                <span>18 peça(s)</span>
                <span>3,240 m² de chapa</span>
                <span>11,42 m de fita</span>
              </div>
            </div>
          </div>
          <div class="lp-qr">
            <span class="lp-qr-box"></span>
            <div>
              <strong>Fale com a gente</strong>
              <small>Escaneie para abrir o WhatsApp com nome e valor do orçamento.</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="lsection" id="recursos">
    <div class="lwrap">
      <h2>Pensado para quem vive de móveis planejados</h2>
      <div class="lcards">
        <div class="lcard">
          <h3>Documento que impressiona</h3>
          <p>Uma página por móvel, com o desenho técnico e os valores. Fecha o PDF, imprime e entrega: parece projeto de empresa grande.</p>
        </div>
        <div class="lcard">
          <h3>Custo real, margem justa</h3>
          <p>Preço da chapa, aproveitamento e sobras rateadas, fita por metro e mão de obra. O app te diz se o orçamento está dando lucro.</p>
        </div>
        <div class="lcard">
          <h3>Plano de corte na tela</h3>
          <p>Guilhotina ou nesting livre, com veio e fita por peça. Menos erro na serra, menos chapa desperdiçada.</p>
        </div>
        <div class="lcard">
          <h3>Catálogo de móveis prontos</h3>
          <p>Armários, guarda-roupas, mesas e mais. Ajuste medidas e gavetas em minutos — ou cadastre peças avulsas.</p>
        </div>
        <div class="lcard">
          <h3>Sua marca no papel</h3>
          <p>Logo da sua marcenaria, WhatsApp com QR code e condições do seu jeito. O cliente leva seu contato junto com o orçamento.</p>
        </div>
        <div class="lcard">
          <h3>Backup na nuvem</h3>
          <p>Orçamentos sincronizados na sua conta. Troque de aparelho e continue de onde parou.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="lsection lsteps" id="como-funciona">
    <div class="lwrap">
      <h2>Do pedido ao papel em 3 passos</h2>
      <ol class="lstep-list">
        <li><span class="lnum">1</span><div><strong>Escolha o móvel</strong><p>Pegue as medidas do cliente e escolha o modelo no catálogo — armário, mesa, closet.</p></div></li>
        <li><span class="lnum">2</span><div><strong>Confira custo e margem</strong><p>O app calcula chapas, sobras e fita e mostra seu custo real antes de você definir o preço.</p></div></li>
        <li><span class="lnum">3</span><div><strong>Imprima e envie</strong><p>Gere o orçamento em PDF com foto, descrição, total e QR do WhatsApp. Envie e feche a venda.</p></div></li>
      </ol>
    </div>
  </section>

  <section class="lsection lpricing" id="planos">
    <div class="lwrap">
      <h2>Planos simples, por oficina</h2>
      <div class="lplans">
        <div class="lplan">
          <h3>Grátis</h3>
          <p class="lprice">R$ 0<span>/mês</span></p>
          <ul>
            <li>Até 3 orçamentos ativos</li>
            <li>Documento paginado com foto</li>
            <li>QR code de WhatsApp</li>
            <li>Plano de corte e custos</li>
            <li>Marca "MDF Atelier" no documento</li>
          </ul>
          <a class="btn-l outline full" href="#/app">Começar grátis</a>
        </div>
        <div class="lplan hot">
          <h3>Pro</h3>
          <p class="lprice">R$ 49<span>/mês</span></p>
          <ul>
            <li>Orçamentos ilimitados</li>
            <li>Logo e nome da sua marcenaria</li>
            <li>WhatsApp e QR personalizados</li>
            <li>Exportar CSV das peças</li>
            <li>Backup na nuvem</li>
            <li>Suporte por WhatsApp</li>
          </ul>
          <a class="btn-l primary full" href="${wa('Pro')}">Quero o Pro</a>
        </div>
        <div class="lplan">
          <h3>Premium</h3>
          <p class="lprice">R$ 99<span>/mês</span></p>
          <ul>
            <li>Tudo do Pro</li>
            <li>Até 5 usuários na oficina</li>
            <li>Configuração e treinamento</li>
            <li>Prioridade no suporte</li>
            <li>Consultoria de precificação</li>
          </ul>
          <a class="btn-l outline full" href="${wa('Premium')}">Falar com a gente</a>
        </div>
      </div>
      <p class="lpricing-note">Pagamento recorrente. Cancele quando quiser. O plano Grátis não precisa de cartão.</p>
    </div>
  </section>

  <section class="lsection lfaq" id="faq">
    <div class="lwrap lwrap-narrow">
      <h2>Perguntas frequentes</h2>
      <details>
        <summary>Preciso instalar alguma coisa?</summary>
        <p>Não. O MDF Atelier roda no navegador do celular ou do computador. No plano com nuvem, seus dados ficam salvos na sua conta.</p>
      </details>
      <details>
        <summary>Funciona sem internet?</summary>
        <p>Funciona. O app guarda os dados no aparelho e sincroniza quando você está online e logado na conta.</p>
      </details>
      <details>
        <summary>Consigo usar minha própria logo e meu WhatsApp?</summary>
        <p>Sim, nos planos Pro e Premium. O orçamento sai com a sua marca, seu número e QR code que abre a conversa já preenchida.</p>
      </details>
      <details>
        <summary>Os cálculos de chapa e sobra são confiáveis?</summary>
        <p>Sim. O plano de corte é feito em cima da chapa real (2750x1830), considerando kerf da serra, refilo, sentido do veio e fita de borda. As sobras podem ser cobradas por área usada ou rateadas entre os itens.</p>
      </details>
      <details>
        <summary>O que acontece com meus dados se eu cancelar?</summary>
        <p>Você pode exportar tudo (CSV e PDF) antes de cancelar. Após o cancelamento, você mantém acesso de leitura pelo tempo previsto em contrato.</p>
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
        <a href="#recursos">Recursos</a>
        <a href="#planos">Planos</a>
        <a href="#faq">FAQ</a>
        <a href="#/app">Entrar no app</a>
      </nav>
    </div>
    <p class="lf-copy">MDF Atelier — todos os direitos reservados.</p>
  </footer>
</div>`
}
