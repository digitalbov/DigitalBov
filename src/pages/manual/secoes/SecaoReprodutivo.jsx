import { useState } from 'react'
import { AlertBox } from '../../../components/UI'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }
const OL = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }
const CODE = { background: '#F3F4F6', borderRadius: 8, padding: '10px 14px', fontSize: '.82rem', color: '#111827', marginBottom: 18, lineHeight: 1.7 }

// ── Recriação do seletor de touros da monta natural (Reprodutivo.jsx) — chips
// adicionados por texto, estado 100% local, não grava nada. Mesma convenção
// de demonstração usada nas outras seções do manual.
function DemoTouros() {
  const [touros, setTouros] = useState(['Angus 12'])
  const [novo, setNovo] = useState('')

  const add = () => { if (novo.trim()) { setTouros(p => [...p, novo.trim()]); setNovo('') } }

  return (
    <div data-pdf-shot="true" style={{
      border: '1.5px dashed #C7D2E8', borderRadius: 12, padding: 18,
      background: '#F8FAFD', marginTop: 10, marginBottom: 18,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
        background: '#EEEDFE', color: '#3C3489', borderRadius: 8,
        padding: '3px 10px', fontSize: '.72rem', fontWeight: 700,
      }}>
        <i className="ti ti-flask" /> MODO DEMONSTRAÇÃO — não salva dados reais
      </div>
      <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, marginBottom: 6 }}>
        Touros (pelo menos 1 — o 1º da lista é o principal)
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {touros.map((t, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#EFF6FF', color: '#1E55B0', borderRadius: 999,
            padding: '4px 10px', fontSize: '.8rem', fontWeight: 600,
          }}>
            {t}
            <span style={{ cursor: 'pointer', color: '#9CA3AF' }} onClick={() => setTouros(p => p.filter((_, j) => j !== i))}>×</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nome do touro"
          onKeyDown={e => e.key === 'Enter' && add()} style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={add}>Adicionar</button>
      </div>
      {touros.length > 1 && (
        <div style={{ marginTop: 10, fontSize: '.78rem', color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 10px' }}>
          Com mais de um touro, a paternidade dos bezerros deste lote fica indefinida — o pai é registrado
          como "Monta natural — Lote", não um touro específico.
        </div>
      )}
    </div>
  )
}

export default function SecaoReprodutivo({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        A <strong>Gestão Reprodutiva</strong> acompanha o ciclo reprodutivo completo do rebanho: monta
        (inseminação artificial ou touro solto), diagnóstico de gestação, parto e, quando acontece, aborto —
        e calcula sozinha os índices de cada safra a partir desses lançamentos.
      </p>

      <div id="reprodutivo-estacoes" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Estação de monta</h4>
        <p style={P}>
          A estação de monta é um "guarda-chuva" que agrupa vários lotes (IATF, repasses, montas naturais) do
          mesmo período reprodutivo — ela tem só um nome e um período (início e, opcionalmente, fim). Não
          existe uma tela separada para criar uma estação do zero: ela nasce <strong>dentro do formulário de
          um lote</strong>, escolhendo "+ Criar nova estação de monta…" no campo Estação de monta. Depois de
          criada, ela pode ser editada ou excluída na lista de estações da aba Lotes/Montas.
        </p>
        <p style={P}>
          Ao editar o período de uma estação, o sistema não deixa você encolher as datas a ponto de deixar
          algum lote já vinculado para fora do intervalo — mostra exatamente quais lotes ficariam de fora e
          pede para ajustar as datas primeiro. Excluir uma estação não apaga os lotes dela: eles só ficam sem
          estação (viram "avulsos").
        </p>
      </div>

      <div id="reprodutivo-lotes" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Lotes de inseminação e monta natural</h4>
        <p style={P}>
          Existem dois botões separados — <strong>"+ Novo lote de inseminação"</strong> (IATF ou repasse por
          IA) e <strong>"+ Nova monta natural"</strong> (touro solto) — e é o botão que você clica que decide o
          tipo do lote, não uma escolha dentro do formulário. Um repasse não é um tipo à parte: é só um novo
          lote do mesmo tipo, criado mais tarde, que pode (ou não) apontar para a mesma estação de monta.
        </p>
        <ol style={OL}>
          <li>Informe a <strong>data</strong> da monta.</li>
          <li>Na inseminação: informe o <strong>touro/sêmen</strong> (texto livre) e, se usar, o <strong>protocolo</strong> (ex: "IATF P4").</li>
          <li>Na monta natural: adicione um ou mais <strong>touros</strong> (veja a demonstração abaixo).</li>
          <li>Escolha a <strong>estação de monta</strong>, se for o caso.</li>
          <li>Selecione as <strong>fêmeas</strong> — use os filtros de lote de origem, proprietário e categoria para achar mais rápido, ou "Selecionar todos do filtro".</li>
          <li>Clique em <strong>Salvar</strong>.</li>
        </ol>
        <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
          Experimente o seletor de touros abaixo — é uma recriação exata da tela real, mas não grava nada:
        </p>
        <DemoTouros />
        <p style={P}>
          Depois de criado, um lote também aceita <strong>"Adicionar animais ao lote"</strong> a qualquer
          momento, com a mesma lista de filtros — não precisa recriar o lote para incluir mais fêmeas depois.
        </p>
        <AlertBox type="amber" icon="ti-swords"
          title='"Lote" de novo tem dois sentidos diferentes'
          body='Este é o lote de inseminação/monta (aqui em Reprodutivo) — reúne animais expostos numa mesma monta e alimenta os índices de safra. É diferente do lote de manejo (tela Propriedade), que é só um agrupamento livre de animais para organizar o dia a dia. Um mesmo animal pode estar num lote de manejo e, ao mesmo tempo, num lote de monta — não têm relação um com o outro.' />
      </div>

      <div id="reprodutivo-diagnostico" style={{ scrollMarginTop: 90, marginTop: 18 }}>
        <h4 style={H4}>Diagnóstico de gestação (DG)</h4>
        <p style={P}>
          Abra o lote e use o card <strong>"Diagnóstico de gestação"</strong>. Primeiro defina a <strong>data
          do diagnóstico</strong> uma vez, no topo do card — todo clique (ou comando de voz, ex: "zero três
          prenha") feito depois usa essa data, não a de hoje. Para cada fêmea do lote, clique em
          <strong> Prenha</strong> ou <strong>Vazia</strong>. Não existe um terceiro botão "não observado" — se
          ainda não foi conferida, ela simplesmente continua sem diagnóstico. Uma fêmea diagnosticada Prenha
          mostra a data prevista de parto, calculada sozinha a partir da data da monta (não é algo que você
          digita).
        </p>
        <p style={P}>
          Depois que uma fêmea já tem parto ou aborto registrado <em>naquele lote</em>, o diagnóstico dela
          trava — o sistema avisa e não deixa mudar, para não desalinhar um evento já lançado.
        </p>
      </div>

      <div id="reprodutivo-partos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Partos</h4>
        <p style={P}>
          O botão <strong>"Registrar nascimento"</strong> aparece ao lado de qualquer fêmea diagnosticada
          Prenha. O formulário pede: <strong>data do nascimento</strong>, <strong>mãe</strong> (só aparecem
          aqui fêmeas com diagnóstico de prenhez confirmado em algum lote), <strong>sexo do bezerro</strong> e,
          opcionalmente, <strong>peso ao nascer</strong> e observações. Pai, proprietário e lote são
          preenchidos sozinhos a partir da mãe e do lote. Se você informar o peso ao nascer, o sistema já cria
          uma pesagem do tipo "nascimento" automaticamente — você não precisa lançar essa pesagem de novo na
          tela Pesagens.
        </p>
        <p style={P}>
          O <strong>brinco do bezerro não é digitado na hora</strong> — o sistema gera um provisório
          (SN-01, SN-02...) e você troca pelo brinco definitivo depois, na edição do nascimento.
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Registrando um parto de uma safra de ciclo anterior</h4>
        <p style={P}>
          Uma gestação dura cerca de 9 meses, então é normal o parto cair no ciclo seguinte ao da monta que o
          originou. Você <strong>não precisa escolher um ciclo</strong> na hora de registrar o parto: basta
          escolher a mãe e a data do parto — o sistema encontra sozinho, entre todos os lotes onde aquela mãe
          está com diagnóstico Prenha, qual monta bate com essa data (dentro da janela normal de gestação). Se
          a mãe tiver mais de um lote Prenha em aberto ao mesmo tempo (raro), aparece um seletor manual
          "Safra (lote de origem)" para você escolher o lote certo.
        </p>
        <div style={CODE}>
          O parto em si conta para o ciclo em que ele aconteceu de verdade (para relatórios/lançamentos por
          data). Mas os <strong>índices de parição e perdas</strong> contam sempre para a safra da <strong>monta</strong> —
          veja "Índices e funil da safra" abaixo.
        </div>
      </div>

      <div id="reprodutivo-abortos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Abortos</h4>
        <p style={P}>
          Disponível como <strong>"Registrar aborto"</strong> ao lado de uma fêmea Prenha que ainda não pariu.
          Pede data do aborto, <strong>causa</strong> (Infeccioso, Nutricional, Traumático, Desconhecido ou
          Outro) e observações opcionais. Ao salvar, a situação reprodutiva da fêmea volta para "vazia" — mas
          o diagnóstico de prenhez original continua no histórico, o aborto é só um evento novo em cima dele,
          nada é apagado ou reescrito.
        </p>
      </div>

      <div id="reprodutivo-indices" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Índices e funil da safra</h4>
        <p style={P}>
          Cada safra (lote, ou o conjunto de lotes de um ciclo) mostra um funil: matrizes aptas → taxa de
          aproveitamento → expostas/inseminadas → prenhas → taxa de prenhez → gestando (ainda dentro do prazo,
          sem diagnóstico definitivo de parto ainda) → abortos → perdas não identificadas → perda gestacional
          → partos → taxa de parição → peso médio ao nascer → mortalidade de terneiros → desmamados → taxa de
          desmama → peso médio ao desmame → kg de bezerro desmamado por matriz exposta.
        </p>
        <AlertBox type="amber" icon="ti-calendar-repeat"
          title="Os índices pertencem ao ciclo da MONTA, não ao ciclo do parto"
          body="Um parto que acontece em outubro de 2026 (ciclo 2026/27) pode contar para os índices do ciclo 2025/26, se a monta que o gerou foi lançada nesse ciclo anterior — porque a gestação atravessa a virada do ciclo. É por isso que, ao vender ou excluir um animal, o índice histórico da safra em que ele nasceu não muda: ele já está fechado na safra da monta, não recalcula pela data de hoje." />
      </div>

      <h4 style={{ ...H4, marginTop: 4 }}>Validações de data e idade</h4>
      <ul style={{ ...OL, listStyle: 'disc' }}>
        <li><strong>Fêmea nascida depois da monta</strong> — nem aparece na lista para selecionar; se por algum caminho for enviada mesmo assim, o sistema recusa salvar.</li>
        <li><strong>Idade mínima para exposição: 24 meses</strong> (na data da monta, não hoje) — o mesmo corte usado para contar uma fêmea como "matriz apta" em Metas. Fêmeas mais novas nem aparecem na lista de seleção do lote.</li>
        <li><strong>Idade mínima para parto: 20 meses</strong> (na data do parto) — abaixo disso, o sistema recusa salvar por ser biologicamente implausível.</li>
        <li><strong>Gestação fora de 260-300 dias</strong> entre a monta e o parto — isto é só um <strong>aviso</strong>, não bloqueia: o sistema salva mesmo assim e pede para você conferir se escolheu o lote certo.</li>
      </ul>
    </div>
  )
}
