import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePermissoes } from '../lib/PermissoesContext'
import { db, apenasColunasReais } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, idadeFormatada, fmtData, pct, catCor, sitCor, repCor, sortBrinco, dataNaoFutura, algumErro, statusReprodutivoExibicao, statusReprodutivoVendida, statusReprodutivoDetalhado, statusReprodutivoCiclo, STATUS_CICLO_ANIMAL, desfechoReprodutivo, FALHA_MOTIVO_LABEL, PERDA_PRESUMIDA_DIAS_APOS_PREVISTO, paiEhMontaNaturalIndefinida, capitalizarPrimeira, capitalizarNome, sanidadeRealizada, calcDesempenhoVidaFemea, agruparPesoPorData, calcGMD, classificarDesfechosPorSafra, CORES_DESFECHO, ROTULOS_DESFECHO, calcHistoricoTouro, AMOSTRA_MINIMA_TOURO, nomePai, nomeTouro, paiSemVinculo, touroSemVinculo, resolverTouroDigitado, resumoFeirasAnimal, statusFeiraParticipacao } from '../lib/helpers'
import { hojeISO } from '../lib/hoje'
import { confirmarPerdaPresumida } from '../lib/perdaGestacionalPresumida'
import { Loading, EmptyState, Modal, Field, MicButton, Badge, toast, BotaoPDF, ErroCarregamento, Confirm, AlertBox } from '../components/UI'
import { SeletorTouro, ResolucaoTouro } from '../components/SeletorTouro'
import Filtros from '../components/Filtros'
import { baixarModeloAnimais, lerPlanilhaAnimais, validarLinhas } from '../lib/importacaoAnimais'
import GraficoEvolucaoPeso from '../components/GraficoEvolucaoPeso'
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const SITUACOES = ['ativo','vendido','morto']

const CLASSIFICACAO_LABEL = {
  PO: 'PO — Puro de Origem',
  PA: 'PA — Puro por Cruzamento',
  CO: 'CO — Controlado por Ascendência',
  NA: 'N/A',
}

// ── Helpers de timeline ───────────────────────────────────────────
const TL_ICONS = {
  nascimento:   '🐮',
  pesagem:      '⚖️',
  inseminacao:  '💉',
  dg_prenha:    '✅',
  dg_vazia:     '❌',
  parto_mae:    '🍼',
  parto_bezerro:'🐣',
  aborto:       '⚠️',
}

function TimelineCard({ timeline, loading }) {
  if (loading) return (
    <div className="card">
      <div className="card-title"><i className="ti ti-timeline" /> Linha do tempo</div>
      <Loading text="Carregando histórico..." />
    </div>
  )
  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-timeline" /> Linha do tempo</div>
      {timeline.length === 0 ? (
        <div style={{ fontSize: '.83rem', color: '#9CA3AF', padding: '4px 0' }}>
          Nenhum evento registrado além do nascimento.
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 30 }}>
          {/* Linha vertical */}
          <div style={{
            position: 'absolute', left: 9, top: 10, bottom: 4,
            width: 2, background: '#E5E7EB', borderRadius: 2
          }} />
          {timeline.map((ev, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
              {/* Ponto */}
              <div style={{
                position: 'absolute', left: -26, top: 1,
                width: 20, height: 20, borderRadius: '50%',
                background: 'white', border: '2px solid #D1D5DB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, lineHeight: 1
              }}>
                {ev.icon}
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#9CA3AF', lineHeight: 1.3 }}>
                  {fmtData(ev.data)}
                </div>
                <div style={{ fontWeight: 500, fontSize: '.85rem', color: '#111827', marginTop: 1 }}>
                  {ev.titulo}
                </div>
                {ev.descricao && (
                  <div style={{ fontSize: '.78rem', color: '#6B7280' }}>{ev.descricao}</div>
                )}
                {/* Fase 12 — selo do parto órfão (sem lote_inseminacao_id):
                    hoje fora dos índices da safra sem nenhum aviso visual —
                    este selo é o ponto de correção disso. */}
                {ev.semLote && (
                  <div title="Este parto não está vinculado a nenhum lote de inseminação/monta — não entra nos índices de parição, mortalidade, GMD Terneiros etc. da safra. Corrija em Reprodutivo → Nascimentos → Editar."
                    style={{ display:'inline-block', fontSize:'.7rem', fontWeight:600, color:'#92620A', background:'#FEF3C7', border:'.5px solid #F3D5A3', borderRadius:12, padding:'2px 8px', marginTop:4, cursor:'help' }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize:11 }} /> Sem lote vinculado — fora dos índices da safra
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Genealogia ────────────────────────────────────────────────────

function NodoCard({ animal, nome, tipo, destaque, onSelect, onClickTouro, semVinculo }) {
  const isTouro   = tipo === 'touro'
  const isUnknown = tipo === 'unknown'
  const isMale    = animal?.sexo === 'M'
  const hasClick      = !destaque && !isTouro && !isUnknown && animal && onSelect
  // onClickTouro: só setado pelo chamador quando o pai é resolvível (hoje, só
  // o caso "monta natural com vários touros" — ver Animais.jsx). Sem isso, o
  // nó de touro nunca é clicável (não existe vínculo confiável nome→lote/animal).
  const hasClickTouro = isTouro && !!onClickTouro

  const borderColor = isTouro   ? '#D1D5DB'
                    : isUnknown ? '#D1D5DB'
                    : destaque  ? '#2B6CD9'
                    : isMale    ? '#93C5FD'
                    : '#1BA89C'
  const bgColor     = destaque  ? '#2B6CD9'
                    : isTouro   ? '#F9FAFB'
                    : isUnknown ? '#F9FAFB'
                    : isMale    ? '#EFF6FF'
                    : '#F0FBE4'

  return (
    <div
      onClick={() => { if (hasClick) onSelect(animal); else if (hasClickTouro) onClickTouro() }}
      style={{
        border: `${isUnknown ? '1.5px dashed' : '2px solid'} ${borderColor}`,
        borderRadius: 10, padding: '8px 12px', textAlign: 'center',
        minWidth: 80, maxWidth: 130, flexShrink: 0,
        background: bgColor, color: destaque ? 'white' : '#111827',
        cursor: (hasClick || hasClickTouro) ? 'pointer' : 'default',
        boxShadow: destaque ? '0 3px 14px rgba(30,77,53,.28)' : '0 1px 3px rgba(0,0,0,.07)',
      }}
    >
      {isTouro ? (
        <>
          <div style={{ fontSize: 18, color: '#60A5FA' }}>♂</div>
          <div style={{ fontWeight: 600, fontSize: '.82rem', lineHeight: 1.3, marginTop: 2 }}
            title={semVinculo ? 'Sem vínculo por id — texto congelado no momento do lançamento; um rename do touro cadastrado não atualiza este nome.' : undefined}>
            {nome}
          </div>
          <div style={{ fontSize: '.63rem', color: semVinculo ? '#BA7517' : '#9CA3AF', marginTop: 2 }}>
            {hasClickTouro ? '▶ ver lote' : semVinculo ? '⚠ sem vínculo' : 'Touro'}
          </div>
        </>
      ) : isUnknown ? (
        <>
          <div style={{ fontSize: 18, color: '#9CA3AF' }}>♀</div>
          <div style={{ fontWeight: 600, fontSize: '.82rem', lineHeight: 1.3, marginTop: 2 }}>{nome}</div>
          <div style={{ fontSize: '.63rem', color: '#9CA3AF', marginTop: 2 }}>Não cadastrada</div>
        </>
      ) : animal ? (
        <>
          <div style={{ fontSize: 18, color: destaque ? 'rgba(255,255,255,.9)' : isMale ? '#3B82F6' : '#27A838' }}>
            {animal.sexo === 'F' ? '♀' : '♂'}
          </div>
          <div style={{ fontWeight: 700, fontSize: '.92rem', lineHeight: 1.3, marginTop: 2 }}>
            {animal.brinco}
          </div>
          <div style={{ fontSize: '.63rem', color: destaque ? 'rgba(255,255,255,.65)' : '#6B7280', marginTop: 2 }}>
            {calcCategoria(animal.data_nascimento, animal.sexo, undefined, animal.is_touro)}
          </div>
          {hasClick && (
            <div style={{ fontSize: '.58rem', color: '#9CA3AF', marginTop: 3 }}>▶ ver ficha</div>
          )}
        </>
      ) : null}
    </div>
  )
}

function GenStem() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
      <div style={{ width: 2, height: 22, background: '#D1D5DB', borderRadius: 1 }} />
    </div>
  )
}

function GenRowLabel({ children, color = '#9CA3AF' }) {
  return (
    <div style={{
      textAlign: 'center', fontSize: '.63rem', fontWeight: 700,
      letterSpacing: '.09em', textTransform: 'uppercase',
      color, marginBottom: 7, marginTop: 2
    }}>{children}</div>
  )
}

function ArvoreGenealogica({ animal, animais, onSelect, onClickPai }) {
  // Mãe: busca por id (prioridade — imune a rename de brinco, mesmo padrão
  // já usado em nomePai/nomeTouro) ou por texto só quando não há id (dado
  // digitado à mão, sem vínculo — ver verificarReferenciasDesatualizadas em
  // Animais.jsx).
  const mae = animais.find(x =>
    (animal.mae_id && x.id === animal.mae_id) ||
    (!animal.mae_id && animal.mae_brinco && x.brinco === animal.mae_brinco)
  ) || null

  // Avós maternos
  const avoMae = mae ? animais.find(x =>
    (mae.mae_id && x.id === mae.mae_id) ||
    (!mae.mae_id && mae.mae_brinco && x.brinco === mae.mae_brinco)
  ) || null : null
  // Touro (nomePai — "Nome (Brinco)" quando cadastrado, ver helpers.js —
  // um dos 4 pontos genealógicos/documentais aprovados, Tarefa B.4). Só
  // resolve quando mae.pai existe de fato — nomePai devolve '—' (string
  // truthy) pra "sem pai", o que quebraria os checks hasAvos/hasPai abaixo
  // se chamado sem essa guarda.
  const avoPaiMae = mae?.pai ? nomePai(mae, { comBrinco: true }) : null

  // Filhos: animais com mae_brinco = brinco deste animal
  const filhos = animais
    .filter(x =>
      (animal.brinco && x.mae_brinco === animal.brinco) ||
      (animal.id && x.mae_id === animal.id)
    )
    .sort((a, b) => a.brinco.localeCompare(b.brinco, undefined, { numeric: true }))

  const hasPai         = !!animal.pai
  const hasMae         = !!mae
  const hasMaeSoText   = !mae && !!animal.mae_brinco
  const hasAvos        = mae && (avoMae || avoPaiMae)
  const hasFilhos      = filhos.length > 0
  const semDados       = !hasPai && !hasMae && !hasMaeSoText && !hasFilhos

  if (semDados) {
    return (
      <div style={{ fontSize: '.83rem', color: '#9CA3AF', fontStyle: 'italic', padding: '4px 0' }}>
        Sem informações de genealogia cadastradas para este animal.
      </div>
    )
  }

  // Alerta de consanguinidade: mesmo touro em mais de um nível — nomePai
  // resolvido (não o texto cru) pra dois lotes do MESMO touro cadastrado
  // nunca escaparem da detecção só por terem sido digitados de forma
  // diferente em cada monta.
  const touros = [
    hasPai ? nomePai(animal, { comBrinco: true }) : null,
    avoPaiMae,
    avoMae?.pai ? nomePai(avoMae, { comBrinco: true }) : null,
    mae?.pai ? nomePai(mae, { comBrinco: true }) : null,
  ].filter(Boolean)
  const tc = {}; touros.forEach(t => { tc[t] = (tc[t] || 0) + 1 })
  const repetidos = Object.entries(tc).filter(([, n]) => n > 1).map(([t]) => t)

  return (
    <div>
      {/* Alerta */}
      {repetidos.length > 0 && (
        <div style={{
          background: '#FEF3C7', border: '.5px solid #FBBF24', borderRadius: 8,
          padding: '8px 12px', marginBottom: 12,
          fontSize: '.78rem', color: '#633806',
          display: 'flex', gap: 8, alignItems: 'flex-start'
        }}>
          <span>⚠️</span>
          <span>
            O touro <strong>{repetidos.join(', ')}</strong> aparece em mais de uma geração desta linhagem. Avalie possível consanguinidade.
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 12px' }}>

          {/* Avós maternos */}
          {hasAvos && (
            <>
              <GenRowLabel>Avós maternos</GenRowLabel>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {avoPaiMae && <NodoCard tipo="touro" nome={avoPaiMae} semVinculo={paiSemVinculo(mae)} />}
                {avoMae    && <NodoCard tipo="animal" animal={avoMae} onSelect={onSelect} />}
              </div>
              <GenStem />
            </>
          )}

          {/* Pais */}
          {(hasPai || hasMae || hasMaeSoText) && (
            <>
              <GenRowLabel>Pais</GenRowLabel>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {hasPai      && <NodoCard tipo="touro"   nome={nomePai(animal, { comBrinco: true })} onClickTouro={onClickPai} semVinculo={paiSemVinculo(animal)} />}
                {hasMae      && <NodoCard tipo="animal"  animal={mae} onSelect={onSelect} />}
                {hasMaeSoText && <NodoCard tipo="unknown" nome={`Brinco ${animal.mae_brinco}`} />}
              </div>
              <GenStem />
            </>
          )}

          {/* Animal central */}
          <GenRowLabel color="#2B6CD9">Animal selecionado</GenRowLabel>
          <NodoCard tipo="animal" animal={animal} destaque />

          {/* Filhos */}
          {hasFilhos && (
            <>
              <GenStem />
              <GenRowLabel>Descendentes ({filhos.length})</GenRowLabel>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                {filhos.map(f => (
                  <NodoCard key={f.id} tipo="animal" animal={f} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

export default function Animais() {
  const { podeEditar, podeVer } = usePermissoes()
  const podeEditarAnimais = podeEditar('animais')
  // Atalho pra Lotes vive em Propriedade (é lá que lotes são criados/editados —
  // ver Propriedade.jsx). É só navegação (não edita nada aqui), então checa
  // podeVer('propriedade'), não podeEditar — respeita a permissão do módulo de
  // DESTINO, que pode ser diferente da de Animais.
  const podeVerLotes = podeVer('propriedade')
  const navigate = useNavigate()
  const location = useLocation()
  const abrirAnimalConsumido = useRef(false)

  // Com animal selecionado, leva pro lote DELE (se tiver um); sem seleção
  // (tela de lista), leva pra seção de Lotes geral. Propriedade.jsx lê esse
  // state (location.state.section/loteId) pra abrir direto na seção certa e
  // destacar o lote, em vez de sempre cair no resumo.
  const irParaLotes = () => {
    if (!podeVerLotes) return
    navigate('/propriedade', { state: { section: 'lotes', loteId: selected?.lote_id || null } })
  }


  const listaRef   = useRef(null)
  const detalheRef = useRef(null)

  const [animais,         setAnimais]         = useState([])
  const [props,           setProps]           = useState([])
  const [lotes,           setLotes]           = useState([])
  const [partosTodos,     setPartosTodos]     = useState([])
  const [ciclos,          setCiclos]          = useState([])
  // Touros externos (emprestado/sêmen de IA) — Item 5: mesmo seletor com
  // resolução ao vivo já usado em Reprodutivo.jsx (SeletorTouro/ResolucaoTouro,
  // extraídos pra components/SeletorTouro.jsx), reaproveitado aqui pro campo "Pai".
  const [tourosExternos,  setTourosExternos]  = useState([])
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(false)
  const [filtSit,         setFiltSit]         = useState('ativo')
  const [filtProp,        setFiltProp]        = useState('')
  const [filtSexo,        setFiltSexo]        = useState('')
  const [search,          setSearch]          = useState('')
  const [selected,        setSelected]        = useState(null)
  const [modal,           setModal]           = useState(false)
  const [editData,        setEditData]        = useState(null)
  const [saving,          setSaving]          = useState(false)
  // Duplicidade de brinco no salvamento (mesmo padrão de brincoDupCreate/
  // brincoDupEdit em Reprodutivo.jsx — debounce 400ms contra db.animais.
  // byBrinco, bloqueia o botão, não só avisa). Independe do que a constraint
  // do banco disser — mensagem amigável em vez do erro cru do Postgres.
  const [brincoDup,       setBrincoDup]       = useState(null)
  // Aviso pós-salvamento quando o brinco muda: registros que referenciam o
  // brinco ANTIGO só por texto (sem id — pai/mae_brinco digitados à mão, ou
  // lote de monta legado) não são corrigidos sozinhos (ver decisão: avisar,
  // não propagar — propagar texto por texto arriscaria "corrigir" o vínculo
  // do animal errado se dois animais já tiveram esse brinco em momentos
  // diferentes do histórico).
  const [avisoBrincoRef,  setAvisoBrincoRef]  = useState(null)
  // Timeline
  const [timeline,        setTimeline]        = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  // Eventos brutos do animal selecionado (partos/inseminações/abortos), usados
  // pelo card "Histórico reprodutivo" (status por ciclo, derivado — ver
  // statusReprodutivoCiclo em helpers.js) — mesma fonte que já alimenta a
  // timeline, só guardada em bruto em vez de achatada em eventos.
  const [reprodutivoBruto, setReprodutivoBruto] = useState({ partos: [], inseminacoes: [], abortos: [] })
  // Histórico reprodutivo do TOURO (sexo=M + is_touro) — sob demanda, só
  // quando a ficha de um touro é aberta (ver useEffect abaixo), nunca no
  // load geral da tela: são 3 queries pequenas escopadas SÓ aos dados deste
  // touro (filhos por pai=brinco, lotes por touro=brinco, partos das MESMAS
  // safras pra comparação), nunca um scan da fazenda inteira.
  const [historicoTouroBruto, setHistoricoTouroBruto] = useState(null)
  const [historicoTouroLoading, setHistoricoTouroLoading] = useState(false)
  // Pesagens do animal selecionado, em bruto — alimenta o gráfico de evolução
  // de peso (mesmo componente reaproveitado de Pesagens.jsx) ao lado da timeline.
  const [pesagensAnimal, setPesagensAnimal] = useState([])
  // Contemporâneos (mesma fazenda, mesmo sexo, ±3 meses de nascimento) — linha
  // de comparação discreta no mesmo gráfico. nContemporaneos guarda o TAMANHO
  // do grupo mesmo quando pesagensContemporaneos fica vazio (< 3 contemporâneos
  // → nem busca pesagem, mas o número entra na nota discreta pro usuário).
  const [pesagensContemporaneos, setPesagensContemporaneos] = useState([])
  const [nContemporaneos, setNContemporaneos] = useState(0)
  // Registro do animal SELECIONADO como bezerro (db.partos.byBezerro) — usado
  // só pra resolver o clique em "Pai" quando é monta natural com paternidade
  // indefinida (leva pro lote via parto.lote_inseminacao_id, ver botaoPai abaixo).
  const [partoComoFilho,  setPartoComoFilho]  = useState(null)
  // Histórico sanitário
  const [histSanidade,    setHistSanidade]     = useState([])
  // Feiras e premiações — mesmo padrão de carregamento de histSanidade acima
  // (query própria, disparada quando `selected` muda, não misturada em
  // loadTimeline: aqui vira um CARD à parte, não um evento na timeline —
  // ver loadTimeline abaixo pra saber quais participações também entram lá).
  const [histFeiras,      setHistFeiras]       = useState([])
  // Perda gestacional presumida (Fase 10) — mesmo par de estados do detalhe
  // do lote em Reprodutivo.jsx: confirmPerdaAlvo guarda o contexto pendente,
  // confirmandoPerda desabilita o botão durante a gravação.
  const [confirmPerdaAlvo, setConfirmPerdaAlvo] = useState(null)
  const [confirmandoPerda, setConfirmandoPerda] = useState(false)
  // Notas
  const [notas,           setNotas]           = useState('')
  const [savingNotas,     setSavingNotas]     = useState(false)
  // Importação via planilha
  const [modalImport,     setModalImport]     = useState(false)
  const [previewImport,   setPreviewImport]   = useState(null) // { validos, erros }
  const [importando,      setImportando]      = useState(false)
  const fileImportRef = useRef(null)
  // Filtros extras (tabela desktop e mobile)
  const [filtCategoria,   setFiltCategoria]   = useState('')
  const [filtRep,         setFiltRep]         = useState('')
  const [filtLote,        setFiltLote]        = useState('')
  // Ordenação (tabela desktop)
  const [ordenacao,       setOrdenacao]       = useState({ campo: 'brinco', dir: 'asc' })
  // Seleção em lote (tabela desktop)
  const [selecionados,    setSelecionados]    = useState([])
  const [excluindoLote,   setExcluindoLote]   = useState(false)
  // Confirmação via <Confirm> do app em vez de window.confirm() nativo
  // (padronização — exclusão definitiva de animal(is), sem volta).
  const [confirmExcluirAnimal,       setConfirmExcluirAnimal]       = useState(null) // animal
  const [confirmExcluirSelecionados, setConfirmExcluirSelecionados] = useState(false)

  useEffect(() => { loadAll() }, [])

  // Veio de outra tela (Reprodutivo.jsx — clique num brinco de terneiro na
  // linha do tempo do lote) — abre a ficha do animal direto, sem o usuário
  // precisar buscar pelo brinco. Espera `animais` carregar (loadAll acima)
  // antes de tentar achar o id; abrirAnimalConsumido evita reabrir de novo
  // se o usuário limpar a seleção depois (mesmo padrão de abrirLoteId em
  // Reprodutivo.jsx).
  useEffect(() => {
    const alvo = location.state?.abrirAnimalId
    if (!alvo || abrirAnimalConsumido.current || animais.length === 0) return
    const animal = animais.find(a => a.id === alvo)
    if (!animal) return
    abrirAnimalConsumido.current = true
    setSelected(animal)
    detalheRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.state, animais])

  // Duplicidade de brinco — mesmo debounce de Reprodutivo.jsx (brincoDupCreate/
  // brincoDupEdit), reaproveitado aqui: cadastro OU rename, cobre os dois.
  // Exclui o próprio animal sendo editado — senão o brinco atual dele sempre
  // "bateria" como duplicado consigo mesmo.
  useEffect(() => {
    const brinco = (editData?.brinco || '').trim()
    if (!modal || !brinco) { setBrincoDup(null); return }
    const t = setTimeout(async () => {
      const { data } = await db.animais.byBrinco(brinco)
      setBrincoDup(data && data.id !== editData.id ? data : null)
    }, 400)
    return () => clearTimeout(t)
  }, [modal, editData?.brinco, editData?.id])

  // Carrega timeline e notas quando muda o animal selecionado
  useEffect(() => {
    if (!selected) { setTimeline([]); setNotas(''); setReprodutivoBruto({ partos: [], inseminacoes: [], abortos: [] }); setPartoComoFilho(null); return }
    setNotas(selected.observacoes || '')
    loadTimeline(selected)
  }, [selected?.id])

  // Carrega histórico sanitário quando muda o animal selecionado — Fase 7:
  // agendamento (status='agendado') não aparece aqui, só depois de concluído.
  useEffect(() => {
    if (!selected?.id) { setHistSanidade([]); return }
    db.sanidadeAnimais.listPorAnimal(selected.id).then(({ data }) =>
      setHistSanidade((data || []).filter(h => sanidadeRealizada(h.procedimento)))
    )
  }, [selected?.id])

  // Feiras e premiações do animal selecionado — mesmo padrão do histórico
  // sanitário acima.
  useEffect(() => {
    if (!selected?.id) { setHistFeiras([]); return }
    db.feiraParticipacoes.listPorAnimal(selected.id).then(({ data }) => setHistFeiras(data || []))
  }, [selected?.id])

  // Histórico reprodutivo do touro — só dispara pra sexo=M + is_touro (nunca
  // pra fêmea, nunca pra macho comum). `cancelado` evita sobrescrever com uma
  // resposta antiga se o usuário trocar de touro rápido (mesma guarda de
  // corrida simples já usada noutras telas do app). Vínculo por ID
  // (pai_animal_id/touro_animal_id — migration_touro_vinculo_id.sql) é a
  // fonte PRINCIPAL; o texto legado (dado de antes da migração, nunca
  // migrado — decisão do usuário) entra numa busca separada, pra o card
  // mostrar os dois grupos apartados (calcHistoricoTouro, helpers.js).
  useEffect(() => {
    if (!(selected?.id && selected.sexo === 'M' && selected.is_touro)) { setHistoricoTouroBruto(null); return }
    let cancelado = false
    setHistoricoTouroLoading(true)
    const touroId = selected.id
    const brinco = selected.brinco
    ;(async () => {
      const [rf, rfLegado, rl, rlLegado] = await Promise.all([
        db.animais.filhosPorPaiAnimalId(touroId),
        db.animais.filhosPorPaiTextoLegado(brinco),
        db.lotesInseminacao.porTouroAnimalId(touroId),
        db.lotesInseminacao.porTouroTextoLegado(brinco),
      ])
      if (cancelado) return
      const filhos = rf.data || []
      const filhosLegado = rfLegado.data || []
      const filhoIds = [...filhos, ...filhosLegado].map(f => f.id)
      const rp = await db.pesagens.listPorAnimais(filhoIds)
      if (cancelado) return
      const lotesTodos = rl.data || []
      const lotesAtribuiveis = lotesTodos.filter(l => !(l.lote_touros?.length > 0))
      const lotesExcluidos   = lotesTodos.filter(l => l.lote_touros?.length > 0)
      const lotesLegado = (rlLegado.data || []).filter(l => !(l.lote_touros?.length > 0))
      const cicloIds = [...new Set(lotesAtribuiveis.map(l => l.ciclo_id).filter(Boolean))]
      const rc = await db.partos.porCiclos(cicloIds)
      if (cancelado) return
      setHistoricoTouroBruto({
        filhos, filhosLegado, pesagensFilhos: rp.data || [],
        lotesAtribuiveis, lotesLegado, lotesExcluidos,
        partosContemporaneos: rc.data || [],
      })
      setHistoricoTouroLoading(false)
    })()
    return () => { cancelado = true }
  }, [selected?.id, selected?.sexo, selected?.is_touro])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const results = await Promise.all([
        db.animais.list(),
        db.proprietarios.list(),
        db.lotes.list(),
        db.partos.listAll(),
        db.ciclos.list(),
        db.tourosExternos.listPorFazenda(),
      ])
      if (algumErro('[Animais]', results)) { setLoadError(true); return }
      const [ra, rp, rl, rpt, rc, rte] = results
      setAnimais(ra.data || [])
      setProps(rp.data   || [])
      setLotes(rl.data   || [])
      setPartosTodos(rpt.data || [])
      setCiclos(rc.data || [])
      setTourosExternos(rte.data || [])
    } catch (e) {
      console.error('[Animais] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const loadTimeline = async (animal) => {
    setTimelineLoading(true)
    setTimeline([])

    // Contemporâneos (Fase 13, 2ª rodada) — mesma fazenda (já é o escopo do
    // estado `animais`), mesmo sexo, nascidos numa janela de ±3 meses da data
    // de nascimento DESTE animal. Não depende de query nenhuma (`animais` já
    // está em memória), então já entra pedindo as pesagens deles junto com o
    // resto — só busca se der pra formar um grupo de 3+ (senão a média não
    // significa nada e a linha de comparação nem é desenhada).
    let contemporaneosIds = []
    if (animal.data_nascimento) {
      const d = new Date(animal.data_nascimento + 'T12:00:00')
      const ini = new Date(d); ini.setMonth(ini.getMonth() - 3)
      const fim = new Date(d); fim.setMonth(fim.getMonth() + 3)
      const iniISO = ini.toISOString().slice(0, 10), fimISO = fim.toISOString().slice(0, 10)
      contemporaneosIds = animais
        .filter(x => x.id !== animal.id && x.sexo === animal.sexo && x.data_nascimento && x.data_nascimento >= iniISO && x.data_nascimento <= fimISO)
        .map(x => x.id)
    }
    setNContemporaneos(contemporaneosIds.length)

    const [rPes, rIns, rPartosMae, rPartoBezerro, rAbortos, rPesContemp, rFeiras] = await Promise.all([
      db.pesagens.list(animal.id),
      db.inseminacoes.byAnimal(animal.id),
      db.partos.byMae(animal.id),
      db.partos.byBezerro(animal.id),
      db.abortos.byAnimal(animal.id),
      contemporaneosIds.length >= 3 ? db.pesagens.listPorAnimais(contemporaneosIds) : Promise.resolve({ data: [], error: null }),
      db.feiraParticipacoes.listPorAnimal(animal.id),
    ])

    if (rPes.error)         console.error('[Timeline] Erro pesagens:', rPes.error)
    if (rIns.error)         console.error('[Timeline] Erro inseminacoes:', rIns.error)
    if (rPartosMae.error)   console.error('[Timeline] Erro partos (como mãe):', rPartosMae.error)
    if (rPartoBezerro.error) console.error('[Timeline] Erro parto (como bezerro):', rPartoBezerro.error)
    if (rAbortos.error)     console.error('[Timeline] Erro abortos:', rAbortos.error)
    if (rPesContemp.error)  console.error('[Timeline] Erro pesagens contemporâneos:', rPesContemp.error)
    if (rFeiras.error)      console.error('[Timeline] Erro feiras:', rFeiras.error)

    // Guardado em bruto (não achatado em eventos) pro card "Histórico
    // reprodutivo" calcular o status por ciclo (statusReprodutivoCiclo).
    setReprodutivoBruto({
      partos:        rPartosMae.data || [],
      inseminacoes:  rIns.data       || [],
      abortos:       rAbortos.data   || [],
    })
    setPartoComoFilho(rPartoBezerro.data || null)
    setPesagensAnimal(rPes.data || [])
    setPesagensContemporaneos(rPesContemp.data || [])

    const eventos = []

    // Nascimento
    if (animal.data_nascimento) {
      eventos.push({
        data:     animal.data_nascimento,
        icon:     TL_ICONS.nascimento,
        titulo:   'Nascimento',
        descricao: `${animal.raca || ''}${animal.pelagem ? ' · ' + animal.pelagem : ''} · ${animal.sexo === 'F' ? 'Fêmea ♀' : 'Macho ♂'}`
      })
    }

    // Este animal é bezerro de algum parto registrado
    if (rPartoBezerro.data) {
      const p = rPartoBezerro.data
      eventos.push({
        data:     p.data_parto,
        icon:     TL_ICONS.parto_bezerro,
        titulo:   'Parto registrado',
        descricao: `Mãe: brinco ${p.mae?.brinco || '?'}`,
        semLote:  !p.lote_inseminacao_id,
      })
    }

    // Pesagens
    for (const p of (rPes.data || [])) {
      eventos.push({
        data:     p.data,
        icon:     TL_ICONS.pesagem,
        titulo:   `Pesagem: ${parseFloat(p.peso_kg).toFixed(1)} kg`,
        descricao: p.tipo || ''
      })
    }

    // Inseminações e diagnósticos
    for (const ins of (rIns.data || [])) {
      const dataIns = ins.lote?.data
      if (dataIns) {
        eventos.push({
          data:     dataIns,
          icon:     TL_ICONS.inseminacao,
          titulo:   `Inseminação — Lote ${ins.lote.numero}`,
          descricao: `Touro: ${nomeTouro(ins.lote) || '?'}`
        })
      }
      if (ins.diagnostico && ins.data_diagnostico) {
        const prenha = ins.diagnostico === 'P'
        eventos.push({
          data:     ins.data_diagnostico,
          icon:     prenha ? TL_ICONS.dg_prenha : TL_ICONS.dg_vazia,
          titulo:   `Diagnóstico: ${prenha ? 'Prenha' : 'Vazia'}`,
          descricao: `Lote ${ins.lote?.numero || '?'} — ${ins.lote ? nomeTouro(ins.lote) : '?'}`
        })
      }
    }

    // Partos como mãe — Fase 12: sinaliza quando o parto não tem lote de
    // inseminação vinculado (fora dos índices da safra — parição, mortalidade,
    // GMD Terneiros etc. — sem que ninguém percebesse antes disso existir).
    for (const p of (rPartosMae.data || [])) {
      const descBezerro = p.bezerro?.brinco
        ? `Bezerro: brinco ${p.bezerro.brinco} · ${p.bezerro.sexo === 'M' ? 'Macho ♂' : 'Fêmea ♀'}`
        : 'Bezerro não identificado'
      eventos.push({
        data:     p.data_parto,
        icon:     TL_ICONS.parto_mae,
        titulo:   'Parto',
        descricao: descBezerro,
        semLote:  !p.lote_inseminacao_id,
      })
    }

    // Abortos
    const CAUSA_LABEL = { infeccioso:'Infeccioso', nutricional:'Nutricional', traumatico:'Traumático', desconhecido:'Desconhecido', outro:'Outro' }
    for (const ab of (rAbortos.data || [])) {
      eventos.push({
        data:     ab.data,
        icon:     TL_ICONS.aborto,
        titulo:   'Aborto',
        descricao: `Causa: ${CAUSA_LABEL[ab.causa] || ab.causa || '—'}${ab.lote ? ` · Lote ${ab.lote.numero} — ${nomeTouro(ab.lote)}` : ''}`
      })
    }

    // Feiras — só participações cuja feira já começou (data_inicio <= hoje);
    // agendamento puramente futuro fica só no Calendário, não na timeline
    // (que é histórico, não agenda — mesmo raciocínio de sanidade agendada
    // não entrar aqui).
    const hojeStr = hojeISO()
    for (const p of (rFeiras.data || [])) {
      if (!p.edicao?.data_inicio || p.edicao.data_inicio > hojeStr) continue
      eventos.push({
        data:     p.edicao.data_inicio,
        icon:     '🏆',
        titulo:   `Participação em feira: ${p.edicao.feira?.nome || '—'}${p.edicao.ano ? ` (${p.edicao.ano})` : ''}`,
        descricao: [p.categoria_julgamento, [p.colocacao, p.titulo].filter(Boolean).join(' — ') || null].filter(Boolean).join(' · ') || undefined,
      })
    }

    // Ordenar do mais recente para o mais antigo
    eventos.sort((a, b) => (b.data || '').localeCompare(a.data || ''))

    setTimeline(eventos)
    setTimelineLoading(false)
  }

  // Confirma perda gestacional presumida (Fase 10) — único ponto de escrita,
  // só alcançável pelo clique em "Confirmar" do <Confirm> abaixo (ver
  // lib/perdaGestacionalPresumida.js pro porquê disso nunca ser automático).
  // Patcha `selected`/`animais` localmente com sit_reprodutiva + observacoes
  // (retornado já concatenado por confirmarPerdaPresumida) em vez de
  // recarregar a timeline inteira — mais rápido e evita uma re-busca à toa.
  const confirmarPerda = async () => {
    const alvo = confirmPerdaAlvo
    if (!alvo) return
    setConfirmandoPerda(true)
    const { error, observacoesFinal } = await confirmarPerdaPresumida({
      animalId: alvo.animalId, dataMonta: alvo.dataMonta, dataPrevistaParto: alvo.dataPrevistaParto,
      observacoesAtuais: alvo.observacoesAtuais,
    })
    setConfirmandoPerda(false)
    setConfirmPerdaAlvo(null)
    if (error) { toast('Erro ao confirmar perda gestacional presumida: ' + error, 'error'); return }
    toast(`${alvo.brinco} marcada como vazia — perda gestacional presumida confirmada.`)
    setSelected(prev => prev?.id === alvo.animalId ? { ...prev, sit_reprodutiva: 'vazia', observacoes: observacoesFinal } : prev)
    setAnimais(prev => prev.map(a => a.id === alvo.animalId ? { ...a, sit_reprodutiva: 'vazia', observacoes: observacoesFinal } : a))
    setNotas(observacoesFinal)
  }

  const salvarNotas = async () => {
    if (!podeEditarAnimais) return
    setSavingNotas(true)
    const notasCap = capitalizarPrimeira(notas)
    const { error } = await db.animais.update(selected.id, { observacoes: notasCap })
    setSavingNotas(false)
    if (error) { toast('Erro ao salvar anotação.', 'error'); return }
    toast('Anotação salva!')
    setSelected(prev => ({ ...prev, observacoes: notasCap }))
  }

  // Motivos que impedem a exclusão definitiva de um animal (histórico vinculado)
  // Retorna { motivos, erro } — se alguma query falhar (erro:true), o chamador
  // deve BLOQUEAR a exclusão, nunca tratar como "sem vínculos" e deixar passar.
  const temVinculos = async (animalId) => {
    const results = await Promise.all([
      db.pesagens.countByAnimal(animalId),
      db.inseminacoes.byAnimal(animalId),
      db.partos.byMae(animalId),
      db.partos.byBezerro(animalId),
    ])
    if (algumErro('[Animais] temVinculos', results)) return { motivos: [], erro: true }
    const [pes, insem, comoMae, comoBezerro] = results
    const motivos = []
    if ((pes?.count || 0) > 0)            motivos.push('pesagens')
    if ((insem?.data?.length || 0) > 0)   motivos.push('inseminações')
    if ((comoMae?.data?.length || 0) > 0) motivos.push('partos como mãe')
    if (comoBezerro?.data)                motivos.push('nascimento registrado')
    return { motivos, erro: false }
  }

  const excluirAnimal = async (animal) => {
    if (!podeEditarAnimais) return
    const { motivos, erro } = await temVinculos(animal.id)
    if (erro) { toast('Não foi possível verificar o histórico do animal. Tente novamente.', 'error'); return }
    if (motivos.length > 0) {
      toast(`Não é possível excluir: o animal tem histórico (${motivos.join(', ')}). Use "vender" ou "marcar como morto" para dar baixa.`, 'error')
      return
    }
    setConfirmExcluirAnimal(animal)
  }

  const executarExcluirAnimal = async () => {
    const animal = confirmExcluirAnimal
    setConfirmExcluirAnimal(null)
    if (!animal) return
    const { error } = await db.animais.delete(animal.id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Animal excluído.')
    setSelected(null)
    loadAll()
  }

  const toggleSelecionado = (id) => {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleSelecionarTodos = () => {
    const todosMarcados = filtered.length > 0 && filtered.every(a => selecionados.includes(a.id))
    setSelecionados(todosMarcados ? [] : filtered.map(a => a.id))
  }

  const excluirSelecionados = () => {
    if (!podeEditarAnimais) return
    if (selecionados.length === 0) return
    setConfirmExcluirSelecionados(true)
  }

  const executarExcluirSelecionados = async () => {
    setConfirmExcluirSelecionados(false)
    setExcluindoLote(true)
    const animaisSel = animais.filter(a => selecionados.includes(a.id))
    const resultados  = await Promise.all(animaisSel.map(async a => ({ a, ...(await temVinculos(a.id)) })))
    const comErro     = resultados.filter(r => r.erro).map(r => r.a.brinco)
    const bloqueados  = resultados.filter(r => !r.erro && r.motivos.length > 0).map(r => r.a.brinco)
    const liberados   = resultados.filter(r => !r.erro && r.motivos.length === 0).map(r => r.a)
    if (liberados.length > 0) {
      await Promise.all(liberados.map(a => db.animais.delete(a.id)))
    }
    setExcluindoLote(false)
    setSelecionados([])
    const partes = []
    if (liberados.length  > 0) partes.push(`${liberados.length} animais excluídos`)
    if (bloqueados.length > 0) partes.push(`${bloqueados.length} não puderam ser excluídos por terem histórico: ${bloqueados.join(', ')}`)
    if (comErro.length    > 0) partes.push(`${comErro.length} não puderam ser verificados (erro ao consultar histórico): ${comErro.join(', ')}`)
    toast(partes.join('. ') || 'Nenhum animal excluído.', (bloqueados.length > 0 || comErro.length > 0) && liberados.length === 0 ? 'error' : 'success')
    loadAll()
  }

  // Filtros
  const filtered = sortBrinco(animais.filter(a => {
    if (filtSit  && a.situacao         !== filtSit)  return false
    if (filtProp && a.proprietario_id  !== filtProp) return false
    if (filtSexo && a.sexo             !== filtSexo) return false
    if (filtCategoria && calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) !== filtCategoria) return false
    if (filtRep      && a.sit_reprodutiva !== filtRep)  return false
    if (filtLote     && a.lote_id         !== filtLote) return false
    if (search   && !a.brinco.toLowerCase().includes(search.toLowerCase()) &&
        !calcCategoria(a.data_nascimento, a.sexo, undefined, a.is_touro).toLowerCase().includes(search.toLowerCase())) return false
    return true
  }))

  const ativos   = animais.filter(a => a.situacao === 'ativo').length
  const inativos = animais.length - ativos

  // Opções distintas para os novos filtros
  const categoriasDisponiveis = [...new Set(
    animais.map(a => calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro))
  )].sort()
  const repsDisponiveis = [...new Set(animais.map(a => a.sit_reprodutiva).filter(Boolean))]

  // Ordenação (tabela desktop apenas — os cards mobile continuam na ordem de sortBrinco)
  const compararCampo = (a, b, campo) => {
    switch (campo) {
      case 'categoria':
        return calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
          .localeCompare(calcCategoriaRebanho(b.data_nascimento, b.sexo, b.sit_reprodutiva, b.is_touro))
      case 'proprietario':
        return (a.proprietario?.nome || '').localeCompare(b.proprietario?.nome || '')
      case 'rep':
        return (a.sit_reprodutiva || '').localeCompare(b.sit_reprodutiva || '')
      case 'situacao':
        return (a.situacao || '').localeCompare(b.situacao || '')
      case 'lote':
        return (a.lote?.nome || '').localeCompare(b.lote?.nome || '')
      case 'idade':
        return (a.data_nascimento || '').localeCompare(b.data_nascimento || '')
      case 'brinco':
      default:
        return a.brinco.localeCompare(b.brinco, undefined, { numeric: true })
    }
  }

  const ordenarPor = (campo) => {
    setOrdenacao(prev => prev.campo === campo ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' })
  }

  const filteredOrdenados = [...filtered].sort((a, b) => {
    const cmp = compararCampo(a, b, ordenacao.campo)
    return ordenacao.dir === 'asc' ? cmp : -cmp
  })

  const IndicadorOrdenacao = ({ campo }) => (
    ordenacao.campo === campo ? <span style={{ marginLeft: 3 }}>{ordenacao.dir === 'asc' ? '▲' : '▼'}</span> : null
  )

  const openNew = () => {
    setEditData({
      brinco:'', sexo:'F', data_nascimento:'', raca:'Angus', pelagem:'Preto',
      pai:'', mae_brinco:'', proprietario_id:'', lote_id:'',
      situacao:'ativo', sit_reprodutiva:'vazia', is_touro: false,
      numero_registro:'', classificacao:'', sisbov:'', nome:'',
    })
    setModal(true)
  }

  const openEdit = (a) => {
    setEditData({ ...a })
    setModal(true)
  }

  const limparVazios = (obj) => {
    const camposNullable = ['data_baixa', 'mae_id', 'lote_id', 'numero_registro', 'classificacao', 'sisbov', 'nome']
    const out = { ...obj }
    for (const c of camposNullable) if (out[c] === '') out[c] = null
    return out
  }

  // Aviso pós-rename de brinco (decisão: avisar, nunca propagar — ver
  // avisoBrincoRef acima). animais.mae_brinco é o ÚNICO campo do sistema que
  // guarda BRINCO como texto de referência — `pai`/lotes_inseminacao.touro/
  // lote_touros.nome guardam o NOME do touro, não o brinco (placeholder
  // "Nome do touro", ver Field abaixo), então um rename de brinco não os
  // afeta; já quando o vínculo é por id (pai_animal_id/touro_animal_id), a
  // exibição deriva do embed ao vivo (nomePai/nomeTouro, helpers.js) e nunca
  // fica desatualizada. Só entra aqui quem tem mae_brinco batendo com o
  // brinco ANTIGO e SEM mae_id — exatamente o caso em que não há id nenhum
  // pra derivar (digitado à mão em Animais.jsx, ou importação de planilha).
  const verificarReferenciasDesatualizadas = (brincoAntigo, animalId) => {
    const filhosSoTexto = animais.filter(x => x.id !== animalId && x.mae_brinco === brincoAntigo && !x.mae_id)
    if (filhosSoTexto.length > 0) setAvisoBrincoRef({ brincoAntigo, filhos: filhosSoTexto })
  }

  // Item 5 — touros cadastrados (sexo=M + is_touro), mesma lista `animais` já
  // carregada, mesmo filtro de tourosCadastrados em Reprodutivo.jsx, sem
  // query nova. Exclui o próprio animal em edição (não pode ser pai de si
  // mesmo).
  const tourosCadastrados = animais
    .filter(a => a.sexo === 'M' && a.is_touro && a.id !== editData?.id)
    .sort((a, b) => a.brinco.localeCompare(b.brinco, undefined, { numeric: true }))

  // Candidatas a mãe — fêmeas, excluindo o próprio animal em edição. Sem
  // tabela externa equivalente a touros_externos: mãe só pode ser um animal
  // já cadastrado no sistema, então a resolução é busca direta por brinco,
  // nunca find-or-create.
  const maesCandidatas = animais
    .filter(a => a.sexo === 'F' && a.id !== editData?.id)
    .sort((a, b) => a.brinco.localeCompare(b.brinco, undefined, { numeric: true }))

  // Resolve o vínculo por id do PAI a partir do texto digitado — mesmo
  // mecanismo de resolverVinculoTouro em Reprodutivo.jsx (não a mesma
  // função, porque tourosCadastrados/tourosExternos vêm de estados
  // diferentes nesta tela, mas a MESMA lógica: cadastro/externo_exato usam o
  // id que ResolucaoTouro já mostrou na tela, sem round-trip; só 'novo'
  // precisa de rede). Monta natural indefinida nunca tenta resolver.
  const resolverVinculoPai = async (nome) => {
    if (!nome || paiEhMontaNaturalIndefinida(nome)) return { pai_animal_id: null, pai_externo_id: null }
    const r = resolverTouroDigitado(nome, tourosCadastrados, tourosExternos)
    if (r?.tipo === 'cadastro') return { pai_animal_id: r.touro.id, pai_externo_id: null }
    if (r?.tipo === 'externo_exato') return { pai_animal_id: null, pai_externo_id: r.touro.id }
    const { data, error } = await db.tourosExternos.findOrCreate(nome)
    if (error) return { pai_animal_id: null, pai_externo_id: null, erro: error }
    return { pai_animal_id: null, pai_externo_id: data?.id || null }
  }

  // Resolve mae_id a partir do brinco digitado — sempre recalculado do texto
  // atual (nunca confia no mae_id antigo de editData: se o usuário mudou o
  // texto, o id tem que acompanhar, senão é o mesmo bug do brinco que não
  // propaga, só que ao contrário).
  const resolverMaeId = (brinco) => {
    if (!brinco) return null
    const m = maesCandidatas.find(a => a.brinco?.toUpperCase() === brinco.trim().toUpperCase())
    return m?.id || null
  }

  const salvar = async () => {
    if (!podeEditarAnimais) return
    if (brincoDup) { toast('Brinco já usado por outro animal — escolha outro.', 'error'); return }
    // editData vem de openEdit ({ ...a }, a linha carregada por db.animais.list
    // — que embute proprietario/lote/pai_animal/pai_externo, ver supabase.js).
    // Descartar essas chaves ANTES de validar/enviar (apenasColunasReais,
    // única fonte de "isso é coluna de verdade?", mesma ideia da restauração
    // de backup) — nunca mais um delete por embed aqui: o dia em que um
    // embed novo entrar no select, ele já sai filtrado sozinho.
    let payload = await apenasColunasReais('animais', editData)
    payload = limparVazios(payload)
    payload.raca    = capitalizarNome(payload.raca)
    payload.pelagem = capitalizarNome(payload.pelagem)
    payload.nome    = capitalizarNome(payload.nome)
    payload.pai     = paiEhMontaNaturalIndefinida(payload.pai) ? payload.pai : capitalizarNome(payload.pai)
    // Item 5 — resolve os vínculos por id a partir do texto atual (Pai/Mãe),
    // sempre recalculado, nunca herdado de editData: cadastro/externo_exato
    // usam o id que a tela já mostrou (ResolucaoTouro/resolução da mãe), sem
    // round-trip; só um pai NOVO precisa de rede (find-or-create).
    const vinculoPai = await resolverVinculoPai(payload.pai)
    if (vinculoPai.erro) { toast(`Erro ao vincular o pai "${payload.pai}": ${vinculoPai.erro.message}`, 'error'); return }
    payload.pai_animal_id  = vinculoPai.pai_animal_id
    payload.pai_externo_id = vinculoPai.pai_externo_id
    payload.mae_id = resolverMaeId(payload.mae_brinco)
    if (!payload.brinco)          { toast('Preencha o brinco.', 'error'); return }
    if (!payload.sexo)            { toast('Selecione o sexo.', 'error'); return }
    if (!payload.proprietario_id) { toast('Selecione o proprietário.', 'error'); return }
    if (!payload.data_nascimento) { toast('Preencha a data de nascimento.', 'error'); return }
    if (!dataNaoFutura(payload.data_nascimento)) { toast('Data de nascimento não pode ser futura.', 'error'); return }
    // SISBOV brasileiro tem 15 dígitos — avisa mas nunca bloqueia (formatos
    // antigos/incompletos podem existir).
    if (payload.sisbov && payload.sisbov.length !== 15) {
      toast(`SISBOV com ${payload.sisbov.length} dígito${payload.sisbov.length!==1?'s':''} — o padrão brasileiro tem 15. Salvando mesmo assim.`, 'warning')
    }
    // Brinco antigo (antes do update), pra checar depois quem referenciava
    // ele só por texto — captura ANTES do save, com o valor ainda carregado
    // em `animais` (a lista só reflete o novo brinco depois do loadAll()).
    const brincoAntigo = editData.id ? animais.find(x => x.id === editData.id)?.brinco : null
    setSaving(true)
    const { data: animalSalvo, error } = editData.id
      ? await db.animais.update(editData.id, payload)
      : await db.animais.insert(payload)
    setSaving(false)
    if (error) {
      // Corrida rara (debounce ainda não tinha rodado, ou duas abas salvando
      // o mesmo brinco quase ao mesmo tempo) — a constraint real do banco é
      // animais_fazenda_id_brinco_key (UNIQUE por fazenda_id+brinco,
      // confirmado ao vivo), não por conta inteira. Traduz o erro cru do
      // Postgres pra mensagem amigável em vez de expor o código 23505.
      const duplicado = error.code === '23505' && /brinco/i.test(error.message || '')
      toast(duplicado ? 'Já existe um animal com esse brinco nesta fazenda — escolha outro.' : 'Erro ao salvar: ' + error.message, 'error')
      return
    }
    toast(editData.id ? 'Animal atualizado!' : 'Animal cadastrado!')
    setModal(false)
    if (editData.id && animalSalvo) setSelected(animalSalvo)
    if (brincoAntigo && brincoAntigo !== payload.brinco) verificarReferenciasDesatualizadas(brincoAntigo, editData.id)
    loadAll()
  }

  const handleVoz = (text) => {
    const t = text.toLowerCase()
    const nums = t.match(/\d+/g)
    if (nums?.[0]) setEditData(p => ({ ...p, brinco: nums[0].padStart(2, '0') }))
    if (/macho|touro/i.test(t)) setEditData(p => ({ ...p, sexo: 'M', sit_reprodutiva: 'nao_se_aplica' }))
    if (/fêmea|vaca|novilha/i.test(t)) setEditData(p => ({ ...p, sexo: 'F' }))
    if (/prenha|grávida/i.test(t)) setEditData(p => ({ ...p, sit_reprodutiva: 'prenha' }))
    if (/vazia/i.test(t)) setEditData(p => ({ ...p, sit_reprodutiva: 'vazia' }))
  }

  const onEscolherArquivo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const linhas = await lerPlanilhaAnimais(file)
      // tourosCadastrados/tourosExternos já carregados no estado da tela
      // (Item 5) — resolve "pai" contra quem já existe, sem rede extra.
      const { validos, erros, paiResolvidos, paiTexto } = validarLinhas(linhas, props, lotes, tourosCadastrados, tourosExternos)
      setPreviewImport({ validos, erros, paiResolvidos, paiTexto })
      setModalImport(true)
    } catch (err) {
      toast('Erro ao ler a planilha: ' + err.message, 'error')
    }
    e.target.value = '' // permite reimportar o mesmo arquivo
  }

  const confirmarImportacao = async () => {
    if (!podeEditarAnimais) return
    if (!previewImport?.validos?.length) return
    setImportando(true)
    let ok = 0, falhas = 0
    const inseridos = []
    for (const payload of previewImport.validos) {
      const { data, error } = await db.animais.insert(payload)
      if (error) { falhas++ } else { ok++; inseridos.push(data) }
    }
    // Segunda passada — mae_brinco -> mae_id, agora que TODAS as linhas deste
    // arquivo já existem no banco (mesmo princípio das camadas de
    // lancamentos_financeiros na restauração de backup: insere tudo primeiro,
    // resolve depois quem dependia de uma linha irmã do mesmo lote). Mapa
    // combina quem já existia antes da importação com quem acabou de entrar.
    const brincoParaId = new Map()
    animais.forEach(a => { if (a.brinco) brincoParaId.set(a.brinco.toUpperCase(), a.id) })
    inseridos.forEach(a => { if (a.brinco) brincoParaId.set(a.brinco.toUpperCase(), a.id) })
    let maeResolvidos = 0, maeTexto = 0
    for (const a of inseridos) {
      if (!a.mae_brinco) continue
      const maeId = brincoParaId.get(a.mae_brinco.toUpperCase())
      if (maeId && maeId !== a.id) {
        const { error } = await db.animais.update(a.id, { mae_id: maeId })
        if (!error) { maeResolvidos++; continue }
      }
      maeTexto++
    }
    setImportando(false)
    setModalImport(false)
    setPreviewImport(null)
    // Silêncio aqui é o que gera dado incompleto que ninguém percebe — sempre
    // informa quantos vínculos foram resolvidos por cadastro e quantos
    // ficaram só como texto (sem correspondência encontrada).
    const partes = [`${ok} animais cadastrados`]
    if (falhas) partes.push(`${falhas} falharam`)
    const vinculos = []
    if (previewImport.paiResolvidos || previewImport.paiTexto) {
      vinculos.push(`pai: ${previewImport.paiResolvidos} por cadastro, ${previewImport.paiTexto} só texto`)
    }
    if (maeResolvidos || maeTexto) {
      vinculos.push(`mãe: ${maeResolvidos} por cadastro, ${maeTexto} só texto`)
    }
    toast(`Importação concluída: ${partes.join(', ')}.` + (vinculos.length ? ` Vínculos — ${vinculos.join('; ')}.` : ''))
    loadAll()
  }

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  // ── Detalhe do animal ─────────────────────────────────────────────
  const detalhe = selected ? (() => {
    const a   = selected
    const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
    const cc  = catCor[cat]             || catCor.Vaca
    const sc  = sitCor[a.situacao]      || sitCor.ativo
    // Exibição: "Com cria ao pé" em cima de 'vazia' quando o último parto ainda
    // não foi desmamado — só visual, calcCategoriaRebanho/filtros continuam
    // usando a.sit_reprodutiva real (statusExib nunca é gravado no banco).
    const statusExib = statusReprodutivoExibicao(a, partosTodos)
    const rc  = repCor[statusExib] || repCor.nao_se_aplica
    // Bloco E — vaca vendida ainda prenha: rótulo com a data da venda no
    // lugar de "Prenha" pura, cor própria (roxa, mesma de STATUS_CICLO_ANIMAL.
    // vendida_prenha) — só no texto exibido, statusExib/rc continuam intactos
    // pra quem mais os usa (repCor é indexado pelo valor cru).
    const vendidaLabel = statusReprodutivoVendida(a)
    const rcExib = vendidaLabel ? { bg: '#F3E8FF', text: '#5B2A9E' } : rc
    const filhos = animais.filter(x => x.mae_brinco === a.brinco)

    // Desempenho reprodutivo NA VIDA (Fase 13) — só pra fêmeas com algum
    // histórico reprodutivo já registrado (parto, inseminação ou aborto).
    const temHistoricoReprodutivo = a.sexo === 'F' && (
      (reprodutivoBruto.partos?.length > 0) ||
      (reprodutivoBruto.inseminacoes?.length > 0) ||
      (reprodutivoBruto.abortos?.length > 0)
    )
    const desempenhoVida = temHistoricoReprodutivo ? calcDesempenhoVidaFemea(a, reprodutivoBruto) : null

    // Perda gestacional presumida (Fase 10) — mesmo helper do detalhe do
    // lote (statusReprodutivoDetalhado), mas aqui sem o escopo automático de
    // "partos de um lote só": acha a monta que gerou a prenhez ATUAL (a
    // inseminação com diagnóstico Prenha mais recente) e filtra
    // reprodutivoBruto.partos pra não confundir uma gestação anterior já
    // resolvida com o ciclo atual — ver aviso no helper (helpers.js).
    const insPrenhaAtual = a.sit_reprodutiva === 'prenha'
      ? [...(reprodutivoBruto.inseminacoes || [])]
          .filter(i => i.diagnostico === 'P' && i.lote?.data)
          .sort((x, y) => (y.lote.data || '').localeCompare(x.lote.data || ''))[0]
      : null
    const dataMontaAtual = insPrenhaAtual?.lote?.data || null
    const partosDestaGestacao = dataMontaAtual
      ? (reprodutivoBruto.partos || []).filter(p => p.data_parto >= dataMontaAtual)
      : []
    const perdaDetalhe = dataMontaAtual
      ? statusReprodutivoDetalhado({ id: a.id, sit_reprodutiva: a.sit_reprodutiva, situacao: a.situacao, data_baixa: a.data_baixa }, partosDestaGestacao, dataMontaAtual)
      : null

    // Item 5 — "Falhada": desfecho consolidado (desfechoReprodutivo,
    // helpers.js — MESMA função dos filtros de venda e da sequência do lote,
    // nunca duplicada) na ÚLTIMA estação em que ela foi exposta, com o
    // motivo (não emprenhou / aborto / perda gestacional). "Última" = a
    // estação do lote mais recente (por data) entre as inseminações dela que
    // têm estação vinculada (lote.estacao_monta_id, ver db.inseminacoes.
    // byAnimal) — inseminações de lotes sem estação (dado antigo) não entram
    // nesta conta. Puramente derivado; a marcação manual (botão "Marcar
    // Falhada") mora na sequência do lote, não aqui — ficha é só leitura.
    const insComEstacao = (reprodutivoBruto.inseminacoes || []).filter(i => i.lote?.estacao_monta_id)
    const ultimaEstacaoIdAnimal = [...insComEstacao]
      .sort((x, y) => (y.lote?.data || '').localeCompare(x.lote?.data || ''))[0]?.lote?.estacao_monta_id || null
    const desfechoUltimaEstacaoAnimal = ultimaEstacaoIdAnimal
      ? desfechoReprodutivo(a.id, {
          inseminacoes: insComEstacao.filter(i => i.lote.estacao_monta_id === ultimaEstacaoIdAnimal),
          partos:  (reprodutivoBruto.partos  || []).filter(p => p.lote?.estacao_monta_id === ultimaEstacaoIdAnimal),
          abortos: (reprodutivoBruto.abortos || []).filter(ab => ab.lote?.estacao_monta_id === ultimaEstacaoIdAnimal),
        }, undefined, null, a)
      : null
    const falhouUltimaEstacaoAnimal = desfechoUltimaEstacaoAnimal?.resultado === 'falhou' ? desfechoUltimaEstacaoAnimal : null

    // "Vaca falhada" — status reprodutivo por ciclo, 100% derivado na leitura
    // (statusReprodutivoCiclo, helpers.js) a partir dos eventos já carregados
    // pela timeline (reprodutivoBruto). Só ciclos já iniciados, do primeiro em
    // que ela era matriz em diante (mais recente primeiro) — não mostra ciclo
    // nenhum antes disso, nem ciclos futuros.
    const historicoCiclos = a.sexo === 'F'
      ? [...ciclos]
          .filter(c => c.inicio && c.inicio <= hojeISO())
          .sort((x, y) => (x.inicio || '').localeCompare(y.inicio || ''))
          .map(c => ({ ciclo: c, ...statusReprodutivoCiclo(a, c, reprodutivoBruto) }))
      : []
    const primeiraMatrizIdx = historicoCiclos.findIndex(h => h.status !== 'nao_era_matriz')
    const historicoCiclosVisiveis = primeiraMatrizIdx === -1 ? [] : [...historicoCiclos.slice(primeiraMatrizIdx)].reverse()

    // ── Linha do tempo produtiva (Fase 13, 2ª rodada) — 1 safra por coluna, do
    // mais antigo pro mais recente. Classificação em si (pariu/abortou/falhou/
    // não exposta/prenha) mora em classificarDesfechosPorSafra (helpers.js,
    // Fase 14) — reaproveitada também pelo Ranking de Matrizes, pra nunca
    // divergir entre os dois lugares. Aqui só monta o `rotulo` (texto do gráfico,
    // que precisa do peso exato — algo que a função compartilhada não devolve
    // pronto, já que ROTULOS_DESFECHO é só o texto genérico por categoria).
    const dadosProdutivos = classificarDesfechosPorSafra(a, ciclos, reprodutivoBruto)
      .map(d => ({
        ...d,
        rotulo: d.desfecho === 'pariu' ? `${d.peso} kg`
          : d.desfecho === 'pariu_aguardando' ? 'Aguard. desmame'
          : ROTULOS_DESFECHO[d.desfecho],
      }))

    // ── Desempenho dos filhos (Fase 13, 2ª rodada) — GMD de cada cria
    // (calcGMD, sem fórmula nova), na ordem cronológica dos partos. Só entram
    // filhos com GMD calculável (2+ pesagens) — os outros não têm o que mostrar.
    const dadosGMDFilhos = [...(reprodutivoBruto.partos || [])]
      .filter(p => p.data_parto)
      .sort((p1, p2) => p1.data_parto.localeCompare(p2.data_parto))
      .map(p => {
        const gmd = calcGMD(p.bezerro?.pesagens)
        if (gmd === null) return null
        const cicloDoParto = ciclos.find(c => c.inicio && c.fim && c.inicio <= p.data_parto && p.data_parto <= c.fim)
        return { safra: cicloDoParto?.nome || fmtData(p.data_parto), gmd: parseFloat(gmd), brinco: p.bezerro?.brinco || '?' }
      })
      .filter(Boolean)

    // "Pai" clicável só no único caso resolvível hoje: monta natural com
    // vários touros ("Monta natural — Lote N, Estação X", paternidade
    // indefinida) — leva pro detalhe do LOTE via parto.lote_inseminacao_id
    // (partoComoFilho, carregado junto com a timeline). Vínculo por id
    // (pai_animal_id/pai_externo_id) não muda esse comportamento — é sobre
    // exibir o NOME certo, não sobre navegação nova.
    // Texto sempre por nomePai (helpers.js) — "Nome (Brinco)" aqui, um dos 4
    // pontos genealógicos/documentais aprovados (Tarefa B.4): nome sozinho
    // pode ser ambíguo (animais.nome não tem UNIQUE), então o brinco
    // acompanha sempre que houver nome.
    const paiClicavel = paiEhMontaNaturalIndefinida(a.pai) && partoComoFilho?.lote_inseminacao_id
    const paiTexto = nomePai(a, { comBrinco: true })
    // Aviso de texto congelado (2026-08-12) — sem pai_animal_id/pai_externo_id,
    // esse nome nunca acompanha um rename futuro do touro cadastrado (ver
    // paiSemVinculo, helpers.js) — mesmo raciocínio já usado no aviso de
    // brinco sem vínculo.
    const paiAvisoSemVinculo = paiSemVinculo(a)
    const paiValor = paiClicavel
      ? <button type="button" onClick={() => navigate('/reprodutivo', {
            state: { abrirLoteId: partoComoFilho.lote_inseminacao_id, cicloId: partoComoFilho.lote?.ciclo_id }
          })}
          style={{ background:'none', border:'none', padding:0, color:'#2B6CD9', textDecoration:'underline', cursor:'pointer', fontSize:'.82rem', textAlign:'left' }}>
          {paiTexto} <i className="ti ti-external-link" style={{ fontSize:11 }} />
        </button>
      : paiAvisoSemVinculo
        ? <span title="Sem vínculo por id — texto congelado no momento do lançamento; um rename do touro cadastrado não atualiza este nome.">
            {paiTexto} <i className="ti ti-alert-circle" style={{ fontSize: 11, color: '#BA7517' }} />
          </span>
        : paiTexto

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>
            <i className="ti ti-arrow-left" /> Lista
          </button>
          {podeEditarAnimais && a.situacao === 'ativo' && (
            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>
              <i className="ti ti-edit" /> Editar
            </button>
          )}
          {podeEditarAnimais && (
            <button className="btn btn-sm" style={{ background: '#FEE2E2', color: '#DC2626', border: 'none' }}
              onClick={() => excluirAnimal(a)}>
              <i className="ti ti-trash" /> Excluir
            </button>
          )}
          {podeVerLotes && (
            <button className="btn btn-secondary btn-sm" onClick={irParaLotes} title={a.lote_id ? 'Ir para o lote deste animal' : 'Ir para a tela de Lotes'}>
              <i className="ti ti-layers" /> {a.lote_id ? 'Ver lote' : 'Ver Lotes'}
            </button>
          )}
          <BotaoPDF contentRef={detalheRef} filename={`animal-${a.brinco}`} titulo="Animais: Ficha do Animal" />
        </div>

        <div ref={detalheRef}>
          {/* Header card */}
          <div className="card" style={{
            borderLeft: `3px solid ${a.situacao === 'morto' ? '#E24B4A' : a.situacao === 'vendido' ? '#D97706' : '#2B6CD9'}`,
            marginBottom: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>Brinco {a.brinco}</span>
                  <Badge color={cc.bg === '#E8F0FC' ? 'green' : cc.bg === '#E6F1FB' ? 'blue' : cc.bg === '#EEEDFE' ? 'purple' : 'amber'}
                    style={{ background: cc.bg, color: cc.text }}>{cat}</Badge>
                  <Badge style={{ background: sc.bg, color: sc.text }}>{a.situacao}</Badge>
                  {a.sexo === 'F' && (
                    <Badge style={{ background: rcExib.bg, color: rcExib.text }}>{vendidaLabel || statusExib?.replace('_', ' ')}</Badge>
                  )}
                </div>
                <div style={{ fontSize: '.82rem', color: '#6B7280', marginTop: 5 }}>
                  {a.sexo === 'F' ? 'Fêmea ♀' : 'Macho ♂'} · {idadeFormatada(a.data_nascimento)} · {a.proprietario?.nome} · {a.raca}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* Coluna esquerda — Dados cadastrais (compacto, 2 colunas) +
                Linha do tempo logo abaixo, preenchendo o espaço que sobrava
                (a coluna direita é bem mais alta: histórico, cards de
                desempenho e os gráficos). */}
            <div>
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="card-title"><i className="ti ti-id" /> Dados cadastrais</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14 }}>
                  {[
                    ['Brinco',        a.brinco],
                    ['SISBOV',        a.sisbov || '—'],
                    ['Sexo',          a.sexo === 'F' ? 'Fêmea ♀' : 'Macho ♂'],
                    ['Nascimento',    `${fmtData(a.data_nascimento)} · ${idadeFormatada(a.data_nascimento)}`],
                    ['Categoria',     <Badge style={{ background: cc.bg, color: cc.text }}>{cat} <span style={{ fontSize: '.65rem', color: '#9CA3AF', marginLeft: 3 }}>automático</span></Badge>],
                    ['Nº Registro',   a.numero_registro || '—'],
                    ['Nome',          a.nome || '—'],
                    ['Classificação', a.classificacao ? (CLASSIFICACAO_LABEL[a.classificacao] || a.classificacao) : '—'],
                    ['Raça',          a.raca],
                    ['Pelagem',       a.pelagem],
                    ['Pai',           paiValor],
                    ['Mãe (brinco)',  a.mae_brinco || '—'],
                    ['Proprietário',  a.proprietario?.nome || '—'],
                    ['Lote',          a.lote?.nome || '—'],
                    ['Situação',      <Badge style={{ background: sc.bg, color: sc.text }}>{a.situacao}</Badge>],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', flexDirection: 'column', marginBottom: 8 }}>
                      <span style={{ fontSize: '.72rem', color: '#6B7280' }}>{l}</span>
                      <span style={{ fontSize: '.82rem' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <TimelineCard timeline={timeline} loading={timelineLoading} />

              {/* Histórico Sanitário — logo abaixo da Linha do tempo, mesma
                  largura (coluna esquerda), pra ocupar o espaço em vez de ir
                  pro fim da ficha em largura cheia. */}
              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-title"><i className="ti ti-vaccine" /> Histórico Sanitário</div>
                {histSanidade.length === 0
                  ? <div style={{ fontSize: '.82rem', color: '#9CA3AF' }}>Nenhum procedimento sanitário registrado para este animal.</div>
                  : histSanidade
                      .slice()
                      .sort((x, y) => (y.procedimento?.data || '').localeCompare(x.procedimento?.data || ''))
                      .map(h => (
                        <div key={h.id} style={{ padding: '8px 0', borderBottom: '.5px solid #F3F4F6' }}>
                          <div style={{ fontWeight: 500, fontSize: '.85rem' }}>{h.procedimento?.procedimento}</div>
                          <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                            {h.procedimento?.tipo} · {fmtData(h.procedimento?.data)}
                            {h.procedimento?.proximo && ` · próximo: ${fmtData(h.procedimento.proximo)}`}
                          </div>
                          {h.procedimento?.observacoes && <div style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{h.procedimento.observacoes}</div>}
                        </div>
                      ))
                }
              </div>

              {/* Feiras e Premiações — logo abaixo do Histórico Sanitário,
                  mesma largura (coluna esquerda). Contagem no topo
                  (participações/premiações) porque um histórico longo sem
                  resumo é difícil de ler de relance (Fase Feiras — item extra
                  aprovado). */}
              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-title"><i className="ti ti-trophy" /> Feiras e Premiações</div>
                {histFeiras.length === 0
                  ? <div style={{ fontSize: '.82rem', color: '#9CA3AF' }}>Nenhuma participação em feira registrada para este animal.</div>
                  : (() => {
                      const { participacoes: nPart, premiacoes: nPrem } = resumoFeirasAnimal(histFeiras)
                      return (
                        <>
                          <div style={{ fontSize: '.78rem', color: '#374151', marginBottom: 8, fontWeight: 500 }}>
                            {nPart} participaç{nPart === 1 ? 'ão' : 'ões'}, {nPrem} premiaç{nPrem === 1 ? 'ão' : 'ões'}
                          </div>
                          {histFeiras.map(p => {
                            const st = statusFeiraParticipacao(p, hojeISO())
                            return (
                              <div key={p.id} style={{ padding: '8px 0', borderBottom: '.5px solid #F3F4F6' }}>
                                <div style={{ fontWeight: 500, fontSize: '.85rem' }}>
                                  {p.edicao?.feira?.nome || '—'}{p.edicao?.ano ? ` — ${p.edicao.ano}` : ''}
                                </div>
                                <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                                  {p.edicao?.data_inicio ? fmtData(p.edicao.data_inicio) : '—'}
                                  {p.categoria_julgamento && ` · ${p.categoria_julgamento}`}
                                  {' · '}{st.label}
                                </div>
                                {(p.colocacao || p.titulo) && (
                                  <div style={{ fontSize: '.75rem', color: '#1F7A3F', fontWeight: 500 }}>
                                    {[p.colocacao, p.titulo].filter(Boolean).join(' — ')}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </>
                      )
                    })()
                }
              </div>
            </div>

            {/* Coluna direita */}
            <div>
              {a.sexo === 'F' && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title"><i className="ti ti-heart" style={{ color: '#E24B4A' }} /> Histórico reprodutivo</div>
                  <div className="row">
                    <span className="row-label">Situação atual</span>
                    <span className="row-value">
                      <Badge style={{ background: rcExib.bg, color: rcExib.text }}>{vendidaLabel || statusExib?.replace('_', ' ')}</Badge>
                    </span>
                  </div>

                  {/* Item 5 — "Falhada" (guarda-chuva) na última estação em que
                      foi exposta, com o motivo: mesmo desfecho consolidado da
                      sequência do lote e dos filtros de venda
                      (desfechoReprodutivo, helpers.js). Só leitura aqui — a
                      marcação manual mora na sequência do lote
                      (Reprodutivo.jsx), não na ficha. */}
                  {falhouUltimaEstacaoAnimal && (
                    <div className="row">
                      <span className="row-label">Última estação de monta</span>
                      <span className="row-value">
                        <Badge style={{ background: repCor.Falhada.bg, color: repCor.Falhada.text }}>
                          Falhada — {FALHA_MOTIVO_LABEL[falhouUltimaEstacaoAnimal.motivo]}
                        </Badge>
                      </span>
                    </div>
                  )}

                  {perdaDetalhe?.perdaPresumida && (
                    // Sinal FORTE (estágio 2 da escala — ver PERDA_PRESUMIDA_DIAS_APOS_PREVISTO,
                    // helpers.js). Puramente derivado até o clique em "Confirmar perda": nada
                    // gravado antes disso.
                    <div style={{ marginTop: 10, padding: '8px 10px', background: '#FCEBEB', border: '.5px solid #E24B4A', borderRadius: 8 }}>
                      <div style={{ fontSize: '.75rem', color: '#791F1F', fontWeight: 700, marginBottom: 6 }}>
                        <i className="ti ti-alert-triangle-filled" style={{ fontSize: 13 }} /> Perda gestacional presumida
                      </div>
                      <div style={{ fontSize: '.72rem', color: '#791F1F', marginBottom: 8 }}>
                        Sem parto nem aborto registrado até {PERDA_PRESUMIDA_DIAS_APOS_PREVISTO} dias após o parto
                        previsto ({fmtData(perdaDetalhe.dataPrevistaParto)}).
                      </div>
                      {podeEditarAnimais && (
                        <button className="btn btn-xs" style={{ background: '#DC2626', color: 'white', border: 'none' }}
                          disabled={confirmandoPerda}
                          onClick={() => setConfirmPerdaAlvo({
                            animalId: a.id, brinco: a.brinco, dataMonta: dataMontaAtual,
                            dataPrevistaParto: perdaDetalhe.dataPrevistaParto, observacoesAtuais: a.observacoes || '',
                          })}>
                          {confirmandoPerda ? 'Confirmando...' : 'Confirmar perda'}
                        </button>
                      )}
                    </div>
                  )}

                  {historicoCiclosVisiveis.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                        Por ciclo
                      </div>
                      {historicoCiclosVisiveis.map(h => {
                        const sty = STATUS_CICLO_ANIMAL[h.status]
                        return (
                          <div key={h.ciclo.id} className="row">
                            <span className="row-label">{h.ciclo.nome}</span>
                            <span className="row-value">
                              <Badge style={{ background: sty.bg, color: sty.text }}>
                                {sty.label}{h.status === 'falhada' && h.motivo ? ` — ${FALHA_MOTIVO_LABEL[h.motivo]}` : ''}
                                {h.data ? ` — ${fmtData(h.data)}` : ''}
                              </Badge>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 8, padding: '0 2px' }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 12 }} /> Inseminações e diagnósticos aparecem na linha do tempo abaixo.
                  </div>
                </div>
              )}

              {/* Histórico reprodutivo do TOURO (sexo=M + is_touro) — Tarefa D.
                  Carregamento sob demanda (ver useEffect de historicoTouroBruto):
                  queries pequenas escopadas só a este touro, nunca um scan da
                  fazenda inteira. Vínculo touro→filho/lote é por ID
                  (pai_animal_id/touro_animal_id, migration_touro_vinculo_id.sql)
                  — os números principais são confiáveis. Dado de ANTES dessa
                  migração (nunca migrado, decisão do usuário) ainda só tem o
                  texto batendo com o brinco; esse legado aparece apartado, nunca
                  somado — nunca uma lacuna silenciosa. */}
              {a.sexo === 'M' && a.is_touro && (() => {
                if (historicoTouroLoading || !historicoTouroBruto) {
                  return (
                    <div className="card" style={{ marginBottom: 12 }}>
                      <div className="card-title"><i className="ti ti-dna" /> Histórico reprodutivo do touro</div>
                      <Loading text="Carregando histórico..." />
                    </div>
                  )
                }
                const h = calcHistoricoTouro(historicoTouroBruto)
                const pequena = n => n > 0 && n < AMOSTRA_MINIMA_TOURO
                const BadgePequena = ({ n }) => pequena(n) ? (
                  <span style={{
                    marginLeft: 6, fontSize: '.62rem', fontWeight: 700, color: '#92620A',
                    background: '#FEF3C7', border: '.5px solid #F3D5A3', borderRadius: 999, padding: '1px 7px',
                  }}>
                    amostra pequena
                  </span>
                ) : null

                const dadosSexo = (h.qtdMachos + h.qtdFemeas) > 0
                  ? [{ sexo: 'Machos', qtd: h.qtdMachos, fill: '#2B6CD9' }, { sexo: 'Fêmeas', qtd: h.qtdFemeas, fill: '#E24B4A' }]
                  : []
                const dadosGMDComparacao = [
                  { grupo: `Filhos deste touro (${h.comGmdFilhos})`, gmd: h.gmdFilhos },
                  { grupo: `Fazenda, mesmas safras (${h.comGmdContemporaneos})`, gmd: h.gmdContemporaneos },
                ].filter(d => d.gmd !== null)

                return (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="card-title"><i className="ti ti-dna" /> Histórico reprodutivo do touro</div>

                    {h.qtdCoberturasExcluidas > 0 && (
                      <AlertBox type="amber" icon="ti-alert-triangle"
                        title='Lotes com mais de um touro ficam fora do histórico individual'
                        body={`${h.qtdCoberturasExcluidas} cobertura(s) em ${h.qtdLotesExcluidos} lote(s) com MAIS DE UM touro ficaram de fora de todo o histórico — paternidade indefinida não gera número.`} />
                    )}

                    <div className="kpi-grid" style={{ marginTop: 10, marginBottom: 0 }}>
                      <div className="kpi-card" style={{ padding: '10px 12px' }}>
                        <div className="kpi-value" style={{ fontSize: '1.05rem' }}>{h.qtdFilhos}</div>
                        <div className="kpi-label">Filhos</div>
                      </div>
                      <div className="kpi-card" style={{ padding: '10px 12px' }}>
                        <div className="kpi-value" style={{ fontSize: '1.05rem', color: h.qtdFilhos === 0 ? '#9CA3AF' : '#111827' }}>
                          {h.qtdFilhos > 0 ? `${pct(h.qtdMachos, h.qtdFilhos)} M / ${pct(h.qtdFemeas, h.qtdFilhos)} F` : 'sem dados'}
                          <BadgePequena n={h.qtdFilhos} />
                        </div>
                        <div className="kpi-label">Machos × fêmeas</div>
                      </div>
                      <div className="kpi-card" style={{ padding: '10px 12px' }}>
                        <div className="kpi-value" style={{ fontSize: '1.05rem', color: h.gmdFilhos === null ? '#9CA3AF' : '#111827' }}>
                          {h.gmdFilhos !== null ? `${h.gmdFilhos} kg/dia` : 'sem dados'}
                          <BadgePequena n={h.comGmdFilhos} />
                        </div>
                        <div className="kpi-label">GMD médio dos filhos{h.comGmdFilhos > 0 ? ` (${h.comGmdFilhos} de ${h.qtdFilhos} com pesagem)` : ''}</div>
                      </div>
                      <div className="kpi-card" style={{ padding: '10px 12px' }}>
                        <div className="kpi-value" style={{ fontSize: '1.05rem', color: h.pesoNascFilhos === null ? '#9CA3AF' : '#111827' }}>
                          {h.pesoNascFilhos !== null ? `${h.pesoNascFilhos} kg` : 'sem dados'}
                          <BadgePequena n={h.comPesoNascFilhos} />
                        </div>
                        <div className="kpi-label">Peso médio ao nascer{h.comPesoNascFilhos > 0 ? ` (${h.comPesoNascFilhos} de ${h.qtdFilhos} com peso)` : ''}</div>
                      </div>
                      <div className="kpi-card" style={{ padding: '10px 12px' }}>
                        <div className="kpi-value" style={{ fontSize: '1.05rem', color: h.efetividade === null ? '#9CA3AF' : '#111827' }}>
                          {h.efetividade !== null ? `${h.efetividade}%` : 'sem dados'}
                          <BadgePequena n={h.diagnosticadas} />
                        </div>
                        <div className="kpi-label">Efetividade de cobertura{h.diagnosticadas > 0 ? ` (${h.prenhas} de ${h.diagnosticadas} diagnosticadas)` : ''}</div>
                      </div>
                      <div className="kpi-card" style={{ padding: '10px 12px' }}>
                        <div className="kpi-value" style={{ fontSize: '1.05rem' }}>{h.qtdSafras}</div>
                        <div className="kpi-label">Safras em que atuou</div>
                      </div>
                    </div>

                    {dadosSexo.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>Machos × fêmeas entre os filhos</div>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart data={dadosSexo} layout="vertical" margin={{ top: 5, right: 25, left: 10, bottom: 5 }}>
                            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                            <YAxis type="category" dataKey="sexo" tick={{ fontSize: 10 }} width={55} />
                            <Tooltip />
                            <Bar dataKey="qtd">
                              {dadosSexo.map((d, i) => <Cell key={i} fill={d.fill} />)}
                              <LabelList dataKey="qtd" position="right" style={{ fontSize: 10, fill: '#6B7280' }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {dadosGMDComparacao.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>GMD dos filhos deste touro × média da fazenda (mesmas safras, mesma fórmula)</div>
                        <ResponsiveContainer width="100%" height={170}>
                          <BarChart data={dadosGMDComparacao} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                            <XAxis dataKey="grupo" tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip formatter={v => [`${v} kg/dia`, 'GMD médio']} />
                            <Bar dataKey="gmd" fill="#2B6CD9">
                              <LabelList dataKey="gmd" position="top" style={{ fontSize: 10, fill: '#6B7280' }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {h.efetividadePorSafra.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>Efetividade de cobertura por safra</div>
                        <ResponsiveContainer width="100%" height={170}>
                          <BarChart data={h.efetividadePorSafra} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                            <XAxis dataKey="safra" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} unit="%" />
                            <Tooltip formatter={(v, _n, props) => [`${v}% (${props.payload.expostas} expostas)`, 'Efetividade']} />
                            <Bar dataKey="efetividade" fill="#27A838">
                              <LabelList dataKey="efetividade" position="top" style={{ fontSize: 10, fill: '#6B7280' }} formatter={v => `${v}%`} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {h.qtdFilhos === 0 && h.expostas === 0 && h.qtdFilhosLegado === 0 && h.qtdCoberturasLegado === 0 && (
                      <div style={{ fontSize: '.82rem', color: '#9CA3AF', marginTop: 8 }}>
                        Nenhum lote ou filho vinculado a este touro ainda.
                      </div>
                    )}

                    {/* Legado — dado de ANTES da vinculação por id, nunca
                        migrado (decisão do usuário: dados de teste, não vale
                        preservar por texto). Só contagem, nunca entra em
                        GMD/efetividade/gráfico acima (Tarefa A.5, aprovado). */}
                    {(h.qtdFilhosLegado > 0 || h.qtdCoberturasLegado > 0) && (
                      <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 12, paddingTop: 10, borderTop: '.5px solid #F3F4F6' }}>
                        <i className="ti ti-info-circle" style={{ fontSize: 12 }} /> Além disso, {h.qtdFilhosLegado} filho(s) e {h.qtdCoberturasLegado} cobertura(s) vinculados só por texto (de antes da vinculação por id, brinco "{a.brinco}") — não entram nos números acima.
                      </div>
                    )}
                  </div>
                )
              })()}

              {desempenhoVida && (() => {
                const d = desempenhoVida
                const fmtMeses = m => m < 12 ? `${m}m` : `${Math.floor(m / 12)}a${m % 12 ? ` ${m % 12}m` : ''}`
                const cards = [
                  ['Intervalo entre partos',        d.intervaloPartosDias !== null ? `${d.intervaloPartosDias} dias` : null],
                  ['Taxa de fecundidade',            d.taxaFecundidade !== null ? `${d.taxaFecundidade}%` : null],
                  ['Taxa de perda gestacional',      d.taxaPerdaGestacional !== null ? `${d.taxaPerdaGestacional}%` : null],
                  ['Taxa de perda pós-parto',        d.taxaPerdaPosParto !== null ? `${d.taxaPerdaPosParto}%` : null],
                  ['GMD médio dos filhos',           d.gmdMedioFilhos !== null ? `${d.gmdMedioFilhos} kg/dia` : null],
                  ['Fêmeas × machos (filhos)',       (d.filhasF + d.filhosM) > 0 ? `${d.filhasF}F × ${d.filhosM}M` : null],
                  ['Peso médio ao nascer (filhos)',  d.pesoMedioNascimento !== null ? `${d.pesoMedioNascimento} kg` : null],
                  ['Peso médio ao desmame (filhos)', d.pesoMedioDesmame !== null ? `${d.pesoMedioDesmame} kg` : null],
                  ['Idade ao primeiro parto',        d.idadePrimeiroPartoMeses !== null ? fmtMeses(d.idadePrimeiroPartoMeses) : null],
                  ['Nº de partos na vida',           String(d.numeroPartosVida)],
                  ['Kg desmamado acumulado (vida)',  d.kgDesmamadoAcumulado !== null ? `${d.kgDesmamadoAcumulado} kg` : null],
                  ['Kg desmamado por ano de vida',   d.kgDesmamadoPorAno !== null ? `${d.kgDesmamadoPorAno} kg/ano` : null],
                  ['Taxa de desmame',                d.taxaDesmame !== null ? `${d.taxaDesmame}%` : null],
                  ['Partos por ano exposta',         d.partosPorAnoExposta !== null ? d.partosPorAnoExposta : null],
                ]
                return (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="card-title"><i className="ti ti-chart-dots-3" /> Desempenho reprodutivo (histórico de vida)</div>
                    <div className="kpi-grid" style={{ marginBottom: 0 }}>
                      {cards.map(([l, v]) => (
                        <div key={l} className="kpi-card" style={{ padding: '10px 12px' }}>
                          <div className="kpi-value" style={{ fontSize: '1.05rem', color: v === null ? '#9CA3AF' : '#111827' }}>
                            {v === null ? 'sem dados' : v}
                          </div>
                          <div className="kpi-label">{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Gráfico de evolução de peso — reaproveitado de Pesagens.jsx
                  "Por Animal", nunca duplicado. Agrupado junto com os outros
                  gráficos (linha do tempo produtiva / GMD dos filhos logo
                  abaixo), em vez de ao lado da timeline (que agora fica na
                  coluna esquerda, junto de Dados cadastrais). */}
              {(() => {
                const serieAnimal = agruparPesoPorData(pesagensAnimal)
                const serieContemp = pesagensContemporaneos.length > 0 ? agruparPesoPorData(pesagensContemporaneos) : []
                const porData = new Map()
                serieAnimal.forEach(p => porData.set(p.dataISO, { data: p.data, peso: p.peso }))
                serieContemp.forEach(p => {
                  const e = porData.get(p.dataISO) || { data: p.data }
                  e.pesoComparacao = p.peso
                  porData.set(p.dataISO, e)
                })
                const chartDataPeso = [...porData.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([, v]) => v)
                const notaComparacao = nContemporaneos === 0
                  ? 'Nenhum contemporâneo (mesmo sexo, nascidos ±3 meses) nesta fazenda.'
                  : nContemporaneos < 3
                    ? `Só ${nContemporaneos} contemporâneo${nContemporaneos !== 1 ? 's' : ''} (mesmo sexo, nascidos ±3 meses) — comparação não é exibida (mínimo: 3).`
                    : null

                if (timelineLoading) return null
                return pesagensAnimal.length > 0 ? (
                  <GraficoEvolucaoPeso
                    data={chartDataPeso}
                    titulo={`Evolução de peso — Brinco ${a.brinco}`}
                    nomeSerie={`Brinco ${a.brinco}`}
                    nomeComparacao="Contemporâneos (média)"
                    notaComparacao={notaComparacao}
                  />
                ) : (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="card-title"><i className="ti ti-chart-line" /> Evolução de peso</div>
                    <div style={{ fontSize: '.82rem', color: '#9CA3AF' }}>Nenhuma pesagem registrada para este animal.</div>
                  </div>
                )
              })()}

              {desempenhoVida && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title"><i className="ti ti-timeline" /> Linha do tempo produtiva</div>
                  {dadosProdutivos.length < 2 ? (
                    <div style={{ fontSize: '.82rem', color: '#9CA3AF' }}>sem dados</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={dadosProdutivos} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                          <XAxis dataKey="safra" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(_v, _n, props) => [props.payload.rotulo, props.payload.safra]} />
                          <Bar dataKey="valor">
                            {dadosProdutivos.map((d, i) => <Cell key={i} fill={CORES_DESFECHO[d.desfecho]} />)}
                            <LabelList dataKey="rotulo" position="top" style={{ fontSize: 9, fill: '#6B7280' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6, fontSize: '.7rem', color: '#6B7280' }}>
                        {[
                          ['pariu', 'Pariu (peso = kg ao desmame)'], ['pariu_aguardando', 'Pariu, aguardando desmame'],
                          ['abortou', 'Abortou'], ['prenha', 'Prenha (aguardando)'],
                          ['falhou', 'Falhou'], ['nao_exposta', 'Não foi exposta'],
                        ].map(([k, l]) => (
                          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: CORES_DESFECHO[k], display: 'inline-block' }} />
                            {l}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {desempenhoVida && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title"><i className="ti ti-chart-bar" /> Desempenho dos filhos (GMD)</div>
                  {dadosGMDFilhos.length < 2 ? (
                    <div style={{ fontSize: '.82rem', color: '#9CA3AF' }}>sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={dadosGMDFilhos} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                        <XAxis dataKey="safra" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v, _n, props) => [`${v} kg/dia`, `Brinco ${props.payload.brinco}`]} />
                        <Bar dataKey="gmd" fill="#2B6CD9">
                          <LabelList dataKey="brinco" position="top" style={{ fontSize: 9, fill: '#6B7280' }} formatter={b => `#${b}`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {filhos.length > 0 && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title"><i className="ti ti-users" /> Filhos cadastrados ({filhos.length})</div>
                  {filhos.map(f => {
                    const fc = catCor[calcCategoria(f.data_nascimento, f.sexo, undefined, f.is_touro)] || catCor.Vaca
                    return (
                      <div key={f.id} className="row" style={{ cursor: 'pointer' }}
                        onClick={() => setSelected(f)}>
                        <span className="row-label">
                          <b>{f.brinco}</b> · {f.sexo === 'F' ? '♀' : '♂'} · {calcCategoria(f.data_nascimento, f.sexo, undefined, f.is_touro)}
                        </span>
                        <Badge style={{ background: fc.bg, color: fc.text }}>{f.situacao}</Badge>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="card">
                <div className="card-title"><i className="ti ti-info-circle" /> Lote e piquete</div>
                {[
                  ['Lote atual',  a.lote?.nome || '—'],
                  ['Data baixa',  fmtData(a.data_baixa) || '—'],
                ].map(([l, v]) => (
                  <div key={l} className="row">
                    <span className="row-label">{l}</span>
                    <span className="row-value">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Linha de comparação com contemporâneos (2ª rodada da Fase 13) —
              mescla a série do animal com a média dos contemporâneos por
              DATA REAL (dataISO), não pela data já formatada (que não ordena
              certo entre anos diferentes). Mesma função (agruparPesoPorData)
              gera as duas séries, só variando o array de pesagens de entrada
              — mesmo cálculo do gráfico principal, confirmado. */}
          {/* Genealogia */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title"><i className="ti ti-sitemap" /> Genealogia</div>
            <ArvoreGenealogica animal={a} animais={animais} onSelect={setSelected}
              onClickPai={paiClicavel ? () => navigate('/reprodutivo', {
                state: { abrirLoteId: partoComoFilho.lote_inseminacao_id, cicloId: partoComoFilho.lote?.ciclo_id }
              }) : undefined} />
          </div>
        </div>{/* end detalheRef */}

        {/* Anotações — fora do PDF, interativo */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title"><i className="ti ti-notebook" /> Anotações</div>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder={`Observações sobre o brinco ${a.brinco}... Ex: "Vaca mansa, boa mãe" / "Problema de casco em 2026"`}
            rows={4}
            style={{ marginBottom: 10, fontSize: '.85rem' }}
          />
          {podeEditarAnimais && (
            <button className="btn btn-primary btn-sm" onClick={salvarNotas} disabled={savingNotas}>
              {savingNotas
                ? 'Salvando...'
                : <><i className="ti ti-device-floppy" /> Salvar anotação</>
              }
            </button>
          )}
        </div>

        {/* Perda gestacional presumida — resumo do que será gravado, incluindo
            o efeito colateral em calcCategoriaRebanho (a vaca some da
            categoria "Vaca Prenha"/"Vaca Prenha 13-24m" etc. no Valor de
            Mercado do Rebanho e nos filtros por categoria) e a nota de
            auditoria em observações (concatenada, nunca sobrescreve — ver
            lib/perdaGestacionalPresumida.js). */}
        <Confirm
          open={!!confirmPerdaAlvo}
          onClose={() => setConfirmPerdaAlvo(null)}
          onConfirm={confirmarPerda}
          title="Confirmar perda gestacional presumida"
          message={confirmPerdaAlvo && `${confirmPerdaAlvo.brinco} — sem parto nem aborto registrado até ${PERDA_PRESUMIDA_DIAS_APOS_PREVISTO} dias após o parto previsto (${fmtData(confirmPerdaAlvo.dataPrevistaParto)}, da monta de ${fmtData(confirmPerdaAlvo.dataMonta)}). Confirmando: a situação reprodutiva dela vira "Vazia" (isso também muda a categoria dela no Valor de Mercado do Rebanho, de "Prenha" para "Vazia"), e uma nota é adicionada às observações do cadastro com as três datas (monta, previsto, confirmação de hoje). Confirmar?`}
          danger
        />
      </div>
    )
  })() : null

  // ── Lista ─────────────────────────────────────────────────────────
  const lista = !selected ? (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <Filtros
          itens={[
            { chave: 'busca', label: 'Buscar', tipo: 'busca', quick: true, placeholder: 'Buscar brinco...' },
            {
              chave: 'situacao', label: 'Situação', tipo: 'pills', quick: true,
              opcoes: [
                { valor: '', label: `Todos (${animais.length})` },
                { valor: 'ativo', label: `Ativos (${ativos})` },
                { valor: 'vendido', label: `Inativos (${inativos})` },
              ],
            },
            {
              chave: 'proprietario', label: 'Proprietário', tipo: 'pills',
              opcoes: [{ valor: '', label: 'Todos' }, ...props.map(p => ({ valor: p.id, label: p.nome.split(' ')[0] }))],
            },
            {
              chave: 'sexo', label: 'Sexo', tipo: 'pills',
              opcoes: [{ valor: '', label: '♀♂' }, { valor: 'F', label: '♀ Fêmeas' }, { valor: 'M', label: '♂ Machos' }],
            },
            {
              chave: 'reprodutivo', label: 'Reprodutivo', tipo: 'pills',
              opcoes: [{ valor: '', label: 'Todas' }, ...repsDisponiveis.map(r => ({ valor: r, label: r.replace('_', ' ') }))],
            },
            {
              chave: 'categoria', label: 'Categoria', tipo: 'select',
              opcoes: [{ valor: '', label: 'Todas as categorias' }, ...categoriasDisponiveis.map(c => ({ valor: c, label: c }))],
            },
            {
              chave: 'lote', label: 'Lote', tipo: 'select',
              opcoes: [{ valor: '', label: 'Todos os lotes' }, ...lotes.map(l => ({ valor: l.id, label: l.nome }))],
            },
          ]}
          valores={{
            busca: search, situacao: filtSit, proprietario: filtProp, sexo: filtSexo,
            reprodutivo: filtRep, categoria: filtCategoria, lote: filtLote,
          }}
          onChange={(chave, valor) => {
            if (chave === 'busca') setSearch(valor)
            else if (chave === 'situacao') setFiltSit(valor)
            else if (chave === 'proprietario') setFiltProp(valor)
            else if (chave === 'sexo') setFiltSexo(valor)
            else if (chave === 'reprodutivo') setFiltRep(valor)
            else if (chave === 'categoria') setFiltCategoria(valor)
            else if (chave === 'lote') setFiltLote(valor)
          }}
        />
        <div className="animais-lote-botoes" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {podeEditarAnimais && (
            <>
              <div className="animais-lote-btn-group">
                <button className="btn btn-secondary btn-sm animais-btn-lote" onClick={() => baixarModeloAnimais()}>
                  <i className="ti ti-download" /> Plan. cadastro lote
                </button>
                <button className="btn btn-secondary btn-sm animais-btn-lote" onClick={() => fileImportRef.current?.click()}>
                  <i className="ti ti-upload" /> Importar plan. cad. lote
                </button>
              </div>
              <input ref={fileImportRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={onEscolherArquivo} />
              <button className="btn btn-primary btn-sm" onClick={openNew}>
                <i className="ti ti-plus" /> Novo animal
              </button>
            </>
          )}
          {podeVerLotes && (
            <button className="btn btn-secondary btn-sm" onClick={irParaLotes} title="Ir para a tela de Lotes">
              <i className="ti ti-layers" /> Ver Lotes
            </button>
          )}
          <BotaoPDF contentRef={listaRef} filename="animais-cadastro" titulo="Animais: Cadastro" />
        </div>
      </div>

      <div ref={listaRef}>
        {filtered.length === 0
          ? <EmptyState icon="🐄" title="Nenhum animal encontrado"
              sub="Ajuste os filtros ou cadastre um novo animal."
              action={podeEditarAnimais ? <button className="btn btn-primary btn-sm" onClick={openNew}><i className="ti ti-plus" /> Novo animal</button> : undefined} />
          : (
            <>
            {selecionados.length > 0 && (
              <div className="animais-tabela-desktop" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#FEE2E2', border: '.5px solid #FCA5A5', borderRadius: 10,
                padding: '8px 14px', marginBottom: 10
              }}>
                <span style={{ fontSize: '.85rem', color: '#7F1D1D', fontWeight: 500 }}>
                  {selecionados.length} selecionado(s)
                </span>
                <button className="btn btn-sm" style={{ background: '#DC2626', color: 'white' }}
                  onClick={excluirSelecionados} disabled={excluindoLote}>
                  <i className="ti ti-trash" /> {excluindoLote ? 'Excluindo...' : 'Excluir selecionados'}
                </button>
              </div>
            )}
            <div className="table-wrap animais-tabela-desktop">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(a => selecionados.includes(a.id))}
                        onChange={toggleSelecionarTodos} />
                    </th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('brinco')}>Brinco<IndicadorOrdenacao campo="brinco" /></th>
                    <th>Sx</th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('categoria')}>Categoria<IndicadorOrdenacao campo="categoria" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('idade')}>Idade<IndicadorOrdenacao campo="idade" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('proprietario')}>Proprietário<IndicadorOrdenacao campo="proprietario" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('rep')}>Rep.<IndicadorOrdenacao campo="rep" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('situacao')}>Situação<IndicadorOrdenacao campo="situacao" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('lote')}>Lote<IndicadorOrdenacao campo="lote" /></th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrdenados.map(a => {
                    const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
                    const cc  = catCor[cat]             || catCor.Vaca
                    const sc  = sitCor[a.situacao]      || sitCor.ativo
                    const statusExib = statusReprodutivoExibicao(a, partosTodos)
                    const rc  = repCor[statusExib] || repCor.nao_se_aplica
                    // Coluna estreita — versão compacta ("Vendida prenha · dd/mm/aa").
                    const vendidaLabel = statusReprodutivoVendida(a, { compacto: true })
                    const rcExib = vendidaLabel ? { bg: '#F3E8FF', text: '#5B2A9E' } : rc
                    const ina = a.situacao !== 'ativo'
                    return (
                      <tr key={a.id} style={{ opacity: ina ? .45 : 1, cursor: ina ? 'default' : 'pointer' }}
                        onClick={() => {
                          if (ina) return
                          setSelected(a)
                          document.querySelector('.page-body')?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selecionados.includes(a.id)}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleSelecionado(a.id)} />
                        </td>
                        <td><strong>{a.brinco}</strong></td>
                        <td style={{ textAlign: 'center', fontSize: 15 }}>{a.sexo === 'F' ? '♀' : '♂'}</td>
                        <td><Badge style={{ background: cc.bg, color: cc.text }}>{cat}</Badge></td>
                        <td style={{ color: '#6B7280' }}>{idadeFormatada(a.data_nascimento)}</td>
                        <td style={{ fontSize: '.8rem' }}>{a.proprietario?.nome?.split(' ')[0] || '—'}</td>
                        <td>{a.sexo === 'F'
                          ? <Badge style={{ background: rcExib.bg, color: rcExib.text }}>{vendidaLabel || statusExib?.replace('_', ' ')}</Badge>
                          : <Badge style={{ background: '#F3F4F6', color: '#9CA3AF' }}>—</Badge>}
                        </td>
                        <td><Badge style={{ background: sc.bg, color: sc.text }}>{a.situacao}</Badge></td>
                        <td style={{ fontSize: '.78rem', color: '#9CA3AF' }}>{a.lote?.nome || '—'}</td>
                        <td style={{ textAlign: 'right', color: '#9CA3AF', fontSize: 17 }}>{ina ? '' : '›'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="animais-cards-mobile">
              {filtered.map(a => {
                const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
                const cc  = catCor[cat] || catCor.Vaca
                const ina = a.situacao !== 'ativo'
                return (
                  <div key={a.id} className="animal-card"
                    style={{ opacity: ina ? .45 : 1 }}
                    onClick={() => !ina && setSelected(a)}>
                    <div className="animal-card-avatar"
                      style={{ background: a.sexo==='F' ? '#FCE7F3' : '#DBEAFE',
                               color: a.sexo==='F' ? '#DB2777' : '#1E55B0' }}>
                      {a.sexo==='F' ? '♀' : '♂'}
                    </div>
                    <div className="animal-card-body">
                      <div className="animal-card-top">
                        <strong>{a.brinco}</strong>
                        <Badge style={{ background: cc.bg, color: cc.text }}>{cat}</Badge>
                        <span className="animal-card-meta">
                          {idadeFormatada(a.data_nascimento)} · {a.proprietario?.nome?.split(' ')[0] || '—'}
                          {a.lote?.nome ? ` · ${a.lote.nome}` : ''}
                        </span>
                      </div>
                    </div>
                    {!ina && <i className="ti ti-chevron-right" style={{ color:'#D1D5DB', fontSize:20, flexShrink:0 }} />}
                  </div>
                )
              })}
            </div>
            </>
          )
        }
      </div>
    </div>
  ) : null

  return (
    <>

      {selected ? detalhe : lista}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editData?.id ? `Editando brinco ${editData.brinco}` : 'Novo animal'}
        width={580}
      >
        {editData && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <MicButton
                hint='Voz: "brinco zero três — fêmea — prenha"'
                onResult={handleVoz}
              />
            </div>

            <div className="grid-form">
              <Field label="Brinco" required>
                <input value={editData.brinco} onChange={e => setEditData(p => ({ ...p, brinco: e.target.value }))} placeholder="ex: 21" />
                {brincoDup && (
                  <div style={{ fontSize:'.72rem', color:'#DC2626', marginTop:4 }}>
                    <i className="ti ti-alert-circle" style={{ fontSize:11 }} /> Já usado por outro animal ({brincoDup.situacao}) — escolha outro.
                  </div>
                )}
              </Field>
              <Field label="SISBOV" hint={editData.sisbov && editData.sisbov.length !== 15 ? `${editData.sisbov.length} dígitos (padrão: 15)` : undefined}>
                <input value={editData.sisbov || ''} inputMode="numeric" placeholder="15 dígitos"
                  onChange={e => setEditData(p => ({ ...p, sisbov: e.target.value.replace(/\D/g, '') }))} />
              </Field>
              <Field label="Número do Registro">
                <input value={editData.numero_registro || ''} onChange={e => setEditData(p => ({ ...p, numero_registro: e.target.value }))} placeholder="ex: PO-12345" />
              </Field>
              <Field label="Nome" hint="Opcional — o brinco continua sendo a identificação principal" hintInline>
                <input value={editData.nome || ''} onChange={e => setEditData(p => ({ ...p, nome: e.target.value }))} placeholder="ex: Estrela" />
              </Field>
              <Field label="Sexo" required>
                <select value={editData.sexo} onChange={e => setEditData(p => ({ ...p, sexo: e.target.value, sit_reprodutiva: e.target.value === 'M' ? 'nao_se_aplica' : 'vazia' }))}>
                  <option value="F">Fêmea ♀</option>
                  <option value="M">Macho ♂</option>
                </select>
              </Field>
              <Field label="Data de nascimento" required>
                <input type="date" value={editData.data_nascimento || ''} onChange={e => setEditData(p => ({ ...p, data_nascimento: e.target.value }))} />
              </Field>
              <Field label="Categoria" hint="Calculada automaticamente" hintInline>
                <input readOnly value={editData.data_nascimento && editData.sexo
                  ? calcCategoriaRebanho(editData.data_nascimento, editData.sexo, editData.sit_reprodutiva, editData.is_touro)
                  : '—'} />
              </Field>
              <Field label="Classificação">
                <select value={editData.classificacao || ''} onChange={e => setEditData(p => ({ ...p, classificacao: e.target.value }))}>
                  <option value="">—</option>
                  <option value="PO">PO — Puro de Origem</option>
                  <option value="PA">PA — Puro por Cruzamento</option>
                  <option value="CO">CO — Controlado por Ascendência</option>
                  <option value="NA">N/A</option>
                </select>
              </Field>
              {editData?.sexo === 'M' && (
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <input type="checkbox"
                    checked={!!editData?.is_touro}
                    onChange={e => setEditData(p => ({...p, is_touro: e.target.checked}))} />
                  <span>É touro (ignora categoria por idade)</span>
                </label>
              )}
              <Field label="Raça">
                <input value={editData.raca || ''} onChange={e => setEditData(p => ({ ...p, raca: e.target.value }))} />
              </Field>
              <Field label="Pelagem">
                <input value={editData.pelagem || ''} onChange={e => setEditData(p => ({ ...p, pelagem: e.target.value }))} />
              </Field>
              {/* Item 5 — mesmo padrão de "Touro" em Reprodutivo.jsx: campo de
                  texto livre + seletor de atalho + resolução ao vivo (qual
                  touro cadastrado/externo vai ser vinculado por id). Nunca
                  substitui a digitação livre — escolher no seletor é
                  exatamente a mesma coisa que digitar o nome à mão. */}
              <Field label="Pai">
                <div style={{ display:'flex', gap:6 }}>
                  <input value={editData.pai || ''} onChange={e => setEditData(p => ({ ...p, pai: e.target.value }))}
                    placeholder="Nome do touro" style={{ flex:1 }} />
                  <SeletorTouro tourosCadastrados={tourosCadastrados} tourosExternos={tourosExternos}
                    onSelect={nome => setEditData(p => ({ ...p, pai: nome }))} />
                </div>
                {/* Paternidade indefinida (bezerro de lote com vários touros,
                    ver paiEhMontaNaturalIndefinida) não é um nome de touro pra
                    resolver — mostrar ResolucaoTouro aqui ofereceria "criar um
                    touro externo" com esse texto, errado. resolverVinculoPai
                    já blinda isso no salvar; aqui é só a exibição. */}
                {!paiEhMontaNaturalIndefinida(editData.pai) && (
                  <ResolucaoTouro texto={editData.pai} tourosCadastrados={tourosCadastrados} tourosExternos={tourosExternos}
                    onEscolherAproximado={nome => setEditData(p => ({ ...p, pai: nome }))} />
                )}
              </Field>
              {/* Mesmo desenho do campo Pai acima, adaptado: sem tabela
                  externa equivalente a touros_externos (mãe só pode ser
                  animal já cadastrado), então a resolução é uma busca direta
                  por brinco — nunca cria nada novo. */}
              <Field label="Mãe — brinco">
                <div style={{ display:'flex', gap:6 }}>
                  <input value={editData.mae_brinco || ''} onChange={e => setEditData(p => ({ ...p, mae_brinco: e.target.value }))}
                    placeholder="ex: 03" style={{ flex:1 }} />
                  {maesCandidatas.length > 0 && (
                    <select value="" onChange={e => { if (e.target.value) setEditData(p => ({ ...p, mae_brinco: e.target.value })) }} style={{ maxWidth:170 }}>
                      <option value="">Selecionar…</option>
                      {maesCandidatas.map(m => <option key={m.id} value={m.brinco}>{m.brinco}{m.nome ? ` — ${m.nome}` : ''}</option>)}
                    </select>
                  )}
                </div>
                {editData.mae_brinco?.trim() && (() => {
                  const maeId = resolverMaeId(editData.mae_brinco)
                  const base = { fontSize:'.75rem', marginTop:5, padding:'5px 9px', borderRadius:7 }
                  return maeId ? (
                    <div style={{ ...base, background:'#E8F0FC', color:'#1E55B0' }}>
                      <i className="ti ti-home" style={{ fontSize:11 }} /> Mãe cadastrada — vínculo por id será usado.
                    </div>
                  ) : (
                    <div style={{ ...base, background:'#F9FAFB', color:'#6B7280' }}>
                      <i className="ti ti-alert-circle" style={{ fontSize:11 }} /> Nenhum animal com esse brinco — fica só como texto, sem vínculo por id.
                    </div>
                  )
                })()}
              </Field>
              <Field label="Proprietário" required>
                <select value={editData.proprietario_id || ''} onChange={e => setEditData(p => ({ ...p, proprietario_id: e.target.value }))}>
                  <option value="">— selecione —</option>
                  {props.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Field>
              <Field label="Lote">
                <select value={editData.lote_id || ''} onChange={e => setEditData(p => ({ ...p, lote_id: e.target.value }))}>
                  <option value="">— sem lote —</option>
                  {lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </Field>
              <Field label="Situação">
                <select value={editData.situacao || 'ativo'} onChange={e => setEditData(p => ({ ...p, situacao: e.target.value }))}>
                  {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {editData.sexo === 'F' && (
                <Field label="Situação reprodutiva">
                  <select value={editData.sit_reprodutiva || 'vazia'} onChange={e => setEditData(p => ({ ...p, sit_reprodutiva: e.target.value }))}>
                    <option value="prenha">Prenha</option>
                    <option value="vazia">Vazia</option>
                    <option value="nao_se_aplica">N/A</option>
                  </select>
                </Field>
              )}
              {(editData.situacao === 'vendido' || editData.situacao === 'morto') && (
                <Field label="Data da baixa">
                  <input type="date" value={editData.data_baixa || ''} onChange={e => setEditData(p => ({ ...p, data_baixa: e.target.value }))} />
                </Field>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 4, paddingTop: 14, borderTop: '.5px solid #E5E7EB' }}>
              <button className="btn btn-primary" onClick={salvar} disabled={saving || !!brincoDup}>
                {saving
                  ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Salvando...</>
                  : <><i className="ti ti-check" />{editData.id ? 'Salvar' : 'Cadastrar'}</>
                }
              </button>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modalImport} onClose={() => setModalImport(false)} title="Importar animais" width={560}>
        {previewImport && (
          <div>
            <p style={{ fontWeight:600, marginBottom:8 }}>
              {previewImport.validos.length} animais prontos para importar
              {previewImport.erros.length > 0 && ` · ${previewImport.erros.length} linha(s) com erro`}
            </p>
            {previewImport.erros.length > 0 && (
              <div style={{ maxHeight:200, overflowY:'auto', background:'#FEF2F2', border:'.5px solid #FECACA', borderRadius:8, padding:10, marginBottom:12 }}>
                {previewImport.erros.map((er, i) => (
                  <div key={i} style={{ fontSize:'.8rem', color:'#B91C1C' }}>Linha {er.linha}: {er.motivo}</div>
                ))}
              </div>
            )}
            <p style={{ fontSize:'.8rem', color:'#6B7280', marginBottom:12 }}>
              As linhas com erro serão ignoradas. Corrija-as na planilha e importe novamente se necessário.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setModalImport(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={confirmarImportacao} disabled={importando || previewImport.validos.length===0}>
                {importando ? 'Importando...' : `Importar ${previewImport.validos.length} animais`}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Confirm
        open={!!confirmExcluirAnimal}
        onClose={() => setConfirmExcluirAnimal(null)}
        onConfirm={executarExcluirAnimal}
        title="Excluir animal"
        message={confirmExcluirAnimal && `Excluir definitivamente o animal ${confirmExcluirAnimal.brinco}? Esta ação não pode ser desfeita.`}
        danger
      />
      <Confirm
        open={confirmExcluirSelecionados}
        onClose={() => setConfirmExcluirSelecionados(false)}
        onConfirm={executarExcluirSelecionados}
        title="Excluir animais selecionados"
        message={`Excluir definitivamente ${selecionados.length} animal(is) selecionado(s)? Esta ação não pode ser desfeita.`}
        danger
      />
      {/* Aviso pós-rename de brinco — informativo, não bloqueia nada (o
          animal já foi salvo). Lista quem precisa de correção manual porque
          não tem mae_id pra derivar sozinho (ver verificarReferenciasDesatualizadas). */}
      <Modal open={!!avisoBrincoRef} onClose={() => setAvisoBrincoRef(null)} title="Brinco alterado — genealogia por texto não acompanhou" width={480}>
        {avisoBrincoRef && (
          <div style={{ fontSize:'.85rem', color:'#374151', lineHeight:1.7 }}>
            <p>
              O brinco antigo (<strong>{avisoBrincoRef.brincoAntigo}</strong>) ainda está gravado como "Mãe — brinco"
              em {avisoBrincoRef.filhos.length} animal{avisoBrincoRef.filhos.length===1?'':'is'}, sem vínculo por id
              pra corrigir sozinho — a árvore genealógica deles vai mostrar "Brinco {avisoBrincoRef.brincoAntigo}
              (desconhecido)" até você corrigir manualmente:
            </p>
            <ul style={{ paddingLeft:20, marginTop:8, marginBottom:8 }}>
              {avisoBrincoRef.filhos.slice(0, 10).map(f => (
                <li key={f.id}>Brinco <strong>{f.brinco}</strong></li>
              ))}
            </ul>
            {avisoBrincoRef.filhos.length > 10 && (
              <p style={{ color:'#9CA3AF', fontSize:'.78rem' }}>e mais {avisoBrincoRef.filhos.length - 10}.</p>
            )}
            <p style={{ color:'#9CA3AF', fontSize:'.78rem' }}>
              Para corrigir, abra cada um e atualize o campo "Mãe — brinco" manualmente.
            </p>
          </div>
        )}
        <div style={{ display:'flex', marginTop:14 }}>
          <button className="btn btn-secondary" onClick={() => setAvisoBrincoRef(null)}>Fechar</button>
        </div>
      </Modal>
    </>
  )
}
