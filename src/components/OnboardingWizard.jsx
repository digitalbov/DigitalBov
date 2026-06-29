import { useState, useEffect } from 'react'
import { supabase, db } from '../lib/supabase'
import { toast, Field } from './UI'

const PASSOS = [
  { id:1, titulo:'Dados da fazenda',     icon:'🏡', desc:'Confirme as informações básicas da sua fazenda.' },
  { id:2, titulo:'Valor da propriedade', icon:'💰', desc:'Informe os valores para calcular rentabilidade.' },
  { id:3, titulo:'Proprietários',        icon:'👤', desc:'Cadastre os donos vinculados a esta fazenda.' },
  { id:4, titulo:'Piquetes',             icon:'🌿', desc:'Registre as áreas de pastagem. Você pode desenhar no mapa depois.' },
  { id:5, titulo:'Lotes',                icon:'📦', desc:'Crie lotes para organizar o rebanho por categoria ou finalidade.' },
  { id:6, titulo:'Animais',              icon:'🐄', desc:'Importe ou cadastre seus animais. Este passo pode ser feito depois.' },
  { id:7, titulo:'Planejamento',         icon:'🎯', desc:'Defina o propósito e as metas estratégicas da fazenda.' },
]

export default function OnboardingWizard({ fazendaId, onClose }) {
  const [passo,   setPasso]   = useState(1)
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)
  const [qtdProprietarios, setQtdProprietarios] = useState(0)
  const [contaId, setContaId] = useState(null)

  useEffect(() => {
    supabase.from('fazendas').select('conta_id').eq('id', fazendaId).maybeSingle()
      .then(({ data }) => { if (data) setContaId(data.conta_id) })
  }, [fazendaId])

  useEffect(() => {
    let ativo = true
    db.proprietarios.list().then(({ data }) => {
      if (ativo) setQtdProprietarios((data || []).length)
    })
    return () => { ativo = false }
  }, [])

  const total   = PASSOS.length
  const atual   = PASSOS[passo - 1]
  const progPct = Math.round((passo / total) * 100)

  const proxPasso = () => {
    if (passo === 3 && qtdProprietarios === 0) {
      toast('Cadastre ao menos um proprietário para continuar', 'error')
      return
    }
    if (passo < total) setPasso(p => p+1)
  }
  const voltarPasso = () => { if (passo > 1) setPasso(p => p-1) }

  const concluir = async () => {
    setSaving(true)
    await db.fazendas.update(fazendaId, { onboarding_concluido: true })
    setSaving(false)
    toast('Tutorial concluído! Bem-vindo ao sistema.')
    onClose()
  }

  const pularTudo = async () => {
    if (qtdProprietarios === 0) { toast('Cadastre ao menos um proprietário antes de pular', 'error'); return }
    await db.fazendas.update(fazendaId, { onboarding_concluido: true })
    toast('Tutorial pulado. Você pode reabri-lo em Propriedade → Configurações.')
    onClose()
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:8888,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16,
    }}>
      <div style={{
        background:'white', borderRadius:20, width:'100%', maxWidth:520,
        maxHeight:'92vh', overflowY:'auto', boxShadow:'0 24px 80px rgba(0,0,0,.35)',
      }}>
        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg,#1E4D35 0%,#27500A 100%)',
          borderRadius:'20px 20px 0 0', padding:'24px 28px',
          color:'white',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.55)', fontWeight:500, letterSpacing:'.04em' }}>
                PASSO {passo} DE {total}
              </div>
              <div style={{ fontSize:'1.35rem', fontWeight:700, marginTop:4 }}>
                {atual.icon} {atual.titulo}
              </div>
              <div style={{ fontSize:'.82rem', color:'rgba(255,255,255,.65)', marginTop:4 }}>
                {atual.desc}
              </div>
            </div>
            <button onClick={pularTudo} style={{
              background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.2)',
              borderRadius:8, padding:'6px 12px', color:'rgba(255,255,255,.7)',
              cursor:'pointer', fontFamily:'inherit', fontSize:'.75rem', flexShrink:0,
            }}>
              Pular tudo
            </button>
          </div>

          {/* Barra de progresso */}
          <div style={{ background:'rgba(255,255,255,.2)', borderRadius:99, height:6 }}>
            <div style={{
              background:'white', borderRadius:99, height:6,
              width:`${progPct}%`, transition:'width .35s ease',
            }} />
          </div>
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            {PASSOS.map(p => (
              <button
                key={p.id}
                onClick={() => setPasso(p.id)}
                style={{
                  width:28, height:28, borderRadius:'50%', border:'none', cursor:'pointer',
                  background: p.id < passo ? '#C0DD97' : p.id === passo ? 'white' : 'rgba(255,255,255,.2)',
                  color:      p.id < passo ? '#1E4D35' : p.id === passo ? '#1E4D35' : 'rgba(255,255,255,.5)',
                  fontWeight: p.id === passo ? 700 : 400, fontSize:'.75rem', display:'flex',
                  alignItems:'center', justifyContent:'center', flexShrink:0,
                  fontFamily:'inherit',
                }}
              >
                {p.id < passo ? '✓' : p.id}
              </button>
            ))}
          </div>
        </div>

        {/* Corpo do passo */}
        <div style={{ padding:'28px 28px' }}>
          <PassoConteudo passo={passo} form={form} setForm={setForm} fazendaId={fazendaId}
            contaId={contaId}
            qtdProprietarios={qtdProprietarios} setQtdProprietarios={setQtdProprietarios} />
        </div>

        {/* Footer */}
        <div style={{
          padding:'0 28px 24px', display:'flex',
          justifyContent:'space-between', alignItems:'center',
        }}>
          <button
            onClick={voltarPasso}
            disabled={passo === 1}
            style={{
              background:'none', border:'.5px solid #E5E7EB', borderRadius:8,
              padding:'8px 18px', cursor:passo===1?'default':'pointer', color:passo===1?'#D1D5DB':'#374151',
              fontFamily:'inherit', fontSize:'.85rem',
            }}
          >
            <i className="ti ti-arrow-left" style={{ marginRight:6 }} />Voltar
          </button>

          <div style={{ display:'flex', gap:8 }}>
            <button
              onClick={proxPasso}
              disabled={passo === total || (passo === 3 && qtdProprietarios === 0)}
              style={{
                background:passo===total?'#E5E7EB':'#F3F4F6',
                border:'none', borderRadius:8, padding:'8px 18px',
                cursor:passo===total?'default':'pointer', color:passo===total?'#9CA3AF':'#374151',
                fontFamily:'inherit', fontSize:'.85rem',
              }}
            >
              Pular este passo <i className="ti ti-arrow-right" style={{ marginLeft:4 }} />
            </button>

            {passo < total ? (
              <button
                className="btn btn-primary"
                onClick={proxPasso}
              >
                Próximo <i className="ti ti-arrow-right" style={{ marginLeft:4 }} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={concluir}
                disabled={saving}
              >
                {saving ? 'Concluindo...' : <><i className="ti ti-check" style={{ marginRight:5 }} />Concluir tutorial</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Conteúdo por passo ────────────────────────────────────────────
function PassoConteudo({ passo, form, setForm, fazendaId, contaId, qtdProprietarios, setQtdProprietarios }) {
  const [saving, setSaving] = useState(false)
  const [items,  setItems]  = useState([])
  const [novoNome, setNovoNome] = useState('')

  useEffect(() => {
    const map = { 3:'proprietarios', 4:'piquetes', 5:'lotes' }
    const tabela = map[passo]
    if (!tabela) { setItems([]); return }
    let ativo = true
    supabase.from(tabela).select('*').eq('fazenda_id', fazendaId)
      .then(({ data }) => { if (ativo) setItems(data || []) })
    return () => { ativo = false }
  }, [passo])

  const addItem = async (tabela, payload) => {
    setSaving(true)
    const insertData = { ...payload, fazenda_id: fazendaId }
    if (contaId) insertData.conta_id = contaId
    const { error } = await db[tabela].insert(insertData)
    setSaving(false)
    if (error) { toast('Erro: '+error.message, 'error'); return }
    toast('Adicionado!')
    setNovoNome('')
    const { data } = await supabase.from(tabela).select('*').eq('fazenda_id', fazendaId)
    setItems(data || [])
    if (tabela === 'proprietarios' && setQtdProprietarios) setQtdProprietarios((data || []).length)
  }

  if (passo === 1) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:20, lineHeight:1.6 }}>
        Sua fazenda já foi criada. Neste passo você pode confirmar os dados básicos.
        Para editar, acesse <strong>Propriedade → Configurações</strong> a qualquer momento.
      </p>
      <div style={{ background:'#EAF3DE', borderRadius:12, padding:'16px 18px' }}>
        <div style={{ fontWeight:600, color:'#1E4D35', marginBottom:8 }}>
          <i className="ti ti-home-2" style={{ marginRight:6 }} />Fazenda cadastrada
        </div>
        <p style={{ fontSize:'.82rem', color:'#374151' }}>
          Os dados da fazenda (nome, localização, área) podem ser editados a qualquer momento
          em <strong>Propriedade → Configurações da fazenda</strong>.
        </p>
      </div>
    </div>
  )

  if (passo === 2) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:20, lineHeight:1.6 }}>
        Informe os valores para calcular a rentabilidade no Planejamento.
        Você pode preencher isso depois em <strong>Propriedade → Planejamento → O quê?</strong>
      </p>
      <div style={{ background:'#E6F1FB', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
        <div style={{ fontSize:'.78rem', color:'#0C447C', fontWeight:600 }}>
          <i className="ti ti-info-circle" style={{ marginRight:5 }} />
          Esses valores são usados para calcular a rentabilidade da terra e do rebanho
          em comparação com os benchmarks do RS (Scot/NESPro).
        </div>
      </div>
      <div className="grid-form">
        <Field label="Valor da terra (R$)">
          <input type="number" step="1000" value={form.valor_terra||''} onChange={e=>setForm(p=>({...p,valor_terra:e.target.value}))} placeholder="ex: 4.600.000" />
        </Field>
        <Field label="Ou: Valor por hectare (R$/ha)">
          <input type="number" step="100" value={form.valor_ha||''} onChange={e=>setForm(p=>({...p,valor_ha:e.target.value}))} placeholder="ex: 50.000" />
        </Field>
        <Field label="Valor do rebanho (R$)">
          <input type="number" step="1000" value={form.valor_rebanho||''} onChange={e=>setForm(p=>({...p,valor_rebanho:e.target.value}))} placeholder="ex: 800.000" />
        </Field>
      </div>
    </div>
  )

  if (passo === 3) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:16, lineHeight:1.6 }}>
        Adicione os proprietários desta fazenda. Eles ficam vinculados aos animais e lançamentos financeiros.
      </p>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input
          placeholder="Nome do proprietário"
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          style={{ flex:1 }}
          className="input"
          onKeyDown={e => e.key==='Enter' && novoNome && addItem('proprietarios', { nome:novoNome })}
        />
        <button className="btn btn-primary btn-sm" disabled={!novoNome||saving} onClick={() => addItem('proprietarios',{ nome:novoNome })}>
          <i className="ti ti-plus" />
        </button>
      </div>
      {items.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
          {items.map(it => (
            <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, fontSize:'.83rem' }}>
              <span style={{ color:'#1E4D35' }}>✓</span> {it.nome}
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize:'.75rem', color: qtdProprietarios === 0 ? '#DC2626' : '#9CA3AF' }}>
        {qtdProprietarios === 0 ? 'Obrigatório: cadastre ao menos um proprietário para continuar.' : 'Você pode adicionar mais depois em Propriedade → Proprietários.'}
      </p>
    </div>
  )

  if (passo === 4) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:16, lineHeight:1.6 }}>
        Cadastre as divisões de pastagem (piquetes). A área pode ser desenhada no mapa depois.
      </p>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input
          placeholder="Nome do piquete (ex: Piquete 01)"
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          style={{ flex:1 }}
          className="input"
          onKeyDown={e => e.key==='Enter' && novoNome && addItem('piquetes', { nome:novoNome, status:'em_uso', area_ha:0 })}
        />
        <button className="btn btn-primary btn-sm" disabled={!novoNome||saving} onClick={() => addItem('piquetes',{ nome:novoNome, status:'em_uso', area_ha:0 })}>
          <i className="ti ti-plus" />
        </button>
      </div>
      {items.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
          {items.map(it => (
            <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, fontSize:'.83rem' }}>
              <span style={{ color:'#1E4D35' }}>✓</span> {it.nome}
            </div>
          ))}
        </div>
      )}
      <div style={{ background:'#EAF3DE', borderRadius:8, padding:'8px 12px', fontSize:'.78rem', color:'#1E4D35' }}>
        <i className="ti ti-info-circle" style={{ marginRight:4 }} />
        Geometria e área podem ser definidas depois em <strong>Propriedade → Piquetes</strong> usando o mapa ou importando um arquivo KML.
      </div>
    </div>
  )

  if (passo === 5) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:16, lineHeight:1.6 }}>
        Lotes agrupam animais por categoria (matrizes, bezerros, etc.) ou finalidade (cria, recria).
      </p>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input
          placeholder="Nome do lote (ex: Matrizes)"
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          style={{ flex:1 }}
          className="input"
          onKeyDown={e => e.key==='Enter' && novoNome && addItem('lotes',{ nome:novoNome })}
        />
        <button className="btn btn-primary btn-sm" disabled={!novoNome||saving} onClick={() => addItem('lotes',{ nome:novoNome })}>
          <i className="ti ti-plus" />
        </button>
      </div>
      {items.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
          {items.map(it => (
            <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, fontSize:'.83rem' }}>
              <span style={{ color:'#1E4D35' }}>✓</span> {it.nome}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (passo === 6) return (
    <div>
      <div style={{ textAlign:'center', padding:'20px 0' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>🐄</div>
        <p style={{ fontSize:'.9rem', color:'#374151', fontWeight:600, marginBottom:8 }}>
          Animais são cadastrados no módulo específico
        </p>
        <p style={{ fontSize:'.82rem', color:'#6B7280', lineHeight:1.6 }}>
          Acesse <strong>Cadastro de Animais</strong> no menu lateral para registrar os animais
          individualmente com todos os dados zootécnicos.
        </p>
        <div style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:10, padding:'12px 14px', marginTop:16, textAlign:'left' }}>
          <div style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', marginBottom:6 }}>O que você pode registrar:</div>
          {['Brinco, nome, data de nascimento', 'Raça, categoria e proprietário', 'Situação reprodutiva', 'Vínculo com lote e piquete'].map(item => (
            <div key={item} style={{ fontSize:'.78rem', color:'#6B7280', display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <span style={{ color:'#1E4D35' }}>✓</span> {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (passo === 7) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:20, lineHeight:1.6 }}>
        O planejamento estratégico tem 3 camadas: <strong>Por quê</strong> (propósito),
        <strong> O quê</strong> (números e rentabilidade) e <strong>Como</strong> (ações práticas).
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {[
          { emoji:'❤️', titulo:'Por quê — Propósito', desc:'Defina o motivo da operação e a visão de longo prazo.' },
          { emoji:'📊', titulo:'O quê — Números', desc:'Calcule automaticamente a rentabilidade comparado aos benchmarks do RS.' },
          { emoji:'✅', titulo:'Como — Prática', desc:'Liste as ações futuras com ciclo-alvo e acompanhe o progresso.' },
        ].map(item => (
          <div key={item.titulo} style={{ display:'flex', gap:12, background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:10, padding:'12px 14px' }}>
            <span style={{ fontSize:24, flexShrink:0 }}>{item.emoji}</span>
            <div>
              <div style={{ fontWeight:600, fontSize:'.85rem', color:'#374151' }}>{item.titulo}</div>
              <div style={{ fontSize:'.78rem', color:'#6B7280', marginTop:2 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:16, background:'#EAF3DE', borderRadius:8, padding:'10px 12px', fontSize:'.78rem', color:'#1E4D35' }}>
        <i className="ti ti-star" style={{ marginRight:4 }} />
        Acesse o planejamento em <strong>Propriedade → Planejamento</strong> a qualquer momento.
      </div>
    </div>
  )

  return null
}
