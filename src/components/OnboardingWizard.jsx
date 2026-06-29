import { useState, useEffect } from 'react'
import { db, supabase } from '../lib/supabase'
import { toast, Field } from './UI'

const PASSOS = [
  { id:1, titulo:'Dados da fazenda',     icon:'🏡', desc:'Confirme as informações básicas da sua fazenda.' },
  { id:2, titulo:'Valor da propriedade', icon:'💰', desc:'Informe os valores para calcular rentabilidade.' },
  { id:3, titulo:'Proprietários',        icon:'👤', desc:'Cadastre os donos vinculados a esta fazenda.' },
  { id:4, titulo:'Piquetes',             icon:'🌿', desc:'Registre as áreas de pastagem.' },
  { id:5, titulo:'Lotes',                icon:'📦', desc:'Crie lotes para organizar o rebanho.' },
  { id:6, titulo:'Animais',              icon:'🐄', desc:'Cadastre seus animais depois, no módulo específico.' },
  { id:7, titulo:'Planejamento',         icon:'🎯', desc:'Defina o propósito e as metas da fazenda.' },
]

export default function OnboardingWizard({ fazendaId, onClose }) {
  const [passo, setPasso] = useState(1)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [contaId, setContaId] = useState(null)
  const [qtdProprietarios, setQtdProprietarios] = useState(0)

  const total = PASSOS.length
  const atual = PASSOS[passo - 1]
  const progPct = Math.round((passo / total) * 100)

  useEffect(() => {
    supabase.from('fazendas').select('conta_id').eq('id', fazendaId).maybeSingle()
      .then(({ data }) => { if (data) setContaId(data.conta_id) })
    supabase.from('proprietarios').select('id').eq('fazenda_id', fazendaId)
      .then(({ data }) => setQtdProprietarios((data || []).length))
  }, [fazendaId])

  const proxPasso = () => {
    if (passo === 3 && qtdProprietarios === 0) {
      toast('Cadastre ao menos um proprietário para continuar', 'error'); return
    }
    if (passo < total) setPasso(p => p+1)
  }
  const voltarPasso = () => { if (passo > 1) setPasso(p => p-1) }

  const concluir = async () => {
    if (qtdProprietarios === 0) { toast('Cadastre ao menos um proprietário', 'error'); setPasso(3); return }
    setSaving(true)
    setSaving(false)
    toast('Tutorial concluído! Bem-vindo ao sistema.')
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:8888, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:20, width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>
        <div style={{ background:'linear-gradient(135deg,#2B6CD9 0%,#1E55B0 100%)', borderRadius:'20px 20px 0 0', padding:'24px 28px', color:'white' }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.55)', fontWeight:500 }}>PASSO {passo} DE {total}</div>
            <div style={{ fontSize:'1.35rem', fontWeight:700, marginTop:4 }}>{atual.icon} {atual.titulo}</div>
            <div style={{ fontSize:'.82rem', color:'rgba(255,255,255,.65)', marginTop:4 }}>{atual.desc}</div>
          </div>
          <div style={{ background:'rgba(255,255,255,.2)', borderRadius:99, height:6 }}>
            <div style={{ background:'white', borderRadius:99, height:6, width:progPct+'%', transition:'width .35s ease' }} />
          </div>
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            {PASSOS.map(p => (
              <button key={p.id} onClick={() => { if (p.id <= passo || passo > 3 || qtdProprietarios > 0 || p.id <= 3) setPasso(p.id) }}
                style={{ width:28, height:28, borderRadius:'50%', border:'none', cursor:'pointer',
                  background: p.id < passo ? '#A5C8F5' : p.id === passo ? 'white' : 'rgba(255,255,255,.2)',
                  color: p.id <= passo ? '#2B6CD9' : 'rgba(255,255,255,.5)', fontWeight: p.id === passo ? 700 : 400,
                  fontSize:'.75rem', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>
                {p.id < passo ? '✓' : p.id}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:'28px' }}>
          <PassoConteudo passo={passo} form={form} setForm={setForm} fazendaId={fazendaId}
            contaId={contaId} setQtdProprietarios={setQtdProprietarios} qtdProprietarios={qtdProprietarios} />
        </div>

        <div style={{ padding:'0 28px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={voltarPasso} disabled={passo === 1}
            style={{ background:'none', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 18px',
              cursor:passo===1?'default':'pointer', color:passo===1?'#D1D5DB':'#374151', fontFamily:'inherit', fontSize:'.85rem' }}>
            Voltar
          </button>
          {passo < total ? (
            <button className="btn btn-primary" onClick={proxPasso}>Próximo</button>
          ) : (
            <button className="btn btn-primary" onClick={concluir} disabled={saving}>
              {saving ? 'Concluindo...' : 'Concluir'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PassoConteudo({ passo, form, setForm, fazendaId, contaId, setQtdProprietarios, qtdProprietarios }) {
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState([])
  const [novoNome, setNovoNome] = useState('')

  useEffect(() => {
    const map = { 3:'proprietarios', 4:'piquetes', 5:'lotes' }
    const tabela = map[passo]
    if (!tabela) { setItems([]); return }
    let ativo = true
    supabase.from(tabela).select('*').eq('fazenda_id', fazendaId)
      .then(({ data }) => { if (ativo) setItems(data || []) })
    return () => { ativo = false }
  }, [passo, fazendaId])

  const addItem = async (tabela, payload) => {
    if (!contaId) { toast('Aguarde um instante e tente de novo', 'error'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from(tabela)
      .insert({ ...payload, fazenda_id: fazendaId, conta_id: contaId })
      .select()
    setSaving(false)
    if (error) { toast('Erro: '+error.message, 'error'); return }
    setNovoNome('')
    const novaLista = [...items, ...(data || [])]
    setItems(novaLista)
    if (tabela === 'proprietarios') setQtdProprietarios(novaLista.length)
    toast('Adicionado!')
  }

  const ListaItems = () => items.length > 0 && (
    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
      {items.map(it => (
        <div key={it.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, fontSize:'.83rem' }}>
          <span style={{ color:'#2B6CD9' }}>✓</span> {it.nome}
        </div>
      ))}
    </div>
  )

  if (passo === 1) return (
    <p style={{ fontSize:'.85rem', color:'#6B7280', lineHeight:1.6 }}>
      Sua fazenda já foi criada. Avance para cadastrar proprietários, piquetes e lotes.
      Os dados da fazenda podem ser editados depois em Propriedade → Configurações.
    </p>
  )

  if (passo === 2) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:16 }}>Opcional. Você pode preencher depois em Propriedade → Planejamento.</p>
      <Field label="Valor da terra (R$)">
        <input type="number" value={form.valor_terra||''} onChange={e=>setForm(p=>({...p,valor_terra:e.target.value}))} placeholder="ex: 4600000" />
      </Field>
    </div>
  )

  if (passo === 3) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:16 }}>Cadastre os proprietários desta fazenda.</p>
      <ListaItems />
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <input placeholder="Nome do proprietário" value={novoNome} onChange={e => setNovoNome(e.target.value)}
          style={{ flex:1 }} className="input"
          onKeyDown={e => e.key==='Enter' && novoNome && addItem('proprietarios', { nome:novoNome })} />
        <button className="btn btn-primary btn-sm" disabled={!novoNome||saving} onClick={() => addItem('proprietarios',{ nome:novoNome })}>+</button>
      </div>
      <p style={{ fontSize:'.75rem', color: qtdProprietarios === 0 ? '#DC2626' : '#9CA3AF' }}>
        {qtdProprietarios === 0 ? 'Obrigatório: cadastre ao menos um proprietário para continuar.' : 'Você pode adicionar mais depois.'}
      </p>
    </div>
  )

  if (passo === 4) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:16 }}>Cadastre os piquetes (opcional).</p>
      <ListaItems />
      <div style={{ display:'flex', gap:8 }}>
        <input placeholder="Nome do piquete" value={novoNome} onChange={e => setNovoNome(e.target.value)}
          style={{ flex:1 }} className="input"
          onKeyDown={e => e.key==='Enter' && novoNome && addItem('piquetes', { nome:novoNome, status:'em_uso', area_ha:0 })} />
        <button className="btn btn-primary btn-sm" disabled={!novoNome||saving} onClick={() => addItem('piquetes',{ nome:novoNome, status:'em_uso', area_ha:0 })}>+</button>
      </div>
    </div>
  )

  if (passo === 5) return (
    <div>
      <p style={{ fontSize:'.85rem', color:'#6B7280', marginBottom:16 }}>Cadastre os lotes (opcional).</p>
      <ListaItems />
      <div style={{ display:'flex', gap:8 }}>
        <input placeholder="Nome do lote" value={novoNome} onChange={e => setNovoNome(e.target.value)}
          style={{ flex:1 }} className="input"
          onKeyDown={e => e.key==='Enter' && novoNome && addItem('lotes',{ nome:novoNome })} />
        <button className="btn btn-primary btn-sm" disabled={!novoNome||saving} onClick={() => addItem('lotes',{ nome:novoNome })}>+</button>
      </div>
    </div>
  )

  if (passo === 6) return (
    <p style={{ fontSize:'.85rem', color:'#6B7280', lineHeight:1.6 }}>
      Os animais são cadastrados no módulo Cadastro de Animais, no menu lateral. Você pode fazer isso depois.
    </p>
  )

  if (passo === 7) return (
    <p style={{ fontSize:'.85rem', color:'#6B7280', lineHeight:1.6 }}>
      O planejamento estratégico fica em Propriedade → Planejamento. Conclua para entrar no sistema.
    </p>
  )

  return null
}
