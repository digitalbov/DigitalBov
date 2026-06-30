import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import area from '@turf/area'
import { kml as toGeoJson } from '@tmcw/togeojson'
import { db, supabase } from '../lib/supabase'
import { useFazenda } from '../lib/FazendaContext'
import { useConta } from '../lib/ContaContext'
import { usePermissoes } from '../lib/PermissoesContext'
import { diasDesde, fmtMoeda } from '../lib/helpers'
import { Loading, Modal, Field, Badge, toast, EmptyState, Confirm } from '../components/UI'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import OnboardingWizard from '../components/OnboardingWizard'

// ── Helpers ───────────────────────────────────────────────────────
const getCicloAtualAno = () => {
  const h = new Date(); const m = h.getMonth() + 1
  return m >= 7 ? h.getFullYear() : h.getFullYear() - 1
}

const calcAreaHa = (geom) => {
  if (!geom) return 0
  try { return (area(geom) / 10000).toFixed(2) } catch { return 0 }
}

// GeoJSON [lng,lat] → Leaflet [[lat,lng]]
const geoJsonToLeaflet = (geom) => {
  if (!geom) return []
  const rings = geom.type === 'Polygon' ? geom.coordinates
    : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : []
  return rings.map(ring => ring.map(([lng, lat]) => [lat, lng]))
}

// Leaflet [[lat,lng]] → GeoJSON [lng,lat]
const leafletToGeoJson = (latlngs) => ({
  type: 'Polygon',
  coordinates: [latlngs.map(([lat, lng]) => [lng, lat])]
})

// ── Mapa leitura (piquetes com polígonos salvos) ───────────────────
function MapaPiquetes({ piqs }) {
  const mapRef = useRef(null)
  const prevPiqs = useRef([])

  useEffect(() => {
    const same = JSON.stringify(piqs.map(p=>p.id+p.status)) === JSON.stringify(prevPiqs.current.map(p=>p.id+p.status))
    prevPiqs.current = piqs

    setTimeout(() => {
      if (!mapRef.current) {
        const map = L.map('mapa-piquetes', { center: [-30.2790, -50.8680], zoom: 15, zoomControl: true })
        mapRef.current = map
        L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          { attribution: '© Esri, © OpenStreetMap', maxZoom: 19 }
        ).addTo(map)
        renderPiquetes(map, piqs)
      } else if (!same) {
        mapRef.current.eachLayer(l => { if (l instanceof L.Polygon || l instanceof L.Marker) mapRef.current.removeLayer(l) })
        renderPiquetes(mapRef.current, piqs)
      }
    }, 100)

    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, []) // eslint-disable-line

  const CORES = ['#4ADE80','#60A5FA','#FACC15','#FB923C','#A78BFA','#F472B6']

  const renderPiquetes = (map, lista) => {
    lista.forEach((p, idx) => {
      const coords = p.geometria ? geoJsonToLeaflet(p.geometria) : []
      if (!coords.length) return
      const cor = CORES[idx % CORES.length]
      const emUso = p.status === 'em_uso'
      const poly = L.polygon(coords, { color: cor, fillColor: cor, fillOpacity: 0.35, weight: 2 }).addTo(map)
      poly.bindPopup(`
        <div style="font-family:sans-serif;min-width:150px;padding:2px">
          <div style="font-weight:700;font-size:14px;margin-bottom:3px">${p.nome}</div>
          <div style="font-size:12px;color:#6B7280;margin-bottom:5px">${parseFloat(p.area_ha||0).toFixed(1)} ha</div>
          <div style="font-size:12px;font-weight:600">${emUso?'🟢 Em uso':'🟡 Em descanso'}</div>
        </div>`)
      const center = poly.getBounds().getCenter()
      L.marker([center.lat, center.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="transform:translate(-50%,-50%);background:rgba(0,0,0,.7);color:#fff;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;border:1.5px solid ${cor};white-space:nowrap;pointer-events:none">${p.nome}<br><span style="font-weight:400;opacity:.8">${parseFloat(p.area_ha||0).toFixed(1)} ha</span></div>`,
          iconSize: [1,1], iconAnchor: [0,0]
        })
      }).addTo(map)
    })
    if (lista.length && lista[0].geometria) {
      const bounds = lista.reduce((b, p) => {
        const c = geoJsonToLeaflet(p.geometria)
        return c.length ? b.extend(c.flat()) : b
      }, L.latLngBounds([]))
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] })
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ background:'#2B6CD9', color:'white', padding:'10px 14px', borderRadius:'12px 12px 0 0', fontSize:'.85rem' }}>
        Mapa de satélite — piquetes
      </div>
      <div id="mapa-piquetes" style={{ width:'100%', height:'380px', borderRadius:'0 0 12px 12px', overflow:'hidden', border:'.5px solid #E5E7EB' }} />
    </div>
  )
}

// ── Mapa desenho (modal completo) ─────────────────────────────────
function MapaDesenho({ initialGeometry, onConfirm, onClose }) {
  const mapRef   = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (mapRef.current) return
      const map = L.map('mapa-desenho-el', { center: [-30.2790, -50.8680], zoom: 15 })
      mapRef.current = map

      const sat = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution:'© Esri', maxZoom:19 }
      ).addTo(map)
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'})
      L.control.layers({ 'Satélite':sat, 'Mapa':osm }).addTo(map)

      map.pm.addControls({
        position:'topleft', drawMarker:false, drawCircle:false,
        drawPolyline:false, drawCircleMarker:false, drawText:false,
        editMode:true, dragMode:true, cutPolygon:false, removalMode:true,
      })

      if (initialGeometry) {
        try {
          const glayer = L.geoJSON(initialGeometry, { style:{ color:'#2B6CD9', fillOpacity:.3 } }).addTo(map)
          layerRef.current = glayer.getLayers()[0]
          map.fitBounds(glayer.getBounds(), { padding:[30,30] })
        } catch {}
      }

      map.on('pm:create', e => {
        if (layerRef.current) map.removeLayer(layerRef.current)
        layerRef.current = e.layer
      })
    }, 150)

    return () => {
      clearTimeout(t)
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      layerRef.current = null
    }
  }, []) // eslint-disable-line

  const confirmar = () => {
    if (!layerRef.current) { toast('Desenhe um polígono primeiro.','error'); return }
    try {
      const geo = layerRef.current.toGeoJSON()
      onConfirm(geo.geometry)
    } catch { toast('Erro ao processar polígono.','error') }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:9999, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'12px 16px', background:'#2B6CD9', color:'white', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <div>
          <div style={{ fontWeight:600 }}>Desenhar área do piquete</div>
          <div style={{ fontSize:'.75rem', opacity:.7 }}>Clique no ícone de polígono (canto superior esquerdo) para começar a desenhar</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary btn-sm" onClick={confirmar}>
            <i className="ti ti-check" /> Confirmar área
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
        </div>
      </div>
      <div id="mapa-desenho-el" style={{ flex:1 }} />
    </div>
  )
}

// ── Gráfico de benchmarks ─────────────────────────────────────────
function GraficoBenchmark({ titulo, valorFazenda, benchmarks, tipo }) {
  if (!benchmarks?.length) return null
  const key = tipo === 'terra' ? 'rentab_terra' : 'rentab_rebanho'
  const max = Math.max(benchmarks.reduce((m, b) => Math.max(m, b[key]), 0), Math.abs(valorFazenda || 0), 0.1) * 1.3

  const data = benchmarks.map(b => ({
    name: b.rotulo,
    referência: parseFloat(b[key]),
  }))

  return (
    <div>
      <div style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', marginBottom:6 }}>{titulo}</div>
      {valorFazenda !== null && (
        <div style={{ marginBottom:8 }}>
          <span style={{ fontSize:'1.4rem', fontWeight:700, color: valorFazenda >= 0 ? '#2B6CD9' : '#E24B4A' }}>
            {valorFazenda !== null ? `${valorFazenda.toFixed(2)}%` : '—'}
          </span>
          <span style={{ fontSize:'.75rem', color:'#9CA3AF', marginLeft:6 }}>rentabilidade da fazenda</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={data} margin={{ top:4, right:8, bottom:0, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="name" tick={{ fontSize:10 }} />
          <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`${v}%`} domain={[0, max]} />
          <Tooltip formatter={v=>`${v}%`} />
          <Bar dataKey="referência" fill="#93C5FD" radius={[3,3,0,0]} />
          {valorFazenda !== null && (
            <ReferenceLine y={valorFazenda} stroke={valorFazenda>=0?'#2B6CD9':'#E24B4A'} strokeWidth={2} strokeDasharray="4 2"
              label={{ value:`Fazenda: ${valorFazenda.toFixed(1)}%`, position:'insideTopRight', fontSize:10, fill: valorFazenda>=0?'#2B6CD9':'#E24B4A' }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────
export default function Propriedade() {
  const { fazendaAtual, fazendas, carregarFazendas, atualizarFazendaAtual, setFazendaAtual } = useFazenda()
  const { contaAtual } = useConta()
  const { podeEditar } = usePermissoes()
  const podeEditarProp = podeEditar('propriedade')
  const ehAdmin = contaAtual?.papel === 'dono' || contaAtual?.papel === 'admin'

  const [section,    setSection]    = useState('resumo')
  const [planTab,    setPlanTab]    = useState('proposito')
  const [props,      setProps]      = useState([])
  const [piqs,       setPiqs]       = useState([])
  const [lotes,      setLotes]      = useState([])
  const [plan,       setPlan]       = useState(null)
  const [acoes,      setAcoes]      = useState([])
  const [benchmarks, setBenchmarks] = useState([])
  const [cicloAtual, setCicloAtual] = useState(null)
  const [resultadoLiquido, setResultadoLiquido] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState(null)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [modoArea,   setModoArea]   = useState('manual')
  const [mapDesenho, setMapDesenho] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [fazendaForm,    setFazendaForm]    = useState({})
  const [confirmFaz,     setConfirmFaz]     = useState(null)
  const [nomeDeletar,    setNomeDeletar]    = useState('')

  const loadAll = useCallback(async () => {
    if (!fazendaAtual) return
    setLoading(true)
    const [rp, rq, rl, rplan, rb] = await Promise.all([
      db.proprietarios.listAll(),
      db.piquetes.list(),
      db.lotes.list(),
      db.planejamentos.get(),
      db.benchmarks.list(),
    ])
    setProps(rp.data  || [])
    setPiqs(rq.data   || [])
    setLotes(rl.data  || [])
    setBenchmarks(rb.data || [])
    const planData = rplan.data
    setPlan(planData)
    if (planData) {
      const { data: aData } = await db.planejamentoAcoes.list(planData.id)
      setAcoes(aData || [])
    }
    // Resultado líquido do ciclo atual
    const { data: ciclo } = await db.ciclos.current()
    setCicloAtual(ciclo)
    if (ciclo) {
      const [{ data: lancs }, { data: transacs }] = await Promise.all([
        db.lancamentos.list(ciclo.id),
        db.transacoes.list(ciclo.id),
      ])
      const todasReceitas = [...(lancs||[]).filter(l=>l.tipo==='R'), ...(transacs||[]).filter(t=>t.tipo==='V')]
      const todasDespesas = [...(lancs||[]).filter(l=>l.tipo==='D'), ...(transacs||[]).filter(t=>t.tipo==='C')]
      const valorDe = (x) => parseFloat(x.valor ?? x.valor_total ?? 0) || 0
      const rec  = todasReceitas.reduce((s, l) => s + valorDe(l), 0)
      const desp = todasDespesas.reduce((s, l) => s + valorDe(l), 0)
      setResultadoLiquido(rec - desp)
    }
    setLoading(false)
  }, [fazendaAtual])

  useEffect(() => { loadAll() }, [loadAll])

  const openModal  = (type, data={}) => { setModal(type); setForm({...data}); setModoArea('manual') }
  const closeModal = () => { setModal(null); setForm({}); setModoArea('manual') }

  // ── Proprietários ─────────────────────────────────────────────
  const saveProprietario = async () => {
    if (!form.nome) { toast('Informe o nome.','error'); return }
    setSaving(true)
    const { error } = form.id
      ? await db.proprietarios.update(form.id, { nome:form.nome, inscricao_estadual:form.inscricao_estadual })
      : await db.proprietarios.insert({ nome:form.nome, inscricao_estadual:form.inscricao_estadual })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast(form.id ? 'Proprietário atualizado!' : 'Proprietário cadastrado!')
    closeModal(); loadAll()
  }

  const deletarOuDesativarProprietario = async (prop) => {
    const { count } = await db.proprietarios.hasData(prop.id)
    if (count > 0) {
      setConfirmDel({ tipo:'desativar-prop', item:prop })
    } else {
      setConfirmDel({ tipo:'deletar-prop', item:prop })
    }
  }

  const confirmarDeleteProp = async () => {
    const { tipo, item } = confirmDel
    setConfirmDel(null)
    if (tipo === 'desativar-prop') {
      await db.proprietarios.update(item.id, { ativo: false })
      toast('Proprietário desativado. Histórico preservado.')
    } else {
      const { error } = await db.proprietarios.delete(item.id)
      if (error) { toast('Erro ao excluir: '+error.message,'error'); return }
      toast('Proprietário excluído.')
    }
    loadAll()
  }

  const reativarProprietario = async (id) => {
    await db.proprietarios.update(id, { ativo: true })
    toast('Proprietário reativado!')
    loadAll()
  }

  // ── Piquetes ──────────────────────────────────────────────────
  const savePiquete = async () => {
    if (!form.nome) { toast('Informe o nome.','error'); return }
    setSaving(true)
    const payload = {
      nome:           form.nome,
      area_ha:        parseFloat(form.area_ha) || 0,
      status:         form.status || 'em_uso',
      qualidade_past: form.qualidade_past || '',
      tipo_pastagem:  form.tipo_pastagem  || '',
      finalidade:     form.finalidade     || '',
      geojson:        form.geojson        || null,
    }
    const { error } = form.id
      ? await db.piquetes.update(form.id, payload)
      : await db.piquetes.insert(payload)
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast(form.id ? 'Piquete atualizado!' : 'Piquete cadastrado!')
    closeModal(); loadAll()
  }

  const deletarPiquete = (piq) => setConfirmDel({ tipo:'deletar-piq', item:piq })

  const toggleStatus = async (piq) => {
    const novo = piq.status==='em_uso' ? 'em_descanso' : 'em_uso'
    await db.piquetes.update(piq.id, { status:novo, status_desde:new Date().toISOString().split('T')[0] })
    loadAll()
  }

  const importarKML = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const dom = new DOMParser().parseFromString(e.target.result, 'text/xml')
        const geo = toGeoJson(dom)
        const feat = geo.features?.find(f => f.geometry?.type==='Polygon' || f.geometry?.type==='MultiPolygon')
        if (!feat) { toast('Nenhum polígono encontrado no KML.','error'); return }
        const ha = calcAreaHa(feat.geometry)
        setForm(p => ({ ...p, geometria:feat.geometry, area_ha:ha }))
        toast(`Área calculada: ${ha} ha`)
      } catch (err) {
        toast('Erro ao ler KML: '+err.message,'error')
      }
    }
    reader.readAsText(file)
  }

  const onGeometryDesenhada = (geom) => {
    const ha = calcAreaHa(geom)
    setForm(p => ({ ...p, geometria:geom, area_ha:ha }))
    setMapDesenho(false)
    toast(`Área calculada: ${ha} ha`)
  }

  // ── Lotes ─────────────────────────────────────────────────────
  const saveLote = async () => {
    if (!form.nome) { toast('Informe o nome.','error'); return }
    setSaving(true)
    const { error } = form.id
      ? await db.lotes.update(form.id, { nome:form.nome, finalidade:form.finalidade, descricao:form.descricao })
      : await db.lotes.insert({ nome:form.nome, finalidade:form.finalidade, descricao:form.descricao })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast(form.id ? 'Lote atualizado!' : 'Lote cadastrado!')
    closeModal(); loadAll()
  }

  const deletarLote = (lote) => setConfirmDel({ tipo:'deletar-lote', item:lote })

  // ── Fazenda ───────────────────────────────────────────────────
  const saveFazenda = async () => {
    if (!fazendaForm.nome) { toast('Informe o nome.','error'); return }
    setSaving(true)
    const { data, error } = await db.fazendas.update(fazendaAtual.id, {
      nome:       fazendaForm.nome,
      localizacao:fazendaForm.localizacao||'',
      area_total: parseFloat(fazendaForm.area_total)||0,
      area_util:  parseFloat(fazendaForm.area_util)||0,
    })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    if (data) atualizarFazendaAtual(data)
    toast('Fazenda atualizada!')
  }

  const criarFazenda = async () => {
    if (!form.nome) { toast('Informe o nome.','error'); return }
    if (!contaAtual?.id) { toast('Conta não identificada.','error'); return }
    setSaving(true)
    const { data, error } = await supabase.rpc('criar_fazenda', {
      p_conta_id:   contaAtual.id,
      p_nome:       form.nome,
      p_localizacao: form.localizacao || null,
    })
    setSaving(false)
    if (error || !data) { toast('Erro: '+(error?.message||'sem retorno'),'error'); return }
    toast('Fazenda criada!')
    await carregarFazendas()
    setFazendaAtual(data)
    setShowOnboarding(true)
    closeModal()
  }

  const desativarFazenda = async (faz) => {
    if (fazendas.length <= 1) { toast('Não é possível desativar a única fazenda.','error'); return }
    await db.fazendas.deactivate(faz.id)
    toast('Fazenda desativada. Histórico preservado.')
    const lista = await carregarFazendas()
    if (lista?.length) setFazendaAtual(lista[0])
    setConfirmFaz(null)
  }

  const excluirFazendaPermanente = async (faz) => {
    if (nomeDeletar !== faz.nome) { toast('Nome digitado incorreto.','error'); return }
    if (fazendas.length <= 1) { toast('Não é possível excluir a única fazenda.','error'); return }
    const { error } = await db.fazendas.hardDelete(faz.id)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast('Fazenda excluída permanentemente.')
    const lista = await carregarFazendas()
    if (lista?.length) setFazendaAtual(lista[0])
    setConfirmFaz(null); setNomeDeletar('')
  }

  // ── Planejamento ──────────────────────────────────────────────
  const criarPlanejamento = async () => {
    setSaving(true)
    const ano = getCicloAtualAno()
    const { data, error } = await db.planejamentos.insert({ dados: { ano_ciclo: ano }, ativo: true })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    setPlan(data); setAcoes([])
    toast('Planejamento criado!')
  }

  const savePlanejamento = async (campo, valor) => {
    if (!plan) return
    const novoDados = { ...(plan.dados || {}), [campo]: valor }
    const { data, error } = await db.planejamentos.update(plan.id, { dados: novoDados })
    if (error) { toast('Erro ao salvar.','error'); return }
    setPlan(data)
    toast('Salvo!')
  }

  const saveAcao = async () => {
    if (!form.descricao) { toast('Informe a descrição.','error'); return }
    if (!plan) { toast('Crie o planejamento primeiro.','error'); return }
    setSaving(true)
    const payload = { planejamento_id:plan.id, descricao:form.descricao, ciclo_alvo:form.ciclo_alvo||null, status:'pendente' }
    const { error } = form.id
      ? await db.planejamentoAcoes.update(form.id, { descricao:form.descricao, ciclo_alvo:form.ciclo_alvo||null })
      : await db.planejamentoAcoes.insert(payload)
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast(form.id ? 'Ação atualizada!' : 'Ação adicionada!')
    closeModal()
    const { data } = await db.planejamentoAcoes.list(plan.id)
    setAcoes(data||[])
  }

  const toggleAcao = async (acao) => {
    const concluida = acao.status !== 'concluida'
    await db.planejamentoAcoes.update(acao.id, {
      status:      concluida ? 'concluida' : 'pendente',
      concluida_em:concluida ? new Date().toISOString() : null,
    })
    const { data } = await db.planejamentoAcoes.list(plan.id)
    setAcoes(data||[])
  }

  const deletarAcao = async (id) => {
    await db.planejamentoAcoes.delete(id)
    setAcoes(prev => prev.filter(a => a.id !== id))
    toast('Ação removida.')
  }

  const saveValoresPlan = async () => {
    if (!plan) return
    setSaving(true)
    const novoDados = {
      ...(plan.dados || {}),
      valor_terra:        parseFloat(form.valor_terra)        || null,
      valor_ha:           parseFloat(form.valor_ha)           || null,
      valor_rebanho:      parseFloat(form.valor_rebanho)      || null,
      valor_benfeitorias: parseFloat(form.valor_benfeitorias) || null,
    }
    const { data, error } = await db.planejamentos.update(plan.id, { dados: novoDados })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    setPlan(data); toast('Valores salvos!')
  }

  // ── Calculos de rentabilidade ─────────────────────────────────
  const totalHa       = piqs.reduce((s,p) => s + parseFloat(p.area_ha||0), 0)
  const vTerraEfetivo = (plan?.dados?.valor_terra > 0)
    ? plan.dados.valor_terra
    : (plan?.dados?.valor_ha > 0 && totalHa > 0 ? plan.dados.valor_ha * totalHa : null)
  const vRebanho      = plan?.dados?.valor_rebanho      > 0 ? plan.dados.valor_rebanho      : null
  const vBenf         = plan?.dados?.valor_benfeitorias > 0 ? plan.dados.valor_benfeitorias : null
  const vTotal        = (vTerraEfetivo||0) + (vRebanho||0) + (vBenf||0) || null
  const rl            = typeof resultadoLiquido === 'number' && !isNaN(resultadoLiquido) ? resultadoLiquido : null
  const rentTerra     = vTerraEfetivo > 0 && rl !== null ? (rl / vTerraEfetivo * 100) : null
  const rentRebanho   = vRebanho      > 0 && rl !== null ? (rl / vRebanho      * 100) : null
  const rentTotal     = vTotal        > 0 && rl !== null ? (rl / vTotal        * 100) : null

  // ── Ações do ciclo atual ──────────────────────────────────────
  const cicloAno = getCicloAtualAno()
  const acoesCiclo  = acoes.filter(a => a.ciclo_alvo === cicloAno)
  const acoesPend   = acoes.filter(a => a.status !== 'concluida')
  const acoesConcl  = acoes.filter(a => a.status === 'concluida')

  if (loading) return <Loading />

  const voltar = () => setSection('resumo')
  const SecHeader = ({ title, icon, onNew, newLabel }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <button className="btn btn-secondary btn-sm" onClick={voltar}><i className="ti ti-arrow-left" /> Voltar</button>
        <span style={{ fontWeight:600, fontSize:'1rem', color:'#374151' }}>
          <i className={`ti ${icon}`} style={{ marginRight:6, color:'#2B6CD9' }} />{title}
        </span>
      </div>
      {onNew && (
        <button className="btn btn-primary btn-sm" onClick={onNew}>
          <i className="ti ti-plus" /> {newLabel}
        </button>
      )}
    </div>
  )

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div>
      {showOnboarding && fazendaAtual && (
        <OnboardingWizard fazendaId={fazendaAtual.id} onClose={() => { setShowOnboarding(false); loadAll() }} />
      )}

      {mapDesenho && (
        <MapaDesenho
          initialGeometry={form.geometria}
          onConfirm={onGeometryDesenhada}
          onClose={() => setMapDesenho(false)}
        />
      )}

      {/* ── Botão Nova fazenda (admin) ───────────────────────── */}
      {ehAdmin && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => openModal('nova-faz')}>
            <i className="ti ti-plus" /> Nova fazenda
          </button>
        </div>
      )}

      {/* ══ RESUMO ═══════════════════════════════════════════════ */}
      {section === 'resumo' && (
        <div>
          <div style={{ marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <h3 style={{ fontSize:'1rem', fontWeight:600, color:'#374151', marginBottom:4 }}>Propriedade — {fazendaAtual?.nome}</h3>
              <p style={{ fontSize:'.83rem', color:'#6B7280' }}>Selecione uma seção para gerenciar.</p>
            </div>
            {podeEditarProp && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setSection('fazenda'); setFazendaForm({ nome:fazendaAtual?.nome, localizacao:fazendaAtual?.localizacao, area_total:fazendaAtual?.area_total, area_util:fazendaAtual?.area_util }) }}>
                <i className="ti ti-settings" /> Configurar fazenda
              </button>
            )}
          </div>

          <div className="grid-4" style={{ marginBottom:24 }}>
            {[
              { key:'props',       icon:'👤', label:'Proprietários', count:props.filter(p=>p.ativo!==false).length, color:'#E8F0FC', textColor:'#2B6CD9', desc:props.filter(p=>p.ativo!==false).slice(0,2).map(p=>p.nome.split(' ')[0]).join(', ')||'Nenhum' },
              { key:'piqs',        icon:'🌿', label:'Piquetes',       count:piqs.length,  color:'#E8F0FC', textColor:'#2B6CD9', desc:`${totalHa.toFixed(1)} ha total` },
              { key:'lotes',       icon:'📦', label:'Lotes',           count:lotes.length, color:'#EEEDFE', textColor:'#3C3489', desc:lotes.slice(0,2).map(l=>l.nome).join(', ')||'Nenhum' },
              { key:'planejamento',icon:'🎯', label:'Planejamento',    count:acoesPend.length, color:'#E6F1FB', textColor:'#0C447C', desc:plan ? `${acoesConcl.length}/${acoes.length} ações concluídas` : 'Não criado' },
            ].map(k => (
              <div key={k.key} onClick={() => setSection(k.key)} style={{ background:'white', border:'.5px solid #E5E7EB', borderRadius:14, padding:'20px 16px', cursor:'pointer', transition:'all .15s', borderTop:`3px solid ${k.textColor}` }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 6px 16px rgba(0,0,0,.1)';e.currentTarget.style.transform='translateY(-2px)'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='';e.currentTarget.style.transform=''}}>
                <div style={{ width:40,height:40,borderRadius:10,background:k.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',marginBottom:12 }}>{k.icon}</div>
                <div style={{ fontSize:'2rem',fontWeight:700,color:k.textColor,lineHeight:1 }}>{k.count}</div>
                <div style={{ fontSize:'.85rem',fontWeight:600,color:'#374151',marginTop:4 }}>{k.label}</div>
                <div style={{ fontSize:'.74rem',color:'#9CA3AF',marginTop:4,lineHeight:1.4 }}>{k.desc}</div>
                <div style={{ fontSize:'.74rem',color:k.textColor,marginTop:10,fontWeight:500 }}>Abrir seção →</div>
              </div>
            ))}
          </div>

          {/* Resumo planejamento no resumo */}
          {plan && (
            <div className="card" style={{ marginBottom:16, borderTop:'3px solid #0C447C' }}>
              <div className="card-title"><i className="ti ti-target" style={{ color:'#0C447C' }} /> Planejamento — {plan.dados?.ano_ciclo}/{String((plan.dados?.ano_ciclo||0)+1).slice(-2)}</div>
              {plan.dados?.proposito && <p style={{ fontSize:'.82rem', color:'#374151', marginBottom:8 }}>{plan.dados.proposito}</p>}
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                {rentTerra   !== null && <div><span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>RENT. TERRA</span><div style={{ fontWeight:700, color:rentTerra>=0?'#2B6CD9':'#E24B4A' }}>{rentTerra.toFixed(2)}%</div></div>}
                {rentRebanho !== null && <div><span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>RENT. REBANHO</span><div style={{ fontWeight:700, color:rentRebanho>=0?'#2B6CD9':'#E24B4A' }}>{rentRebanho.toFixed(2)}%</div></div>}
                {resultadoLiquido !== null && <div><span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>RESULTADO LÍQUIDO</span><div style={{ fontWeight:700, color:resultadoLiquido>=0?'#2B6CD9':'#E24B4A' }}>{fmtMoeda(resultadoLiquido)}</div></div>}
              </div>
              {acoesCiclo.length > 0 && (
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', marginBottom:6 }}>Objetivos do ciclo {cicloAno}/{String(cicloAno+1).slice(-2)}</div>
                  {acoesCiclo.slice(0,3).map(a => (
                    <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                      <input type="checkbox" checked={a.status==='concluida'} onChange={podeEditarProp ? () => toggleAcao(a) : undefined} disabled={!podeEditarProp} style={{ cursor: podeEditarProp ? 'pointer' : 'default' }} />
                      <span style={{ fontSize:'.82rem', color:'#374151', textDecoration:a.status==='concluida'?'line-through':'none' }}>{a.descricao}</span>
                    </div>
                  ))}
                  {acoesCiclo.length > 3 && <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}>+{acoesCiclo.length-3} mais</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ PROPRIETÁRIOS ════════════════════════════════════════ */}
      {section === 'props' && (
        <div>
          <SecHeader title="Proprietários" icon="ti-users" onNew={podeEditarProp ? () => openModal('prop') : undefined} newLabel="Novo proprietário" />
          {props.length === 0
            ? <EmptyState icon="👤" title="Nenhum proprietário" sub="Clique em Novo proprietário para começar" />
            : props.map(p => (
              <div key={p.id} className="card" style={{ marginBottom:10, display:'flex', alignItems:'center', gap:14, opacity:p.ativo===false?0.5:1 }}>
                <div style={{ width:42,height:42,borderRadius:'50%',background:'#E8F0FC',color:'#1E55B0',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'.9rem',flexShrink:0 }}>
                  {p.nome.split(' ').filter((_,i,a)=>i===0||i===a.length-1).map(w=>w[0]).join('').toUpperCase()}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:500 }}>{p.nome} {p.ativo===false && <Badge color="gray">Desativado</Badge>}</div>
                  <div style={{ fontSize:'.78rem', color:'#9CA3AF' }}>IE: {p.inscricao_estadual||'—'}</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {podeEditarProp && (p.ativo === false
                    ? <button className="btn btn-secondary btn-xs" onClick={() => reativarProprietario(p.id)}><i className="ti ti-player-play" /> Reativar</button>
                    : <>
                        <button className="btn btn-secondary btn-xs" onClick={() => openModal('prop',p)}><i className="ti ti-edit" /> Editar</button>
                        <button className="btn btn-secondary btn-xs" style={{ color:'#E24B4A' }} onClick={() => deletarOuDesativarProprietario(p)}><i className="ti ti-trash" /></button>
                      </>
                  )}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ══ PIQUETES ═════════════════════════════════════════════ */}
      {section === 'piqs' && (
        <div>
          <SecHeader title={`Piquetes — ${totalHa.toFixed(1)} ha`} icon="ti-map" onNew={podeEditarProp ? () => openModal('piq') : undefined} newLabel="Novo piquete" />
          {piqs.length > 0 && <MapaPiquetes piqs={piqs} />}
          {piqs.length === 0
            ? <EmptyState icon="🌿" title="Nenhum piquete cadastrado" sub="Clique em Novo piquete para começar" />
            : (
              <div className="piq-grid">
                {piqs.map(p => {
                  const emUso = p.status==='em_uso'
                  const dias  = p.status_desde ? diasDesde(p.status_desde) : null
                  return (
                    <div key={p.id} style={{ background:'white', border:'.5px solid #E5E7EB', borderTop:`3px solid ${emUso?'#7B2FBE':'#D97706'}`, borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ fontWeight:600, fontSize:'.92rem', color:'#374151' }}>{p.nome}</div>
                        <div style={{ display:'flex', gap:4 }}>
                          {podeEditarProp && <button className="btn btn-secondary btn-xs" onClick={() => openModal('piq',p)}><i className="ti ti-edit" /></button>}
                          {podeEditarProp && <button className="btn btn-secondary btn-xs" style={{ color:'#E24B4A' }} onClick={() => deletarPiquete(p)}><i className="ti ti-trash" /></button>}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:'1.6rem', fontWeight:700, color:'#2B6CD9', lineHeight:1 }}>{parseFloat(p.area_ha||0).toFixed(1)}</div>
                        <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginTop:2 }}>hectares</div>
                      </div>
                      {p.geometria && <div style={{ fontSize:'.72rem', color:'#6B7280' }}><i className="ti ti-map-2" style={{ fontSize:11 }} /> Geometria salva</div>}
                      <Badge color={emUso?'green':'amber'}><i className={`ti ${emUso?'ti-circle-check':'ti-moon'}`} style={{ fontSize:11 }} /> {emUso?'Em uso':'Em descanso'}</Badge>
                      {dias !== null && <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}><i className="ti ti-clock" style={{ fontSize:12 }} /> {dias} dia{dias!==1?'s':''} neste status</div>}
                      {podeEditarProp && (
                        <button className="btn btn-secondary btn-xs" onClick={() => toggleStatus(p)} style={{ marginTop:'auto' }}>
                          <i className={`ti ${emUso?'ti-moon':'ti-sun'}`} /> {emUso?'Colocar em descanso':'Colocar em uso'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      )}

      {/* ══ LOTES ════════════════════════════════════════════════ */}
      {section === 'lotes' && (
        <div>
          <SecHeader title="Lotes" icon="ti-layers" onNew={podeEditarProp ? () => openModal('lote') : undefined} newLabel="Novo lote" />
          {lotes.length === 0
            ? <EmptyState icon="📦" title="Nenhum lote cadastrado" sub="Clique em Novo lote para começar" />
            : lotes.map(l => (
              <div key={l.id} className="card" style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:34,height:34,borderRadius:8,background:'#EEEDFE',color:'#3C3489',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15 }}>
                      <i className="ti ti-layers" />
                    </div>
                    <div>
                      <div style={{ fontWeight:500 }}>{l.nome}</div>
                      <Badge color="purple">{l.finalidade||'—'}</Badge>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4 }}>
                    {podeEditarProp && <button className="btn btn-secondary btn-xs" onClick={() => openModal('lote',l)}><i className="ti ti-edit" /> Editar</button>}
                    {podeEditarProp && <button className="btn btn-secondary btn-xs" style={{ color:'#E24B4A' }} onClick={() => deletarLote(l)}><i className="ti ti-trash" /></button>}
                  </div>
                </div>
                {l.descricao && <div style={{ fontSize:'.78rem', color:'#6B7280', lineHeight:1.5 }}>{l.descricao}</div>}
              </div>
            ))
          }
        </div>
      )}

      {/* ══ PLANEJAMENTO ═════════════════════════════════════════ */}
      {section === 'planejamento' && (
        <div>
          <SecHeader title="Planejamento" icon="ti-target" />
          {!plan ? (
            <div style={{ textAlign:'center', padding:'40px 20px' }}>
              <div style={{ fontSize:56, marginBottom:16 }}>🎯</div>
              <h3 style={{ fontWeight:600, color:'#374151', marginBottom:8 }}>Nenhum planejamento criado</h3>
              <p style={{ color:'#6B7280', marginBottom:24, fontSize:'.88rem' }}>Crie o planejamento desta fazenda com Propósito, Números e Ações.</p>
              {podeEditarProp && (
                <button className="btn btn-primary" onClick={criarPlanejamento} disabled={saving}>
                  {saving?'Criando...':'Criar planejamento'}
                </button>
              )}
            </div>
          ) : (
            <div>
              {/* Tabs do planejamento */}
              <div style={{ display:'flex', gap:4, marginBottom:20, background:'#F3F4F6', borderRadius:10, padding:4 }}>
                {[
                  { id:'proposito', label:'Por quê? (Propósito)', icon:'ti-heart' },
                  { id:'numeros',   label:'O quê? (Números)',     icon:'ti-calculator' },
                  { id:'pratica',   label:'Como? (Prática)',      icon:'ti-list-check' },
                ].map(t => (
                  <button key={t.id} onClick={() => setPlanTab(t.id)} style={{
                    flex:1, padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer',
                    background:planTab===t.id?'white':'transparent',
                    fontWeight:planTab===t.id?600:400, color:planTab===t.id?'#2B6CD9':'#6B7280',
                    fontSize:'.78rem', boxShadow:planTab===t.id?'0 1px 4px rgba(0,0,0,.1)':'none',
                    fontFamily:'inherit',
                  }}>
                    <i className={`ti ${t.icon}`} style={{ marginRight:5 }} />{t.label}
                  </button>
                ))}
              </div>

              {/* Tab Propósito */}
              {planTab === 'proposito' && (
                <PlanProposito plan={plan} onSave={savePlanejamento} podeEditar={podeEditarProp} />
              )}

              {/* Tab Números */}
              {planTab === 'numeros' && (
                <PlanNumeros
                  plan={plan} form={form} setForm={setForm}
                  totalHa={totalHa} resultadoLiquido={resultadoLiquido}
                  cicloAtual={cicloAtual}
                  rentTerra={rentTerra} rentRebanho={rentRebanho} rentTotal={rentTotal}
                  vTerraEfetivo={vTerraEfetivo} vRebanho={vRebanho} vTotal={vTotal}
                  benchmarks={benchmarks}
                  onSaveValores={saveValoresPlan} saving={saving}
                  podeEditar={podeEditarProp}
                />
              )}

              {/* Tab Prática */}
              {planTab === 'pratica' && (
                <PlanPratica
                  acoesPend={acoesPend} acoesConcl={acoesConcl} acoesCiclo={acoesCiclo}
                  cicloAno={cicloAno}
                  onToggle={toggleAcao} onDelete={deletarAcao}
                  onAdd={() => openModal('acao')} onEdit={a => openModal('acao', a)}
                  podeEditar={podeEditarProp}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ FAZENDA ══════════════════════════════════════════════ */}
      {section === 'fazenda' && (
        <div>
          <SecHeader title="Configurações da fazenda" icon="ti-home-2" />

          {/* Editar fazenda atual */}
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-title"><i className="ti ti-edit" style={{ color:'#2B6CD9' }} /> Editar fazenda atual</div>
            <div className="grid-form" style={{ marginBottom:12 }}>
              <Field label="Nome da fazenda" required>
                <input value={fazendaForm.nome||''} onChange={e=>setFazendaForm(p=>({...p,nome:e.target.value}))} placeholder="Nome" />
              </Field>
              <Field label="Localização / Município">
                <input value={fazendaForm.localizacao||''} onChange={e=>setFazendaForm(p=>({...p,localizacao:e.target.value}))} placeholder="ex: Viamão, RS" />
              </Field>
              <Field label="Área total (ha)">
                <input type="number" step="0.1" value={fazendaForm.area_total||''} onChange={e=>setFazendaForm(p=>({...p,area_total:e.target.value}))} />
              </Field>
              <Field label="Área útil (ha)">
                <input type="number" step="0.1" value={fazendaForm.area_util||''} onChange={e=>setFazendaForm(p=>({...p,area_util:e.target.value}))} />
              </Field>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {podeEditarProp && <button className="btn btn-primary btn-sm" onClick={saveFazenda} disabled={saving}>{saving?'Salvando...':'Salvar alterações'}</button>}
              <button className="btn btn-secondary btn-sm" onClick={voltar}>Cancelar</button>
            </div>
          </div>

          {/* Tutorial */}
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-title"><i className="ti ti-map-route" style={{ color:'#0C447C' }} /> Tutorial de preenchimento</div>
            <p style={{ fontSize:'.82rem', color:'#6B7280', marginBottom:12 }}>Refaça o passo a passo guiado para revisar ou completar o cadastro desta fazenda.</p>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowOnboarding(true)}>
              <i className="ti ti-player-play" /> Abrir tutorial
            </button>
          </div>

          {/* Todas as fazendas */}
          <div className="card">
            <div className="card-title" style={{ display:'flex', justifyContent:'space-between' }}>
              <span><i className="ti ti-home-2" style={{ color:'#2B6CD9' }} /> Todas as fazendas</span>
              {podeEditarProp && (
                <button className="btn btn-primary btn-xs" onClick={() => openModal('nova-faz')}>
                  <i className="ti ti-plus" /> Nova fazenda
                </button>
              )}
            </div>
            {fazendas.map(f => (
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'.5px solid #F3F4F6' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:f.id===fazendaAtual?.id?600:400, fontSize:'.9rem' }}>{f.nome} {f.id===fazendaAtual?.id && <Badge color="green">Atual</Badge>}</div>
                  {f.localizacao && <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{f.localizacao}</div>}
                </div>
                {f.id !== fazendaAtual?.id && podeEditarProp && (
                  <button className="btn btn-secondary btn-xs" style={{ color:'#E24B4A' }} onClick={() => setConfirmFaz({ acao:'desativar', item:f })}>
                    <i className="ti ti-archive" /> Desativar
                  </button>
                )}
                {f.id === fazendaAtual?.id && fazendas.length > 1 && podeEditarProp && (
                  <button className="btn btn-secondary btn-xs" style={{ color:'#E24B4A' }} onClick={() => { setNomeDeletar(''); setConfirmFaz({ acao:'excluir', item:f }) }}>
                    <i className="ti ti-trash" /> Excluir
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ MODAIS ═══════════════════════════════════════════════ */}
      {/* Proprietário */}
      <Modal open={modal==='prop'} onClose={closeModal} title={form.id?'Editar proprietário':'Novo proprietário'} width={440}>
        <div className="grid-form">
          <Field label="Nome completo" required>
            <input value={form.nome||''} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="Nome completo" />
          </Field>
          <Field label="Inscrição estadual">
            <input value={form.inscricao_estadual||''} onChange={e=>setForm(p=>({...p,inscricao_estadual:e.target.value}))} placeholder="Número da IE" />
          </Field>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={saveProprietario} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check" /> Salvar</>}</button>
          <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
        </div>
      </Modal>

      {/* Piquete */}
      <Modal open={modal==='piq'} onClose={closeModal} title={form.id?'Editar piquete':'Novo piquete'} width={520}>
        <div className="grid-form" style={{ marginBottom:12 }}>
          <Field label="Nome" required>
            <input value={form.nome||''} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="ex: Piquete 04" />
          </Field>
          <Field label="Qualidade da pastagem">
            <input value={form.qualidade_past||''} onChange={e=>setForm(p=>({...p,qualidade_past:e.target.value}))} placeholder="boa, regular, ruim..." />
          </Field>
          <Field label="Tipo de pastagem">
            <input value={form.tipo_pastagem||''} onChange={e=>setForm(p=>({...p,tipo_pastagem:e.target.value}))} placeholder="nativa, tifton..." />
          </Field>
          <Field label="Finalidade">
            <input value={form.finalidade||''} onChange={e=>setForm(p=>({...p,finalidade:e.target.value}))} placeholder="matrizes, bezerros..." />
          </Field>
          <Field label="Status">
            <select value={form.status||'em_uso'} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
              <option value="em_uso">Em uso</option>
              <option value="em_descanso">Em descanso</option>
            </select>
          </Field>
        </div>

        {/* Definição de área */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:'.82rem', fontWeight:600, color:'#374151', marginBottom:8 }}>Definição da área</div>
          <div style={{ display:'flex', gap:6, marginBottom:10 }}>
            {['manual','kml','desenho'].map(m => (
              <button key={m} className={`btn btn-sm ${modoArea===m?'btn-primary':'btn-secondary'}`} onClick={() => setModoArea(m)} style={{ flex:1, fontSize:'.75rem' }}>
                {m==='manual'?'Manual':m==='kml'?'Arquivo KML':'Desenhar no mapa'}
              </button>
            ))}
          </div>

          {modoArea === 'manual' && (
            <Field label="Área (ha)">
              <input type="number" step="0.1" min="0" value={form.area_ha||''} onChange={e=>setForm(p=>({...p,area_ha:e.target.value}))} placeholder="0,0" />
            </Field>
          )}

          {modoArea === 'kml' && (
            <div>
              <Field label="Arquivo KML">
                <input type="file" accept=".kml" onChange={e => e.target.files?.[0] && importarKML(e.target.files[0])} />
              </Field>
              {form.area_ha && (
                <div style={{ background:'#E8F0FC', borderRadius:8, padding:'8px 12px', fontSize:'.82rem', color:'#2B6CD9', fontWeight:600, marginTop:6 }}>
                  Área calculada: {form.area_ha} ha
                </div>
              )}
            </div>
          )}

          {modoArea === 'desenho' && (
            <div>
              {form.geometria ? (
                <div style={{ background:'#E8F0FC', borderRadius:8, padding:'8px 12px', fontSize:'.82rem', color:'#2B6CD9', marginBottom:8 }}>
                  <i className="ti ti-map-2" /> Área desenhada: <strong>{form.area_ha} ha</strong>
                </div>
              ) : (
                <div style={{ fontSize:'.78rem', color:'#6B7280', marginBottom:8 }}>Nenhuma área desenhada ainda.</div>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setMapDesenho(true)}>
                <i className="ti ti-pencil" /> {form.geometria ? 'Reeditar no mapa' : 'Abrir mapa para desenhar'}
              </button>
              {form.area_ha && (
                <Field label="Ajustar área (ha)">
                  <input type="number" step="0.1" value={form.area_ha||''} onChange={e=>setForm(p=>({...p,area_ha:e.target.value}))} />
                </Field>
              )}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={savePiquete} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check" /> Salvar</>}</button>
          <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
        </div>
      </Modal>

      {/* Lote */}
      <Modal open={modal==='lote'} onClose={closeModal} title={form.id?'Editar lote':'Novo lote'} width={480}>
        <div className="grid-form">
          <Field label="Nome" required>
            <input value={form.nome||''} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="ex: Matrizes" />
          </Field>
          <Field label="Finalidade">
            <input value={form.finalidade||''} onChange={e=>setForm(p=>({...p,finalidade:e.target.value}))} placeholder="cria, recria..." />
          </Field>
        </div>
        <Field label="Descrição">
          <textarea rows={3} value={form.descricao||''} onChange={e=>setForm(p=>({...p,descricao:e.target.value}))} placeholder="Descreva o lote..." />
        </Field>
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button className="btn btn-primary" onClick={saveLote} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check" /> Salvar</>}</button>
          <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
        </div>
      </Modal>

      {/* Nova fazenda */}
      <Modal open={modal==='nova-faz'} onClose={closeModal} title="Nova fazenda" width={480}>
        <div className="grid-form">
          <Field label="Nome da fazenda" required>
            <input value={form.nome||''} onChange={e=>setForm(p=>({...p,nome:e.target.value}))} placeholder="ex: Fazenda São João" />
          </Field>
          <Field label="Localização">
            <input value={form.localizacao||''} onChange={e=>setForm(p=>({...p,localizacao:e.target.value}))} placeholder="ex: Corumbá, MS" />
          </Field>
          <Field label="Área total (ha)">
            <input type="number" step="0.1" value={form.area_total||''} onChange={e=>setForm(p=>({...p,area_total:e.target.value}))} />
          </Field>
          <Field label="Área útil (ha)">
            <input type="number" step="0.1" value={form.area_util||''} onChange={e=>setForm(p=>({...p,area_util:e.target.value}))} />
          </Field>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={criarFazenda} disabled={saving}>{saving?'Criando...':<><i className="ti ti-check" /> Criar fazenda</>}</button>
          <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
        </div>
      </Modal>

      {/* Ação de planejamento */}
      <Modal open={modal==='acao'} onClose={closeModal} title={form.id?'Editar ação':'Nova ação'} width={480}>
        <div className="grid-form">
          <Field label="Descrição da ação" required>
            <textarea rows={2} value={form.descricao||''} onChange={e=>setForm(p=>({...p,descricao:e.target.value}))} placeholder="Descreva a ação ou objetivo..." />
          </Field>
          <Field label="Ciclo-alvo (ano início)" required={false}>
            <select value={form.ciclo_alvo||''} onChange={e=>setForm(p=>({...p,ciclo_alvo:e.target.value?parseInt(e.target.value):null}))}>
              <option value="">Sem ciclo definido</option>
              {[0,1,2,3,4].map(i => { const a=cicloAno+i; return <option key={a} value={a}>{a}/{String(a+1).slice(-2)}</option> })}
            </select>
          </Field>
          <Field label="Prazo">
            <input type="date" value={form.prazo||''} onChange={e=>setForm(p=>({...p,prazo:e.target.value}))} />
          </Field>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {podeEditarProp && <button className="btn btn-primary" onClick={saveAcao} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check" /> Salvar</>}</button>}
          <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
        </div>
      </Modal>

      {/* Confirmação de deletar/desativar proprietário */}
      <Confirm
        open={confirmDel?.tipo === 'deletar-prop'}
        onClose={() => setConfirmDel(null)}
        title="Excluir proprietário"
        message={`Excluir "${confirmDel?.item?.nome}" permanentemente? Nenhum dado está vinculado a ele.`}
        danger
        onConfirm={confirmarDeleteProp}
      />
      <Confirm
        open={confirmDel?.tipo === 'desativar-prop'}
        onClose={() => setConfirmDel(null)}
        title="Proprietário com dados vinculados"
        message={`"${confirmDel?.item?.nome}" possui animais vinculados. Não é possível excluir. Deseja desativá-lo? Ele ficará oculto no sistema, mas o histórico será preservado.`}
        onConfirm={confirmarDeleteProp}
      />
      <Confirm
        open={confirmDel?.tipo === 'deletar-piq'}
        onClose={() => setConfirmDel(null)}
        title="Excluir piquete"
        message={`Excluir "${confirmDel?.item?.nome}"? Os animais vinculados perderão o piquete (ficará vazio). Históricos de sanidade e pesagem são preservados.`}
        danger
        onConfirm={async () => {
          const item = confirmDel?.item
          setConfirmDel(null)
          const { error } = await db.piquetes.delete(item.id)
          if (error) { toast('Erro: '+error.message,'error'); return }
          toast('Piquete excluído.'); loadAll()
        }}
      />
      <Confirm
        open={confirmDel?.tipo === 'deletar-lote'}
        onClose={() => setConfirmDel(null)}
        title="Excluir lote"
        message={`Excluir "${confirmDel?.item?.nome}"? Os animais vinculados perderão o lote (ficará vazio). Históricos são preservados.`}
        danger
        onConfirm={async () => {
          const item = confirmDel?.item
          setConfirmDel(null)
          const { error } = await db.lotes.delete(item.id)
          if (error) { toast('Erro: '+error.message,'error'); return }
          toast('Lote excluído.'); loadAll()
        }}
      />

      {/* Confirmação desativar/excluir fazenda */}
      <Confirm
        open={confirmFaz?.acao === 'desativar'}
        onClose={() => setConfirmFaz(null)}
        title="Desativar fazenda"
        message={`Desativar "${confirmFaz?.item?.nome}"? Todos os dados serão preservados. Esta ação é preferida à exclusão permanente.`}
        onConfirm={() => desativarFazenda(confirmFaz.item)}
      />
      {confirmFaz?.acao === 'excluir' && (
        <Modal open={true} onClose={() => setConfirmFaz(null)} title="Excluir fazenda permanentemente" width={480}>
          <div style={{ background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
            <div style={{ fontWeight:600, color:'#7F1D1D', marginBottom:4 }}>⚠️ Ação irreversível</div>
            <div style={{ fontSize:'.82rem', color:'#991B1B' }}>Todos os dados desta fazenda serão apagados permanentemente: animais, financeiro, piquetes, sanidade, pesagens, estoque e histórico.</div>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:'.82rem', color:'#374151', marginBottom:8 }}>
              Digite o nome da fazenda para confirmar: <strong>{confirmFaz.item.nome}</strong>
            </div>
            <input className="input" style={{ width:'100%' }} value={nomeDeletar} onChange={e=>setNomeDeletar(e.target.value)} placeholder={confirmFaz.item.nome} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-sm" style={{ background:'#E24B4A', color:'white' }} onClick={() => excluirFazendaPermanente(confirmFaz.item)} disabled={nomeDeletar!==confirmFaz.item.nome}>
              <i className="ti ti-trash" /> Excluir permanentemente
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmFaz(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Sub-componentes do planejamento ───────────────────────────────
function PlanProposito({ plan, onSave, podeEditar }) {
  const [proposito,  setProposito]  = useState(plan?.dados?.proposito||'')
  const [objetivos,  setObjetivos]  = useState(plan?.dados?.objetivos_longo_prazo||'')
  const [saving,     setSaving]     = useState(false)

  const salvar = async () => {
    setSaving(true)
    await onSave('proposito', proposito)
    await onSave('objetivos_longo_prazo', objetivos)
    setSaving(false)
  }

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-heart" style={{ color:'#E24B4A' }} /> Por quê? — Propósito</div>
      <p style={{ fontSize:'.82rem', color:'#6B7280', marginBottom:14 }}>Defina o propósito da operação e a visão de longo prazo desta fazenda.</p>
      <Field label="Propósito da operação">
        <textarea rows={4} value={proposito} onChange={e=>setProposito(e.target.value)} placeholder="Por que você opera esta fazenda? Qual o legado que quer construir?" />
      </Field>
      <Field label="Objetivos de longo prazo">
        <textarea rows={4} value={objetivos} onChange={e=>setObjetivos(e.target.value)} placeholder="O que você quer alcançar em 5, 10, 20 anos?" />
      </Field>
      {podeEditar && <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving}>{saving?'Salvando...':'Salvar propósito'}</button>}
    </div>
  )
}

function PlanNumeros({ plan, form, setForm, totalHa, resultadoLiquido, cicloAtual, rentTerra, rentRebanho, rentTotal, vTerraEfetivo, vRebanho, vTotal, benchmarks, onSaveValores, saving, podeEditar }) {
  useEffect(() => {
    setForm({
      valor_terra:        plan?.dados?.valor_terra||'',
      valor_ha:           plan?.dados?.valor_ha||'',
      valor_rebanho:      plan?.dados?.valor_rebanho||'',
      valor_benfeitorias: plan?.dados?.valor_benfeitorias||'',
    })
  }, [plan?.id]) // eslint-disable-line

  return (
    <div>
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title"><i className="ti ti-calculator" style={{ color:'#0C447C' }} /> O quê? — Valores da propriedade</div>
        <p style={{ fontSize:'.82rem', color:'#6B7280', marginBottom:14 }}>Informe o valor de mercado para calcular a rentabilidade do negócio.</p>
        <div className="grid-form">
          <Field label="Valor da terra (R$) — ou deixe vazio e use R$/ha">
            <input type="number" step="1000" value={form.valor_terra||''} onChange={e=>setForm(p=>({...p,valor_terra:e.target.value}))} placeholder="ex: 4600000" />
          </Field>
          <Field label={`Valor por hectare (R$/ha) — área: ${totalHa.toFixed(1)} ha`}>
            <input type="number" step="100" value={form.valor_ha||''} onChange={e=>setForm(p=>({...p,valor_ha:e.target.value}))} placeholder="ex: 50000" />
          </Field>
          <Field label="Valor do rebanho (R$)">
            <input type="number" step="1000" value={form.valor_rebanho||''} onChange={e=>setForm(p=>({...p,valor_rebanho:e.target.value}))} placeholder="ex: 800000" />
          </Field>
          <Field label="Valor de benfeitorias (R$)">
            <input type="number" step="1000" value={form.valor_benfeitorias||''} onChange={e=>setForm(p=>({...p,valor_benfeitorias:e.target.value}))} placeholder="opcional" />
          </Field>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {podeEditar && <button className="btn btn-primary btn-sm" onClick={onSaveValores} disabled={saving}>{saving?'Salvando...':'Salvar valores'}</button>}
        </div>
      </div>

      {/* Rentabilidade calculada */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-title"><i className="ti ti-trending-up" style={{ color:'#1E55B0' }} /> Rentabilidade calculada — ciclo {cicloAtual?.nome||'atual'}</div>
        {resultadoLiquido === null ? (
          <div style={{ fontSize:'.82rem', color:'#9CA3AF' }}>Sem ciclo financeiro ativo. Acesse Gestão Financeira para criar um ciclo.</div>
        ) : (
          <div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginBottom:4 }}>RESULTADO LÍQUIDO DO CICLO</div>
              <div style={{ fontSize:'1.6rem', fontWeight:700, color:resultadoLiquido>=0?'#2B6CD9':'#E24B4A' }}>{fmtMoeda(resultadoLiquido)}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
              {[
                { label:'RENT. DA TERRA',       valor:rentTerra,   tip:'Resultado ÷ valor da terra' },
                { label:'RENT. DO REBANHO',      valor:rentRebanho, tip:'Resultado ÷ valor do rebanho' },
                { label:'RENT. DA PROPRIEDADE',  valor:rentTotal,   tip:'Resultado ÷ valor total' },
              ].map(r => (
                <div key={r.label} style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ fontSize:'.68rem', color:'#9CA3AF', marginBottom:4 }}>{r.label}</div>
                  {r.valor !== null
                    ? <div style={{ fontSize:'1.4rem', fontWeight:700, color:r.valor>=0?'#2B6CD9':'#E24B4A' }}>{r.valor.toFixed(2)}%</div>
                    : <div style={{ fontSize:'.82rem', color:'#9CA3AF' }}>—<br/><span style={{ fontSize:'.7rem' }}>Informe o valor acima</span></div>
                  }
                </div>
              ))}
            </div>

            {benchmarks.length > 0 && (
              <div className="grid-2">
                <GraficoBenchmark titulo="Rentabilidade da terra vs benchmarks RS" valorFazenda={rentTerra} benchmarks={benchmarks} tipo="terra" />
                <GraficoBenchmark titulo="Rentabilidade do rebanho vs benchmarks RS" valorFazenda={rentRebanho} benchmarks={benchmarks} tipo="rebanho" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resumo dos valores */}
      {vTotal > 0 && (
        <div className="card">
          <div className="card-title"><i className="ti ti-coins" /> Patrimônio estimado</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            {vTerraEfetivo > 0 && <div style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 14px' }}><div style={{ fontSize:'.72rem', color:'#9CA3AF' }}>TERRA</div><div style={{ fontWeight:600, color:'#2B6CD9' }}>{fmtMoeda(vTerraEfetivo)}</div></div>}
            {vRebanho > 0 && <div style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 14px' }}><div style={{ fontSize:'.72rem', color:'#9CA3AF' }}>REBANHO</div><div style={{ fontWeight:600, color:'#2B6CD9' }}>{fmtMoeda(vRebanho)}</div></div>}
            {(plan?.dados?.valor_benfeitorias > 0) && <div style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 14px' }}><div style={{ fontSize:'.72rem', color:'#9CA3AF' }}>BENFEITORIAS</div><div style={{ fontWeight:600, color:'#2B6CD9' }}>{fmtMoeda(plan.dados.valor_benfeitorias)}</div></div>}
            <div style={{ background:'#E8F0FC', border:'.5px solid #A5C8F5', borderRadius:8, padding:'8px 14px' }}><div style={{ fontSize:'.72rem', color:'#1E55B0' }}>TOTAL</div><div style={{ fontWeight:700, color:'#2B6CD9', fontSize:'1.05rem' }}>{fmtMoeda(vTotal)}</div></div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlanPratica({ acoesPend, acoesConcl, acoesCiclo, cicloAno, onToggle, onDelete, onAdd, onEdit, podeEditar }) {
  const [mostrarConcl, setMostrarConcl] = useState(false)
  const [mostrarTodas, setMostrarTodas] = useState(false)

  const AcaoRow = ({ a }) => (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom:'.5px solid #F3F4F6' }}>
      <input type="checkbox" checked={a.status==='concluida'} onChange={podeEditar ? () => onToggle(a) : undefined} disabled={!podeEditar} style={{ cursor: podeEditar ? 'pointer' : 'default', marginTop:3, flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'.86rem', color:'#111827', textDecoration:a.status==='concluida'?'line-through':'none' }}>{a.descricao}</div>
        <div style={{ display:'flex', gap:8, marginTop:3, flexWrap:'wrap' }}>
          {a.ciclo_alvo && <Badge color="blue">Ciclo {a.ciclo_alvo}/{String(a.ciclo_alvo+1).slice(-2)}</Badge>}
          {a.prazo      && <Badge color="amber">Prazo: {new Date(a.prazo+'T12:00').toLocaleDateString('pt-BR')}</Badge>}
          {a.concluida_em && <span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>Concluída em {new Date(a.concluida_em).toLocaleDateString('pt-BR')}</span>}
        </div>
      </div>
      {podeEditar && (
        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
          <button className="btn btn-secondary btn-xs" onClick={() => onEdit(a)}><i className="ti ti-edit" /></button>
          <button className="btn btn-secondary btn-xs" style={{ color:'#E24B4A' }} onClick={() => onDelete(a.id)}><i className="ti ti-trash" /></button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div className="card-title" style={{ margin:0 }}><i className="ti ti-list-check" style={{ color:'#0C447C' }} /> Como? — Ações futuras</div>
          {podeEditar && <button className="btn btn-primary btn-sm" onClick={onAdd}><i className="ti ti-plus" /> Adicionar ação</button>}
        </div>

        {/* Ações do ciclo atual */}
        {acoesCiclo.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:'.78rem', fontWeight:600, color:'#0C447C', marginBottom:6 }}>
              <i className="ti ti-calendar" style={{ marginRight:5 }} />Objetivos do ciclo {cicloAno}/{String(cicloAno+1).slice(-2)}
            </div>
            {acoesCiclo.map(a => <AcaoRow key={a.id} a={a} />)}
          </div>
        )}

        {/* A concluir */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', marginBottom:6 }}>
            A concluir ({acoesPend.length})
          </div>
          {acoesPend.length === 0
            ? <div style={{ fontSize:'.82rem', color:'#9CA3AF' }}>Nenhuma ação pendente.</div>
            : acoesPend.map(a => <AcaoRow key={a.id} a={a} />)
          }
        </div>

        {/* Concluídas */}
        {acoesConcl.length > 0 && (
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setMostrarConcl(o=>!o)} style={{ marginBottom:8 }}>
              <i className={`ti ti-chevron-${mostrarConcl?'up':'down'}`} /> Concluídas ({acoesConcl.length})
            </button>
            {mostrarConcl && acoesConcl.map(a => <AcaoRow key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}
