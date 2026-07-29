import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import { fmtData, calcGMD, fmtPeso, numeroPositivo, dataNaoFutura, calcCategoria, calcCategoriaRebanho, mesesDeVida, algumErro, capitalizarPrimeira } from '../lib/helpers'
import { hoje as hojeAgora, hojeISO } from '../lib/hoje'
import { registrarDesmame as gravarDesmame, desfazerDesmame } from '../lib/reprodutivoDesmame'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, IndexCard, BotaoPDF, Confirm, ErroCarregamento, BannerCicloEncerrado, SeletorCicloLocal } from '../components/UI'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const TABS  = ['Registrar','Por Animal','Por Lote','Por Categoria','Desempenho','Projeção','Desmame']
// 'compra'/'venda' são gerados só pelas RPCs de transação (Bloco D3) — nunca
// oferecidos no formulário manual (ver TIPOS_MANUAIS abaixo).
const TIPOS = ['nascimento','desmama','sobreano','intermediaria','compra','venda']
const TIPOS_MANUAIS = TIPOS.filter(t => t !== 'compra' && t !== 'venda')
const TIPO_LABEL = { nascimento:'Nascimento', desmama:'Desmama', sobreano:'Sobreano', intermediaria:'Intermediária', compra:'Compra', venda:'Venda' }
const TIPO_COR   = { compra:'blue', venda:'green' }

// ── Gráfico de evolução de peso — reaproveitado por Por Animal/Por Lote/Por
// Categoria (só muda o array `data` recebido: individual ou média do grupo).
function GraficoEvolucaoPeso({ data, titulo }) {
  return (
    <div className="card" style={{ marginBottom:12 }}>
      <div className="card-title"><i className="ti ti-chart-line"/> {titulo}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{top:5,right:10,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
          <XAxis dataKey="data" tick={{fontSize:10}}/>
          <YAxis tick={{fontSize:10}}/>
          <Tooltip formatter={v=>`${v} kg`}/>
          <Line type="monotone" dataKey="peso" name="Peso kg" stroke="#2B6CD9" strokeWidth={2} dot={{r:4}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Agrupa pesagens de um CONJUNTO de animais por data, tirando a média do peso
// em cada data — vira a "curva do grupo" (mesmo formato {data,peso} do gráfico
// individual, só que cada ponto é uma média em vez de um valor único).
function agruparPesoPorData(pesagensGrupo) {
  const porData = new Map()
  pesagensGrupo.forEach(p => {
    const peso = parseFloat(p.peso_kg)
    if (!Number.isFinite(peso)) return
    if (!porData.has(p.data)) porData.set(p.data, { soma: 0, qtd: 0 })
    const e = porData.get(p.data)
    e.soma += peso; e.qtd += 1
  })
  return [...porData.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, e]) => ({ data: fmtData(data), peso: +(e.soma / e.qtd).toFixed(1) }))
}

// GMD médio de um grupo de animais — média dos GMDs individuais (não o GMD da
// curva média), consistente com a aba Desempenho. TODA pesagem do animal
// conta (inclusive compra/venda, com peso individual ou herdado da média da
// categoria — ver aviso na seção Pesagens do manual).
function gmdMedioGrupo(pesagensArr, animalIds) {
  const gmds = animalIds.map(id => {
    const ps = pesagensArr.filter(p => p.animal_id === id).sort((a,b)=>a.data.localeCompare(b.data))
    const g = calcGMD(ps)
    return g ? parseFloat(g) : null
  }).filter(g => g !== null)
  return gmds.length ? gmds.reduce((s,v)=>s+v,0)/gmds.length : null
}

export default function Pesagens() {
  const refReg    = useRef(null)
  const refAnimal = useRef(null)
  const refLote   = useRef(null)
  const refCat    = useRef(null)
  const refDesemp = useRef(null)
  const refProj   = useRef(null)

  const { podeEditar } = usePermissoes()
  const podeEditarPesagens = podeEditar('pesagens')
  const { dentroDoCiclo, cicloDaData, dataEhEditavel } = useCiclo()
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()
  const statusCicloLocal = statusCiclo(cicloLocal)
  const podeEditarPesagensCiclo = podeEditarPesagens && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  const [tab,     setTab]    = useState(0)
  const [animais, setAnimais]= useState([])
  const [pesagens,setPesagens]= useState([])
  const [loading, setLoading]= useState(true)
  const [modal,   setModal]  = useState(false)
  const [form,    setForm]   = useState({})
  const [selBr,    setSelBr]    = useState('')
  const [selLoteId,      setSelLoteId]      = useState('')
  const [selCategoria,   setSelCategoria]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [loadError,  setLoadError]  = useState(false)
  const [pesoAlvo,   setPesoAlvo]   = useState(480)

  // Desmame — digitar o peso na linha do animal já é o gatilho do desmame
  // (não há mais seleção por checkbox separada, ver registrarDesmame abaixo).
  const [lotesSistema,     setLotesSistema]     = useState([])
  const [filtroLoteDesm,   setFiltroLoteDesm]   = useState('')
  const [pesosDesmame,     setPesosDesmame]     = useState({})
  const [dataDesmame,      setDataDesmame]      = useState(hojeISO())
  const [salvandoDesmame,  setSalvandoDesmame]  = useState(false)
  // Registrar desmame é definitivo num clique só (com aviso de impacto nos
  // indicadores antes de gravar); ocupadoDesmameId desabilita o botão
  // "Desfazer" da linha durante a ação individual.
  const [confirmRegistrarDesmame, setConfirmRegistrarDesmame] = useState(false)
  const [ocupadoDesmameId,  setOcupadoDesmameId]  = useState(null)
  const [confirmDesfazerDesmame, setConfirmDesfazerDesmame] = useState(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const results = await Promise.all([
        db.animais.list({ situacao:'ativo' }),
        db.pesagens.listAll(),
        db.lotes.list()
      ])
      if (algumErro('[Pesagens]', results)) { setLoadError(true); return }
      const [ra, rp, rl] = results
      setAnimais(ra.data  || [])
      setPesagens(rp.data || [])
      setLotesSistema(rl.data || [])
    } catch (e) {
      console.error('[Pesagens] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const salvar = async () => {
    if (!podeEditarPesagensCiclo) return
    if (!form.animal_id || !form.data || !form.peso_kg || !form.tipo) {
      toast('Preencha todos os campos.','error'); return
    }
    const peso = numeroPositivo(form.peso_kg)
    if (peso === null) { toast('Peso inválido: informe um número maior que zero.', 'error'); return }
    if (peso > 1500) { toast('Peso acima de 1500 kg — confira o valor digitado.', 'error'); return }
    if (!dataNaoFutura(form.data)) { toast('Data da pesagem não pode ser futura.', 'error'); return }
    // Nenhum evento pode ser registrado antes do nascimento do animal — bloqueio
    // final aqui, independente do filtro do dropdown (defesa em profundidade:
    // o filtro só evita a escolha errada, isto aqui garante que nunca salva).
    const animalPesado = animais.find(a => a.id === form.animal_id)
    if (animalPesado?.data_nascimento && animalPesado.data_nascimento > form.data) {
      toast(`Animal ${animalPesado.brinco} nasceu em ${fmtData(animalPesado.data_nascimento)} — não é possível registrar pesagem com data anterior (${fmtData(form.data)}).`, 'error')
      return
    }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    setSaving(true)
    const { error } = await db.pesagens.insert({
      animal_id: form.animal_id,
      data:      form.data,
      tipo:      form.tipo,
      peso_kg:   peso,
      observacoes: capitalizarPrimeira(form.obs) || ''
    })
    setSaving(false)
    if (error) { toast('Erro: ' + error.message,'error'); return }
    toast('Pesagem registrada!')
    setModal(false); setForm({}); loadAll()
  }

  const excluir = async (id) => {
    if (!podeEditarPesagensCiclo) return
    const { error } = await db.pesagens.delete(id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Pesagem removida.')
    loadAll()
  }

  const vozPes = (text) => {
    const t    = text.toLowerCase()
    const nums = t.match(/\d[\d.,]*/g)
    if (nums?.length >= 1) {
      const br = nums[0].padStart(2,'0')
      const a  = animais.find(x => x.brinco === br)
      if (a) setForm(p => ({ ...p, animal_id: a.id, _brinco: br }))
    }
    if (nums?.length >= 2) {
      const peso = parseFloat(nums[nums.length-1].replace(',','.'))
      if (peso > 0) setForm(p => ({ ...p, peso_kg: peso }))
    }
    const tipoMap = [
      [/nascimento|nasceu/,     'nascimento'],
      [/desmama|desmame/,       'desmama'],
      [/sobreano|sobre.ano/,    'sobreano'],
      [/intermediária|pesagem/, 'intermediaria'],
    ]
    const tp = tipoMap.find(([rx]) => rx.test(t))
    if (tp) setForm(p => ({ ...p, tipo: tp[1] }))
  }

  // Pesagens do animal selecionado — resolve o id pelo brinco já embutido em
  // cada pesagem (p.animal?.brinco), não pela lista `animais` (só ativos).
  // Um animal vendido não está em `animais`, mas seu histórico de pesagens
  // (entrada/saída inclusas) continua existindo e precisa aparecer aqui.
  const brincosDisponiveis = [...new Set(pesagens.map(p => p.animal?.brinco).filter(Boolean))].sort()
  const animalIdSelecionado = pesagens.find(p => p.animal?.brinco === selBr)?.animal_id
  const pesAnimal  = animalIdSelecionado
    ? pesagens.filter(p => p.animal_id === animalIdSelecionado).sort((a,b)=>a.data.localeCompare(b.data))
    : []
  // GMD usa TODAS as pesagens do animal, inclusive compra/venda (o peso
  // médio de uma transação é o peso real do lote pesado — só não é o peso
  // individual exato de cada cabeça, mas os desvios se compensam no GMD).
  const gmd        = calcGMD(pesAnimal)
  const ultimoPeso = pesAnimal[pesAnimal.length-1]
  // Dias entre a 1ª e a última pesagem — é o denominador do GMD (ver fórmula
  // em calcGMD), mostrado à parte pra ajudar a entender o número do GMD.
  const diasEntrePesagens = pesAnimal.length >= 2
    ? Math.round((new Date(pesAnimal[pesAnimal.length-1].data) - new Date(pesAnimal[0].data)) / 86400000)
    : null
  const chartData  = pesAnimal.map(p => ({ data: fmtData(p.data), peso: parseFloat(p.peso_kg) }))

  // Por Lote — mesmo padrão de Por Animal, só que o "animal" é substituído
  // por um conjunto de animais do mesmo lote (curva = média por data).
  const animaisDoLote  = selLoteId ? animais.filter(a => a.lote_id === selLoteId) : []
  const idsLote        = animaisDoLote.map(a => a.id)
  const pesagensLote   = pesagens.filter(p => idsLote.includes(p.animal_id))
  const chartDataLote  = agruparPesoPorData(pesagensLote)
  const gmdMedioLote   = gmdMedioGrupo(pesagens, idsLote)
  const ultimoPesoLote = chartDataLote[chartDataLote.length - 1]?.peso

  // Por Categoria — usa calcCategoriaRebanho (14 categorias oficiais, mesmo
  // padrão de Animais.jsx/Financeiro.jsx/Rebanho.jsx), não calcCategoria (7
  // genéricas, usada só pro corte etário de desmame acima). Categoria sempre
  // "hoje" — calcCategoriaRebanho não aceita outra data, então fica coerente
  // por construção com Metas/Rebanho/Dashboard, que usam a mesma função.
  // categoriasComAnimais deriva DIRETO de `animais` (só ativos, ver loadAll) —
  // categoria sem nenhum animal simplesmente não aparece no <select>.
  const categoriasComAnimais = [...new Set(
    animais.map(a => calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro))
  )].sort()
  const animaisDaCategoria = selCategoria
    ? animais.filter(a => calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) === selCategoria)
    : []
  const idsCategoria       = animaisDaCategoria.map(a => a.id)
  const pesagensCategoria  = pesagens.filter(p => idsCategoria.includes(p.animal_id))
  const chartDataCategoria = agruparPesoPorData(pesagensCategoria)
  const gmdMedioCategoria  = gmdMedioGrupo(pesagens, idsCategoria)
  const ultimoPesoCategoria = chartDataCategoria[chartDataCategoria.length - 1]?.peso

  // Desempenho — mesmo motivo acima: brinco vem do embed da pesagem, não de
  // `animais` (só ativos), senão animal vendido aparece com brinco "?".
  const animaisComPeso = [...new Set(pesagens.map(p => p.animal_id))]
  const gmds = animaisComPeso.map(aid => {
    const ps = pesagens.filter(p => p.animal_id === aid).sort((a,b)=>a.data.localeCompare(b.data))
    const brinco = ps.find(p => p.animal?.brinco)?.animal?.brinco
    const g  = calcGMD(ps)
    return { brinco: brinco || '?', gmd: g ? parseFloat(g) : null, ultPeso: ps[ps.length-1]?.peso_kg }
  }).filter(x => x.gmd !== null).sort((a,b) => b.gmd - a.gmd)

  const mediaGMD = gmds.length ? (gmds.reduce((s,x)=>s+x.gmd,0)/gmds.length).toFixed(3) : '—'

  // Filtra a lista de registros (aba Registrar) pelo ciclo local. As demais
  // abas (Por Animal, Desempenho, Projeção) usam o histórico completo, pois
  // o cálculo de GMD/projeção depende de pesagens de qualquer época.
  // Ordenada aqui por criado_em desc (lançamento mais recente no topo,
  // mesmo critério de Financeiro/Estoque/Sanidade) — só na exibição desta
  // aba, sem tocar em db.pesagens.listAll(): os outros consumidores dessa
  // query (Por Animal/Lote/Categoria/Desempenho/Projeção aqui, e os GMDs de
  // Metas.jsx/Rebanho.jsx) reordenam por data internamente antes de calcular
  // GMD, então dependem da ordem cronológica real, não da ordem da query.
  const pesagensFiltradas = pesagens
    .filter(p => cicloLocal && dentroDoCiclo(p.data, cicloLocal))
    .sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '') || (b.id || '').localeCompare(a.id || ''))

  // Candidatos + já desmamados: bezerros/terneiros ativos (≤12 meses,
  // categoria por idade — desmame não muda a categoria, então esta lista fica
  // naturalmente limitada à safra do ano corrente, desmamada ou não). Quem já
  // desmamou aparece com o badge + botão Desfazer; quem não desmamou aparece
  // com o campo de peso.
  const candidatosDesmame = animais
    .filter(a => a.situacao === 'ativo' && ['Terneiro','Terneira'].includes(calcCategoria(a.data_nascimento, a.sexo)))
    .filter(a => !filtroLoteDesm || a.lote_id === filtroLoteDesm)
    // Mesmo princípio das outras telas: nunca oferece um animal que ainda nem
    // tinha nascido na data de desmame escolhida — só vale pra quem ainda não
    // foi desmamado (quem já desmamou tem sua própria data fixa, independente
    // da data selecionada no topo pra NOVOS desmames).
    .filter(a => a.data_desmame || !dataDesmame || !a.data_nascimento || a.data_nascimento <= dataDesmame)
    .sort((a, b) => a.brinco.localeCompare(b.brinco, undefined, { numeric: true }))

  // Digitar o peso na linha já é o gatilho do desmame; não há checkbox de
  // seleção. Sem peso digitado, o animal simplesmente não entra no lote a
  // desmamar (ver botão "Registrar desmame" abaixo, que só mostra/gasta os
  // que têm peso).
  const desmamandoIds = candidatosDesmame
    .filter(a => !a.data_desmame && numeroPositivo(pesosDesmame[a.id]) !== null)
    .map(a => a.id)

  // Gate de PERMISSÃO (podeEditarPesagens), não de ciclo — de propósito, mesmo
  // raciocínio de salvarDesmame em Reprodutivo.jsx: o desmame é um evento do
  // animal, datado por si só (dataDesmame), não um lançamento amarrado ao
  // ciclo selecionado nesta tela. dataEhEditavel abaixo avalia o ciclo da DATA
  // DO DESMAME (o que de fato vai ser gravado). Valida e abre o aviso de
  // impacto nos indicadores — a gravação em si só acontece em
  // executarRegistroDesmame, depois da confirmação.
  const registrarDesmame = async () => {
    if (!podeEditarPesagens) return
    if (desmamandoIds.length === 0) { toast('Digite o peso de ao menos um animal.', 'error'); return }
    if (!dataDesmame) { toast('Informe a data do desmame.', 'error'); return }
    if (!dataNaoFutura(dataDesmame)) { toast('Data do desmame não pode ser futura.', 'error'); return }
    if (!dataEhEditavel(dataDesmame)) {
      const c = cicloDaData(dataDesmame)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    // Defesa em profundidade — o filtro do candidatosDesmame já evita isto na
    // maioria dos casos, mas o peso pode ter sido digitado antes da data mudar
    // (mesmo raciocínio do bloqueio individual acima).
    const nascidosDepois = desmamandoIds
      .map(id => animais.find(a => a.id === id))
      .filter(a => a?.data_nascimento && a.data_nascimento > dataDesmame)
    if (nascidosDepois.length > 0) {
      toast(`${nascidosDepois.map(a => `${a.brinco} (nasceu ${fmtData(a.data_nascimento)})`).join(', ')} — não pode desmamar antes de nascer. Apague o peso e tente de novo.`, 'error')
      return
    }
    setConfirmRegistrarDesmame(true)
  }

  const executarRegistroDesmame = async () => {
    setConfirmRegistrarDesmame(false)
    setSalvandoDesmame(true)
    let erros = 0
    for (const id of desmamandoIds) {
      const { error } = await gravarDesmame({ animalId: id, data: dataDesmame, pesoKg: pesosDesmame[id] })
      if (error) erros++
    }
    setSalvandoDesmame(false)
    if (erros > 0) toast(`${erros} animal(is) não puderam ser desmamados — confira e tente de novo.`, 'error')
    else toast(`${desmamandoIds.length} animal(is) desmamado(s)!`)
    setPesosDesmame({})
    loadAll()
  }

  // Corrige lançamento por engano — apaga data_desmame e a pesagem de
  // desmame associada (ver desfazerDesmame em reprodutivoDesmame.js). O
  // <Confirm> avisa que isso também muda os indicadores.
  const desfazerDesmameAnimal = async (a) => {
    if (!podeEditarPesagens) return
    const pesoDesm = pesagens.find(p => p.animal_id === a.id && p.tipo === 'desmama')
    setOcupadoDesmameId(a.id)
    const { error } = await desfazerDesmame({ animalId: a.id, pesagemId: pesoDesm?.id || null })
    setOcupadoDesmameId(null)
    setConfirmDesfazerDesmame(null)
    if (error) { toast('Erro ao desfazer desmame: ' + error, 'error'); return }
    toast('Desmame desfeito.')
    loadAll()
  }

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      <BannerCicloEncerrado ciclo={cicloLocal} />

      <div className="tabs-bar">
        {TABS.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Registrar ── */}
      {tab === 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>{pesagensFiltradas.length} pesagens neste ciclo · {animaisComPeso.length} animais no histórico</span>
            <div style={{ display:'flex', gap:8 }}>
              {podeEditarPesagensCiclo && (
                <button className="btn btn-primary btn-sm" onClick={() => { setForm({ tipo:'intermediaria', data: hojeISO() }); setModal(true) }}>
                  <i className="ti ti-plus" /> Registrar pesagem
                </button>
              )}
              <BotaoPDF contentRef={refReg} filename="pesagens-lista" titulo="Pesagens: Registros" />
            </div>
          </div>
          <div ref={refReg}>
          {pesagensFiltradas.length === 0
            ? <EmptyState icon="⚖️" title="Nenhuma pesagem registrada neste ciclo"
                action={podeEditarPesagensCiclo ? <button className="btn btn-primary btn-sm" onClick={()=>{setForm({tipo:'intermediaria',data:hojeISO()});setModal(true)}}><i className="ti ti-plus"/>Registrar</button> : undefined}/>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Brinco</th><th>Data</th><th>Tipo</th><th style={{textAlign:'right'}}>Peso</th><th></th></tr>
                  </thead>
                  <tbody>
                    {pesagensFiltradas.map(p => {
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.animal?.brinco || '?'}</strong></td>
                          <td>{fmtData(p.data)}</td>
                          <td><Badge color={TIPO_COR[p.tipo]||'gray'}>{TIPO_LABEL[p.tipo]||p.tipo}</Badge></td>
                          <td style={{ textAlign:'right', fontWeight:500 }}>{fmtPeso(p.peso_kg)}</td>
                          <td>
                            {podeEditarPesagensCiclo && (
                              <button className="btn-icon" onClick={() => setConfirmDel(p.id)}>
                                <i className="ti ti-trash" style={{fontSize:13}}/>
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
          </div>{/* end refReg */}
        </div>
      )}

      {/* ── Por Animal ── */}
      {tab === 1 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refAnimal} filename="pesagens-animal" titulo="Pesagens: Por Animal" />
          </div>
          <div ref={refAnimal}>
          <div style={{ marginBottom:14, display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <label style={{ marginBottom:6 }}>Buscar por brinco</label>
              <input list="pesagens-lista-brincos" value={selBr} onChange={e => setSelBr(e.target.value)}
                placeholder="Digite o brinco..." style={{ maxWidth:200 }} />
              <datalist id="pesagens-lista-brincos">
                {brincosDisponiveis.map(br => <option key={br} value={br} />)}
              </datalist>
            </div>
            <div>
              <label style={{ marginBottom:6 }}>ou selecione</label>
              <select value={selBr} onChange={e => setSelBr(e.target.value)} style={{ maxWidth:260 }}>
                <option value="">— escolha um brinco —</option>
                {brincosDisponiveis.map(br => (
                  <option key={br} value={br}>{br}</option>
                ))}
              </select>
            </div>
          </div>

          {selBr && pesAnimal.length > 0 && (
            <div>
              <div className="grid-4" style={{ marginBottom:14 }}>
                <IndexCard value={fmtPeso(ultimoPeso?.peso_kg)} label="Último peso" color="#2B6CD9"/>
                <IndexCard value={gmd ? `${gmd} kg/dia` : '—'} label="GMD" meta="≥0,80 kg/dia" ok={parseFloat(gmd)>=0.8}/>
                <IndexCard value={diasEntrePesagens !== null ? `${diasEntrePesagens} dias` : '—'} label="Dias entre pesagens" color="#7B2FBE"/>
                <IndexCard value={pesAnimal.length} label="Pesagens" color="#0C447C"/>
              </div>
              <GraficoEvolucaoPeso data={chartData} titulo={`Evolução de peso — Brinco ${selBr}`} />
              <div className="card">
                <div className="card-title"><i className="ti ti-list"/> Histórico de pesagens</div>
                <div className="table-wrap" style={{border:'none'}}>
                  <table>
                    <thead><tr><th>Data</th><th>Tipo</th><th style={{textAlign:'right'}}>Peso</th><th style={{textAlign:'right'}}>Variação</th></tr></thead>
                    <tbody>
                      {pesAnimal.map((p,i) => {
                        const v = i > 0 ? parseFloat(p.peso_kg) - parseFloat(pesAnimal[i-1].peso_kg) : null
                        return (
                          <tr key={p.id}>
                            <td>{fmtData(p.data)}</td>
                            <td><Badge color={TIPO_COR[p.tipo]||'gray'}>{TIPO_LABEL[p.tipo]||p.tipo}</Badge></td>
                            <td style={{textAlign:'right',fontWeight:500}}>{fmtPeso(p.peso_kg)}</td>
                            <td style={{textAlign:'right',color:v===null?'':v>=0?'#1E55B0':'#791F1F'}}>
                              {v===null?'—':(v>=0?'+':'')+v.toFixed(1)+' kg'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {selBr && pesAnimal.length === 0 && (
            <EmptyState icon="⚖️" title="Nenhuma pesagem para este animal"/>
          )}
          {!selBr && (
            <EmptyState icon="⚖️" title="Selecione um animal" sub="Escolha um brinco para ver o histórico de pesagens e evolução de peso."/>
          )}
          </div>{/* end refAnimal */}
        </div>
      )}

      {/* ── Por Lote ── */}
      {tab === 2 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refLote} filename="pesagens-lote" titulo="Pesagens: Por Lote" />
          </div>
          <div ref={refLote}>
          <div style={{ marginBottom:14 }}>
            <label style={{ marginBottom:6 }}>Selecione o lote</label>
            <select value={selLoteId} onChange={e => setSelLoteId(e.target.value)} style={{ maxWidth:260 }}>
              <option value="">— escolha um lote —</option>
              {lotesSistema.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>

          {selLoteId && chartDataLote.length > 0 && (
            <div>
              <div className="grid-3" style={{ marginBottom:14 }}>
                <IndexCard value={fmtPeso(ultimoPesoLote)} label="Peso médio atual" color="#2B6CD9"/>
                <IndexCard value={gmdMedioLote!=null ? `${gmdMedioLote.toFixed(3)} kg/dia` : '—'} label="GMD médio do lote" meta="≥0,80 kg/dia" ok={gmdMedioLote>=0.8}/>
                <IndexCard value={animaisDoLote.length} label="Animais no lote" color="#0C447C"/>
              </div>
              <GraficoEvolucaoPeso data={chartDataLote} titulo={`Evolução de peso (média) — Lote ${lotesSistema.find(l=>l.id===selLoteId)?.nome || ''}`} />
            </div>
          )}
          {selLoteId && chartDataLote.length === 0 && (
            <EmptyState icon="⚖️" title="Nenhuma pesagem para os animais deste lote"/>
          )}
          {!selLoteId && (
            <EmptyState icon="⚖️" title="Selecione um lote" sub="Escolha um lote para ver a curva média de peso do grupo."/>
          )}
          </div>{/* end refLote */}
        </div>
      )}

      {/* ── Por Categoria ── */}
      {tab === 3 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refCat} filename="pesagens-categoria" titulo="Pesagens: Por Categoria" />
          </div>
          <div ref={refCat}>
          <div style={{ marginBottom:14 }}>
            <label style={{ marginBottom:6 }}>Selecione a categoria</label>
            <select value={selCategoria} onChange={e => setSelCategoria(e.target.value)} style={{ maxWidth:260 }}>
              <option value="">— escolha uma categoria —</option>
              {categoriasComAnimais.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {selCategoria && chartDataCategoria.length > 0 && (
            <div>
              <div className="grid-3" style={{ marginBottom:14 }}>
                <IndexCard value={fmtPeso(ultimoPesoCategoria)} label="Peso médio atual" color="#2B6CD9"/>
                <IndexCard value={gmdMedioCategoria!=null ? `${gmdMedioCategoria.toFixed(3)} kg/dia` : '—'} label="GMD médio da categoria" meta="≥0,80 kg/dia" ok={gmdMedioCategoria>=0.8}/>
                <IndexCard value={animaisDaCategoria.length} label={`Animais em ${selCategoria}`} color="#0C447C"/>
              </div>
              <GraficoEvolucaoPeso data={chartDataCategoria} titulo={`Evolução de peso (média) — ${selCategoria}`} />
            </div>
          )}
          {selCategoria && chartDataCategoria.length === 0 && (
            <EmptyState icon="⚖️" title="Nenhuma pesagem para animais desta categoria"/>
          )}
          {!selCategoria && (
            <EmptyState icon="⚖️" title="Selecione uma categoria" sub="Escolha uma categoria para ver a curva média de peso do grupo."/>
          )}
          </div>{/* end refCat */}
        </div>
      )}

      {/* ── Desempenho ── */}
      {tab === 4 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refDesemp} filename="pesagens-desempenho" titulo="Pesagens: Desempenho" />
          </div>
          <div ref={refDesemp}>
          <div className="grid-3" style={{ marginBottom:14 }}>
            <IndexCard value={mediaGMD} label="GMD médio kg/dia" meta="≥0,80" ok={parseFloat(mediaGMD)>=0.8}/>
            <IndexCard value={gmds.length} label="Animais avaliados" color="#0C447C"/>
            <IndexCard value={gmds.filter(x=>x.gmd>=0.8).length} label="Acima da meta" color="#2B6CD9"/>
          </div>
          <div className="card">
            <div className="card-title"><i className="ti ti-table"/> GMD por animal</div>
            <div className="table-wrap" style={{border:'none'}}>
              <table>
                <thead><tr><th>Brinco</th><th style={{textAlign:'right'}}>GMD (kg/dia)</th><th style={{textAlign:'right'}}>Último peso</th><th>Meta</th></tr></thead>
                <tbody>
                  {gmds.map(x => (
                    <tr key={x.brinco}>
                      <td><strong>{x.brinco}</strong></td>
                      <td style={{textAlign:'right',fontWeight:500,color:x.gmd>=0.8?'#1E55B0':'#BA7517'}}>{x.gmd.toFixed(3)}</td>
                      <td style={{textAlign:'right',color:'#6B7280'}}>{fmtPeso(x.ultPeso)}</td>
                      <td>
                        <Badge color={x.gmd>=0.8?'green':'amber'}>
                          {x.gmd>=0.8?'✓ OK':'↑ Baixo'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>{/* end refDesemp */}
        </div>
      )}

      {/* ── Projeção ── */}
      {tab === 5 && (() => {
        const hoje = hojeAgora(); hoje.setHours(0, 0, 0, 0)

        const projecao = animaisComPeso.map(aid => {
          // GMD e último peso usam TODAS as pesagens do animal, inclusive
          // compra/venda (peso real do lote pesado no negócio).
          const ps = pesagens.filter(p => p.animal_id === aid).sort((a, b) => a.data.localeCompare(b.data))
          if (ps.length < 2) return null
          // Projeção é prospectiva (quando o animal atinge o peso-alvo) — só
          // faz sentido pra quem ainda está no plantel. `animais` (só ativos)
          // funciona como filtro aqui de propósito: animal vendido some da
          // projeção (não é bug de brinco, é a projeção não fazer sentido
          // pra ele — diferente das abas históricas acima, que mostram o que
          // já aconteceu e por isso usam o brinco embutido na pesagem).
          const an     = animais.find(x => x.id === aid)
          if (!an) return null
          const g      = parseFloat(calcGMD(ps))
          const ultP   = parseFloat(ps[ps.length - 1]?.peso_kg || 0)
          const atingiu= ultP >= pesoAlvo

          if (atingiu) return { brinco: an?.brinco || '?', ultP, gmd: g, dias: 0, dataEst: null, atingiu: true }
          if (!g || g <= 0) return { brinco: an?.brinco || '?', ultP, gmd: g || 0, dias: null, dataEst: null, atingiu: false }

          const dias = Math.round((pesoAlvo - ultP) / g)
          const dest = new Date(hoje); dest.setDate(dest.getDate() + dias)
          return { brinco: an?.brinco || '?', ultP, gmd: g, dias, dataEst: dest.toLocaleDateString('pt-BR'), atingiu: false }
        }).filter(Boolean).sort((a, b) => {
          if (a.atingiu && !b.atingiu) return -1
          if (!a.atingiu && b.atingiu) return 1
          if (a.dias === null) return 1
          if (b.dias === null) return -1
          return a.dias - b.dias
        })

        const emProjecao = projecao.filter(x => !x.atingiu && x.gmd > 0)
        const diasMedios = emProjecao.length
          ? Math.round(emProjecao.reduce((s, x) => s + x.dias, 0) / emProjecao.length)
          : null

        return (
          <div>
            {/* Controles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: '.85rem', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>
                  Peso-alvo:
                </label>
                <input
                  type="number" min={100} max={1000} step={10}
                  value={pesoAlvo}
                  onChange={e => setPesoAlvo(parseFloat(e.target.value) || 480)}
                  style={{ width: 90, textAlign: 'right' }}
                />
                <span style={{ fontSize: '.85rem', color: '#9CA3AF' }}>kg</span>
                {emProjecao.length > 0 && (
                  <span style={{ fontSize: '.78rem', color: '#9CA3AF' }}>
                    · {emProjecao.length} animal(is) em projeção · média {diasMedios}d
                  </span>
                )}
              </div>
              <BotaoPDF contentRef={refProj} filename="projecao-peso" titulo="Pesagens: Projeção de Peso" />
            </div>

            <div ref={refProj}>
              {projecao.length === 0 ? (
                <EmptyState icon="📊" title="Nenhum animal com 2+ pesagens" sub="Registre ao menos duas pesagens por animal para calcular a projeção." />
              ) : (
                <div className="card">
                  <div className="card-title"><i className="ti ti-chart-dots-3" /> Projeção para {pesoAlvo} kg</div>
                  <div className="table-wrap" style={{ border: 'none' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Brinco</th>
                          <th style={{ textAlign: 'right' }}>Peso atual</th>
                          <th style={{ textAlign: 'right' }}>GMD (kg/d)</th>
                          <th style={{ textAlign: 'right' }}>Faltam</th>
                          <th>Data estimada</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projecao.map(x => (
                          <tr key={x.brinco}>
                            <td><strong>{x.brinco}</strong></td>
                            <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtPeso(x.ultP)}</td>
                            <td style={{ textAlign: 'right', color: x.gmd >= 0.8 ? '#1E55B0' : x.gmd > 0 ? '#BA7517' : '#9CA3AF' }}>
                              {x.gmd > 0 ? x.gmd.toFixed(3) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: '#6B7280' }}>
                              {x.atingiu ? '—' : x.dias !== null ? `${x.dias}d` : '—'}
                            </td>
                            <td style={{ color: '#374151' }}>
                              {x.atingiu ? (
                                <span style={{ color: '#1E55B0', fontWeight: 500 }}>✓ Atingiu</span>
                              ) : x.dataEst ? x.dataEst : (
                                <span style={{ color: '#9CA3AF' }}>GMD insuficiente</span>
                              )}
                            </td>
                            <td>
                              {x.atingiu ? (
                                <span style={{ background: '#E8F0FC', color: '#1E55B0', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>✓ OK</span>
                              ) : x.dias !== null && x.dias <= 30 ? (
                                <span style={{ background: '#FEF3C7', color: '#633806', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>⚡ Próximo</span>
                              ) : x.dias !== null ? (
                                <span style={{ background: '#F9FAFB', color: '#6B7280', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>Em {x.dias}d</span>
                              ) : (
                                <span style={{ background: '#FCEBEB', color: '#791F1F', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>↓ GMD</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Desmame ── */}
      {tab === 6 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>
              {candidatosDesmame.length} candidato{candidatosDesmame.length!==1?'s':''} ao desmame (sem desmame registrado ou aguardando confirmação)
            </span>
          </div>

          <div className="grid-form" style={{ marginBottom: 14 }}>
            <Field label="Data do desmame" required>
              <input type="date" value={dataDesmame} onChange={e => {
                const novaData = e.target.value
                const invalidos = desmamandoIds
                  .map(id => animais.find(a => a.id === id))
                  .filter(a => a?.data_nascimento && novaData && a.data_nascimento > novaData)
                if (invalidos.length > 0) {
                  setPesosDesmame(prev => {
                    const n = { ...prev }
                    invalidos.forEach(a => delete n[a.id])
                    return n
                  })
                  toast(`${invalidos.length} animal(is) com peso apagado por nascer depois da nova data: ${invalidos.map(a => a.brinco).join(', ')}.`, 'error')
                }
                setDataDesmame(novaData)
              }} />
            </Field>
            <Field label="Filtrar por lote">
              <select value={filtroLoteDesm} onChange={e => setFiltroLoteDesm(e.target.value)}>
                <option value="">Todos os lotes</option>
                {lotesSistema.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </Field>
          </div>

          {candidatosDesmame.length === 0 ? (
            <EmptyState icon="🐄" title="Nenhum candidato ao desmame" sub="Terneiros/terneiras ativos já desmamados ou nenhum registrado ainda." />
          ) : (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>
                  Digite o peso na linha do animal para desmamá-lo — sem peso, ele fica de fora.
                </span>
                {podeEditarPesagens && (
                  <button className="btn btn-primary btn-sm" onClick={registrarDesmame} disabled={salvandoDesmame || desmamandoIds.length === 0}>
                    {salvandoDesmame ? 'Registrando...' : <><i className="ti ti-check" /> Registrar desmame ({desmamandoIds.length})</>}
                  </button>
                )}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Brinco</th><th>Idade</th><th>Sexo</th><th>Lote</th><th style={{textAlign:'right'}}>Desmame</th></tr>
                  </thead>
                  <tbody>
                    {candidatosDesmame.map(a => {
                      const desmamado = !!a.data_desmame
                      const pesoDesm  = pesagens.find(p => p.animal_id === a.id && p.tipo === 'desmama')
                      const ocupado = ocupadoDesmameId === a.id
                      return (
                        <tr key={a.id}>
                          <td><strong>{a.brinco}</strong></td>
                          <td style={{ fontSize:'.82rem', color:'#6B7280' }}>{mesesDeVida(a.data_nascimento)}m</td>
                          <td>{a.sexo === 'F' ? '♀' : '♂'}</td>
                          <td style={{ fontSize:'.82rem', color:'#6B7280' }}>{a.lote?.nome || '—'}</td>
                          <td style={{ textAlign:'right' }}>
                            {!desmamado ? (
                              <input type="number" step="0.1" min="0" placeholder="0,0"
                                disabled={!podeEditarPesagens}
                                value={pesosDesmame[a.id] || ''}
                                onChange={e => setPesosDesmame(p => ({ ...p, [a.id]: e.target.value }))}
                                style={{ width:90, textAlign:'right' }} />
                            ) : (
                              <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end', flexWrap:'wrap' }}>
                                <Badge color="green">
                                  Desmamado em {fmtData(a.data_desmame)}{pesoDesm ? ` · ${pesoDesm.peso_kg}kg` : ''}
                                </Badge>
                                {podeEditarPesagens && (
                                  <button className="btn-icon" title="Desfazer desmame" disabled={ocupado} onClick={() => setConfirmDesfazerDesmame(a)}>
                                    <i className="ti ti-x" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <Confirm
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => excluir(confirmDel)}
        title="Excluir pesagem"
        message="Excluir esta pesagem? Esta ação não pode ser desfeita."
        danger
      />

      <Confirm
        open={confirmRegistrarDesmame}
        onClose={() => setConfirmRegistrarDesmame(false)}
        onConfirm={executarRegistroDesmame}
        title="Confirmar desmame"
        message={`Desmamar ${desmamandoIds.length} animal(is)? Isso entra imediatamente no cálculo de Kg ao Desmame e Kg Desmamado/Matriz em Metas.`}
      />

      <Confirm
        open={!!confirmDesfazerDesmame}
        onClose={() => setConfirmDesfazerDesmame(null)}
        onConfirm={() => desfazerDesmameAnimal(confirmDesfazerDesmame)}
        title="Desfazer desmame"
        message={`Desfazer o desmame de ${confirmDesfazerDesmame?.brinco || ''}? A data e o peso registrados serão apagados, e isso também muda o cálculo de Kg ao Desmame e Kg Desmamado/Matriz em Metas.`}
        danger
      />

      {/* ── Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Registrar pesagem" width={500}>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
          <MicButton hint='Voz: "brinco zero três — quatrocentos quilos — intermediária"' onResult={vozPes}/>
        </div>
        <div className="grid-form">
          <Field label="Animal (brinco)" required>
            <select value={form.animal_id||''} onChange={e=>setForm(p=>({...p,animal_id:e.target.value}))}>
              <option value="">— selecione —</option>
              {animais
                .filter(a => !form.data || !a.data_nascimento || a.data_nascimento <= form.data)
                .map(a => <option key={a.id} value={a.id}>{a.brinco}</option>)}
            </select>
          </Field>
          <Field label="Data" required>
            <input type="date" value={form.data||''} onChange={e => {
              const novaData = e.target.value
              // Trocar a data DEPOIS de já ter escolhido o animal pode deixar a
              // escolha inválida (animal que só nasceu depois da nova data) —
              // limpa a seleção e avisa, mesmo padrão usado na venda (Financeiro.jsx).
              const atual = animais.find(a => a.id === form.animal_id)
              if (atual?.data_nascimento && novaData && atual.data_nascimento > novaData) {
                setForm(p => ({ ...p, data: novaData, animal_id: '' }))
                toast(`Animal ${atual.brinco} desmarcado: nasceu em ${fmtData(atual.data_nascimento)}, depois da nova data.`, 'error')
                return
              }
              setForm(p => ({ ...p, data: novaData }))
            }}/>
          </Field>
          <Field label="Tipo" required>
            <select value={form.tipo||'intermediaria'} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}>
              {TIPOS_MANUAIS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Peso (kg)" required>
            <input type="number" step="0.1" value={form.peso_kg||''} onChange={e=>setForm(p=>({...p,peso_kg:e.target.value}))} placeholder="0,0"/>
          </Field>
        </div>
        <Field label="Observações">
          <input value={form.obs||''} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="opcional"/>
        </Field>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check"/>Salvar</>}</button>
          <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
