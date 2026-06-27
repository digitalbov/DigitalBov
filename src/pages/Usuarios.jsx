import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { Loading, EmptyState, Modal, Field, toast, Badge } from '../components/UI'

const MODULOS = [
  ['dashboard','Dashboard'], ['propriedade','Propriedade'], ['animais','Animais'],
  ['reprodutivo','Reprodutivo'], ['rebanho','Rebanho'], ['sanidade','Sanidade'],
  ['pesagens','Pesagens'], ['estoque','Estoque'], ['financeiro','Financeiro'],
  ['relatorios','Relatórios'], ['metas','Metas'],
]

export default function Usuarios() {
  const { contaAtual } = useConta()
  const { fazendas } = useFazenda()
  const [membros, setMembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null) // usuario_id em edição
  const [fazVinc, setFazVinc] = useState(new Set())
  const [perms, setPerms] = useState({}) // modulo -> bool
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!contaAtual) return
    setLoading(true)
    const { data } = await supabase.rpc('listar_membros', { conta_uuid: contaAtual.id })
    setMembros(data || [])
    setLoading(false)
  }, [contaAtual])

  useEffect(() => { carregar() }, [carregar])

  const abrirGestao = async (m) => {
    setEditando(m.usuario_id)
    // fazendas vinculadas
    const { data: vinc } = await supabase
      .from('usuario_fazendas').select('fazenda_id').eq('usuario_id', m.usuario_id)
    setFazVinc(new Set((vinc || []).map(v => v.fazenda_id)))
    // permissões
    const { data: pp } = await supabase
      .from('usuario_permissoes').select('modulo, pode_editar').eq('usuario_id', m.usuario_id)
    const map = {}
    ;(pp || []).forEach(p => { map[p.modulo] = p.pode_editar })
    setPerms(map)
  }

  const toggleFazenda = (fid) => {
    setFazVinc(prev => { const s = new Set(prev); s.has(fid) ? s.delete(fid) : s.add(fid); return s })
  }
  const setPerm = (mod, val) => setPerms(prev => ({ ...prev, [mod]: val }))

  const salvar = async (m) => {
    setSalvando(true)
    try {
      // fazendas: vincular as marcadas, desvincular as não marcadas
      for (const f of fazendas) {
        await supabase.rpc('definir_fazenda_usuario', {
          p_conta_id: contaAtual.id, p_usuario_id: m, p_fazenda_id: f.id,
          p_vincular: fazVinc.has(f.id)
        })
      }
      // permissões por módulo
      for (const [mod] of MODULOS) {
        await supabase.rpc('definir_permissao', {
          p_conta_id: contaAtual.id, p_usuario_id: m, p_modulo: mod,
          p_pode_editar: !!perms[mod]
        })
      }
      toast('Permissões salvas')
      setEditando(null)
    } catch (e) {
      toast('Erro ao salvar', 'error')
    }
    setSalvando(false)
  }

  if (loading) return <Loading text="Carregando usuários..." />

  return (
    <div>
      <div className="card">
        {membros.length === 0 ? (
          <EmptyState icon="👥" title="Nenhum usuário" sub="Os membros da sua conta aparecerão aqui." />
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {membros.map(m => (
              <div key={m.usuario_id} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'12px 14px', border:'.5px solid #E5E7EB', borderRadius:10
              }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:'.9rem' }}>{m.email}</div>
                  <Badge color={m.papel === 'dono' ? 'green' : 'gray'}>{m.papel}</Badge>
                </div>
                {m.papel === 'dono' || m.papel === 'admin' ? (
                  <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>Acesso total</span>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => abrirGestao(m)}>
                    Gerenciar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!editando} onClose={() => setEditando(null)} title="Permissões do usuário" width={560}>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontWeight:600, fontSize:'.85rem', marginBottom:10 }}>Fazendas que pode acessar</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {fazendas.map(f => (
              <label key={f.id} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                <input type="checkbox" checked={fazVinc.has(f.id)} onChange={() => toggleFazenda(f.id)} />
                <span style={{ fontSize:'.85rem' }}>{f.nome}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:20 }}>
          <div style={{ fontWeight:600, fontSize:'.85rem', marginBottom:10 }}>O que pode fazer em cada módulo</div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {MODULOS.map(([key, label]) => (
              <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'.5px solid #F3F4F6' }}>
                <span style={{ fontSize:'.85rem' }}>{label}</span>
                <div style={{ display:'flex', gap:6 }}>
                  <button
                    className={`btn btn-sm ${!perms[key] ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setPerm(key, false)}
                  >Ver</button>
                  <button
                    className={`btn btn-sm ${perms[key] ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setPerm(key, true)}
                  >Editar</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={() => salvar(editando)} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
