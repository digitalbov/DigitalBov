import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFazenda } from '../lib/FazendaContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import { fmtMoeda, calcCategoria, calcTaxaPrenhez, contarExpostas, contarPrenhas, contarMatrizes, somaFinita, algumErro } from '../lib/helpers'
import { Loading, EmptyState, SeletorCicloLocal, AlertBox } from '../components/UI'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'

export default function Comparativo() {
  const { fazendas } = useFazenda()
  const [tab,     setTab]     = useState('financeiro')
  const [dados,   setDados]   = useState([])
  const [loading, setLoading] = useState(true)
  const [temErro, setTemErro] = useState(false)

  // Seletor de ciclo LOCAL desta tela. Como cada fazenda tem seus próprios
  // registros de ciclos_financeiros, o alinhamento entre fazendas é feito
  // pelo NOME do ciclo (ex: "2025/26"), não pelo id.
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()

  useEffect(() => {
    if (fazendas.length < 2 || !cicloLocal) { setLoading(false); return }
    loadComparativo()
  }, [fazendas.length, cicloLocal?.nome])

  const loadComparativo = async () => {
    setLoading(true)
    const resultados = await Promise.all(fazendas.map(f => carregarFazenda(f, cicloLocal.nome)))
    setDados(resultados)
    setTemErro(resultados.some(d => d.erroFazenda))
    setLoading(false)
  }

  const carregarFazenda = async (fazenda, nomeCiclo) => {
    const fid = fazenda.id
    let erroFazenda = false

    const base = await Promise.all([
      supabase.from('animais').select('*').eq('fazenda_id', fid).eq('situacao', 'ativo'),
      supabase.from('ciclos_financeiros').select('*').eq('fazenda_id', fid).eq('nome', nomeCiclo).maybeSingle(),
      supabase.from('piquetes').select('area_ha').eq('fazenda_id', fid),
    ])
    if (algumErro(`[Comparativo] "${fazenda.nome}":`, base)) erroFazenda = true
    const [rAnimais, rCiclo, rPiqs] = base

    const animais = rAnimais.data || []
    const ciclo   = rCiclo.data
    const piqs    = rPiqs.data || []

    let lancamentos = [], transacoes = [], inseminacoes = []
    if (ciclo) {
      const doCiclo = await Promise.all([
        supabase.from('lancamentos_financeiros').select('tipo,valor').eq('ciclo_id', ciclo.id).eq('fazenda_id', fid),
        supabase.from('transacoes_animais').select('tipo,valor_total').eq('ciclo_id', ciclo.id).eq('fazenda_id', fid),
        supabase.from('lotes_inseminacao').select('inseminacoes(animal_id,diagnostico)').eq('ciclo_id', ciclo.id).eq('fazenda_id', fid),
      ])
      if (algumErro(`[Comparativo] "${fazenda.nome}":`, doCiclo)) erroFazenda = true
      const [rL, rT, rLI] = doCiclo
      lancamentos   = rL.data || []
      transacoes    = rT.data || []
      inseminacoes  = (rLI.data || []).flatMap(l => l.inseminacoes || [])
    }

    // Receitas/despesas: lançamentos usam a coluna `valor`, transações de
    // animais usam `valor_total` — cada origem soma o campo certo (helpers.somaFinita,
    // protegido com Number.isFinite para não deixar NaN contaminar o total).
    const receitas  = somaFinita(lancamentos.filter(l => l.tipo === 'R'), 'valor')
                     + somaFinita(transacoes.filter(t => t.tipo === 'V'), 'valor_total')
    const despesas  = somaFinita(lancamentos.filter(l => l.tipo === 'D'), 'valor')
                     + somaFinita(transacoes.filter(t => t.tipo === 'C'), 'valor_total')
    const resultado = receitas - despesas
    const totalHa   = piqs.reduce((s,p) => s + parseFloat(p.area_ha||0), 0)

    const cats = {}
    animais.forEach(a => {
      const c = calcCategoria(a.data_nascimento, a.sexo)
      cats[c] = (cats[c]||0) + 1
    })

    const matrizes = contarMatrizes(animais)

    // Taxa de prenhez: fórmula oficial única (helpers.calcTaxaPrenhez), a partir
    // das inseminações do ciclo — mesma fonte usada em Dashboard/Reprodutivo/Rebanho,
    // em vez do campo sit_reprodutiva/contagem de matrizes. prenhas deduplica por
    // animal_id (contarPrenhas), senão a coluna não bate com Tx. Prenhez ao lado.
    const expostas  = contarExpostas(inseminacoes)
    const prenhas   = contarPrenhas(inseminacoes)
    const txPrenhez = calcTaxaPrenhez(inseminacoes) ?? 0

    return {
      fazenda,
      ciclo,
      receitas,
      despesas,
      resultado,
      totalHa,
      animais:    animais.length,
      matrizes,
      expostas,
      prenhas,
      txPrenhez,
      cats,
      erroFazenda,
    }
  }

  if (loading) return <Loading text="Carregando comparativo..." />

  if (fazendas.length < 2) {
    return (
      <EmptyState
        icon="🏡"
        title="Apenas uma fazenda cadastrada"
        sub="Cadastre uma segunda fazenda em Propriedade → Configurações para ver o comparativo."
      />
    )
  }

  // ── Dados dos gráficos ────────────────────────────────────────
  const dadosFinanceiros = dados.map(d => ({
    name:      d.fazenda.nome.split(' ').slice(-1)[0],
    Receitas:  d.receitas,
    Despesas:  d.despesas,
    Resultado: d.resultado,
  }))

  const dadosZootecnicos = dados.map(d => ({
    name:       d.fazenda.nome.split(' ').slice(-1)[0],
    'Animais':  d.animais,
    'Matrizes': d.matrizes,
    'Prenhas':  d.prenhas,
  }))

  const totalRec  = dados.reduce((s,d) => s + d.receitas,  0)
  const totalDesp = dados.reduce((s,d) => s + d.despesas,  0)
  const totalResu = dados.reduce((s,d) => s + d.resultado, 0)
  const totalAnim = dados.reduce((s,d) => s + d.animais,   0)

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      {temErro && (
        <AlertBox type="amber" icon="ti-alert-triangle" title="Alguns dados podem estar incompletos"
          body="Não foi possível carregar todas as informações de uma ou mais fazendas. Veja o console para detalhes ou tente recarregar a página." />
      )}

      {/* Resumo consolidado */}
      <div className="grid-4" style={{ marginBottom:24 }}>
        {[
          { icon:'💰', label:'Receitas totais',    value:fmtMoeda(totalRec),  color:'#1E55B0', bg:'#E8F0FC' },
          { icon:'📉', label:'Despesas totais',    value:fmtMoeda(totalDesp), color:'#791F1F', bg:'#FEF2F2' },
          { icon:'📊', label:'Resultado consolidado', value:fmtMoeda(totalResu), color:totalResu>=0?'#2B6CD9':'#E24B4A', bg:totalResu>=0?'#E8F0FC':'#FEF2F2' },
          { icon:'🐄', label:'Animais ativos',      value:totalAnim,           color:'#0C447C', bg:'#E6F1FB' },
        ].map(k => (
          <div key={k.label} className="card" style={{ borderTop:`3px solid ${k.color}` }}>
            <div style={{ width:36,height:36,borderRadius:8,background:k.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',marginBottom:10 }}>{k.icon}</div>
            <div style={{ fontSize:'1.3rem', fontWeight:700, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:'.76rem', color:'#6B7280', marginTop:4 }}>{k.label}</div>
            <div style={{ fontSize:'.7rem', color:'#9CA3AF', marginTop:2 }}>{fazendas.length} fazendas combinadas</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'#F3F4F6', borderRadius:10, padding:4 }}>
        {[
          { id:'financeiro',   label:'Financeiro',    icon:'ti-cash' },
          { id:'zootecnico',   label:'Zootécnico',    icon:'ti-activity' },
          { id:'fazendas',     label:'Por fazenda',   icon:'ti-home-2' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:'8px 12px', borderRadius:8, border:'none', cursor:'pointer',
            background:tab===t.id?'white':'transparent',
            fontWeight:tab===t.id?600:400, color:tab===t.id?'#2B6CD9':'#6B7280',
            fontSize:'.8rem', boxShadow:tab===t.id?'0 1px 4px rgba(0,0,0,.1)':'none',
            fontFamily:'inherit',
          }}>
            <i className={`ti ${t.icon}`} style={{ marginRight:5 }} />{t.label}
          </button>
        ))}
      </div>

      {/* Tab Financeiro */}
      {tab === 'financeiro' && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-title"><i className="ti ti-cash" style={{ color:'#1E55B0' }} /> Receitas × Despesas × Resultado</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dadosFinanceiros} margin={{ top:4, right:16, bottom:4, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={{ fontSize:11 }} />
                <YAxis tick={{ fontSize:11 }} tickFormatter={v => v>=1000?`${(v/1000).toFixed(0)}k`:v} />
                <Tooltip formatter={(v,n) => [fmtMoeda(v), n]} />
                <Legend />
                <Bar dataKey="Receitas"  fill="#4ADE80" radius={[4,4,0,0]} />
                <Bar dataKey="Despesas"  fill="#F87171" radius={[4,4,0,0]} />
                <Bar dataKey="Resultado" fill="#60A5FA" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela comparativa */}
          <div className="card">
            <div className="card-title"><i className="ti ti-table" /> Tabela financeira</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.82rem' }}>
                <thead>
                  <tr style={{ background:'#F9FAFB' }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#374151' }}>Fazenda</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Receitas</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Despesas</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Resultado</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Ciclo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.map((d,i) => (
                    <tr key={d.fazenda.id} style={{ borderTop:'.5px solid #F3F4F6', background:i%2?'#FAFAFA':'white' }}>
                      <td style={{ padding:'8px 12px', fontWeight:500 }}>{d.fazenda.nome}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'#1E55B0' }}>{fmtMoeda(d.receitas)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'#791F1F' }}>{fmtMoeda(d.despesas)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:d.resultado>=0?'#2B6CD9':'#E24B4A' }}>{fmtMoeda(d.resultado)}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'#9CA3AF' }}>{d.ciclo?.nome || '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop:'2px solid #E5E7EB', fontWeight:700 }}>
                    <td style={{ padding:'8px 12px' }}>TOTAL</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:'#1E55B0' }}>{fmtMoeda(totalRec)}</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:'#791F1F' }}>{fmtMoeda(totalDesp)}</td>
                    <td style={{ padding:'8px 12px', textAlign:'right', color:totalResu>=0?'#2B6CD9':'#E24B4A' }}>{fmtMoeda(totalResu)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Zootécnico */}
      {tab === 'zootecnico' && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-title"><i className="ti ti-activity" style={{ color:'#3C3489' }} /> Rebanho ativo por fazenda</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dadosZootecnicos} margin={{ top:4, right:16, bottom:4, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={{ fontSize:11 }} />
                <YAxis tick={{ fontSize:11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Animais"  fill="#4ADE80" radius={[4,4,0,0]} />
                <Bar dataKey="Matrizes" fill="#60A5FA" radius={[4,4,0,0]} />
                <Bar dataKey="Prenhas"  fill="#F472B6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title"><i className="ti ti-table" /> Índices zootécnicos</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.82rem' }}>
                <thead>
                  <tr style={{ background:'#F9FAFB' }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#374151' }}>Fazenda</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Animais</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Matrizes</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Expostas</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Prenhas</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Tx. Prenhez</th>
                    <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:'#374151' }}>Área (ha)</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.map((d,i) => (
                    <tr key={d.fazenda.id} style={{ borderTop:'.5px solid #F3F4F6', background:i%2?'#FAFAFA':'white' }}>
                      <td style={{ padding:'8px 12px', fontWeight:500 }}>{d.fazenda.nome}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right' }}>{d.animais}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right' }}>{d.matrizes}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right' }}>{d.expostas}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right' }}>{d.prenhas}</td>
                      <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:600, color:d.txPrenhez>=85?'#2B6CD9':'#D97706' }}>{d.txPrenhez}%</td>
                      <td style={{ padding:'8px 12px', textAlign:'right' }}>{d.totalHa.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Por fazenda */}
      {tab === 'fazendas' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
            {dados.map(d => (
              <div key={d.fazenda.id} className="card" style={{ borderTop:'3px solid #2B6CD9' }}>
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontWeight:600, fontSize:'1rem', color:'#111827' }}>{d.fazenda.nome}</div>
                  {d.fazenda.localizacao && <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{d.fazenda.localizacao}</div>}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:8, marginBottom:12 }}>
                  {[
                    { l:'Receitas',   v:fmtMoeda(d.receitas),   c:'#1E55B0' },
                    { l:'Despesas',   v:fmtMoeda(d.despesas),   c:'#791F1F' },
                    { l:'Resultado',  v:fmtMoeda(d.resultado),  c:d.resultado>=0?'#2B6CD9':'#E24B4A' },
                    { l:'Animais',    v:d.animais,               c:'#0C447C' },
                    { l:'Matrizes',   v:d.matrizes,              c:'#374151' },
                    { l:'Tx. Prenhez',v:`${d.txPrenhez}%`,       c:d.txPrenhez>=85?'#2B6CD9':'#D97706' },
                  ].map(k => (
                    <div key={k.l} style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ fontSize:'.68rem', color:'#9CA3AF' }}>{k.l.toUpperCase()}</div>
                      <div style={{ fontWeight:600, color:k.c, fontSize:'.9rem' }}>{k.v}</div>
                    </div>
                  ))}
                </div>

                {d.totalHa > 0 && (
                  <div style={{ fontSize:'.78rem', color:'#6B7280' }}>
                    <i className="ti ti-map" style={{ marginRight:4 }} />{d.totalHa.toFixed(1)} ha em piquetes
                  </div>
                )}
                {d.ciclo && (
                  <div style={{ fontSize:'.78rem', color:'#6B7280', marginTop:2 }}>
                    <i className="ti ti-calendar" style={{ marginRight:4 }} />Ciclo: {d.ciclo.nome}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
