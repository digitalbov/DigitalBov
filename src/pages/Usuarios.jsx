import { useEffect, useState, useCallback } from 'react'
import { supabase, db } from '../lib/supabase'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { Loading, EmptyState, Modal, Field, toast, Badge } from '../components/UI'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/dynamic-responder'

const MODULOS = [
  ['propriedade','Propriedade'], ['animais','Animais'],
  ['reprodutivo','Reprodutivo'], ['rebanho','Rebanho'], ['sanidade','Sanidade'],
  ['pesagens','Pesagens'], ['estoque','Estoque'], ['financeiro','Financeiro'],
  ['relatorios','Relatórios'], ['metas','Metas'],
]

export default function Usuarios() {
  const { contaAtual } = useConta()
  const { fazendas, fazendaAtual } = useFazenda()
  const [membros, setMembros] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null) // usuario_id em edição
  const [fazVinc, setFazVinc] = useState(new Set()) // fazendas com acesso (indicador visual), derivado de usuario_fazendas
  // Permissões por fazenda + módulo
  const [fazendaGestao, setFazendaGestaoSt] = useState(null) // fazenda_id selecionada para gerenciar permissões
  const [permsFazenda, setPermsFazenda] = useState({}) // modulo -> { pode_ver, pode_editar }
  const [permsDirty, setPermsDirty] = useState(false)
  const [carregandoPerms, setCarregandoPerms] = useState(false)
  const [salvandoPerms, setSalvandoPerms] = useState(false)
  const [modalNovo, setModalNovo] = useState(false)
  const [novo, setNovo] = useState({ email:'', senha:'' })
  const [criando, setCriando] = useState(false)

  const carregar = useCallback(async () => {
    if (!contaAtual) return
    setLoading(true)
    const { data } = await supabase.rpc('listar_membros', { conta_uuid: contaAtual.id })
    setMembros(data || [])
    setLoading(false)
  }, [contaAtual])

  useEffect(() => { carregar() }, [carregar])

  const carregarPermsFazenda = async (usuarioId, fazendaId) => {
    if (!fazendaId) { setPermsFazenda({}); return }
    setCarregandoPerms(true)
    const { data } = await db.usuarioPermissoes.listPorUsuarioFazenda(contaAtual.id, usuarioId, fazendaId)
    const map = {}
    ;(data || []).forEach(p => { map[p.modulo] = { pode_ver: !!p.pode_ver, pode_editar: !!p.pode_editar } })
    setPermsFazenda(map)
    setPermsDirty(false)
    setCarregandoPerms(false)
  }

  const abrirGestao = async (m) => {
    setEditando(m.usuario_id)
    // fazendas com acesso (só para o indicador visual das abas)
    const { data: vinc } = await db.usuarioFazendas.listPorUsuario(m.usuario_id)
    setFazVinc(new Set((vinc || []).map(v => v.fazenda_id)))
    // fazenda padrão para gerenciar permissões: a fazenda atual do app, senão a primeira da lista
    const fazendaInicial = fazendas.find(f => f.id === fazendaAtual?.id) || fazendas[0] || null
    setFazendaGestaoSt(fazendaInicial?.id || null)
    await carregarPermsFazenda(m.usuario_id, fazendaInicial?.id || null)
  }

  const mudarFazendaGestao = (novoId) => {
    if (permsDirty && !confirm('Há alterações de permissões não salvas nesta fazenda. Trocar de fazenda e descartar as alterações?')) return
    setFazendaGestaoSt(novoId)
    carregarPermsFazenda(editando, novoId)
  }

  // Nível de acesso por módulo: 'sem_acesso' | 'ver' | 'editar'
  const nivelDoModulo = (mod) => {
    const p = permsFazenda[mod]
    if (!p || (!p.pode_ver && !p.pode_editar)) return 'sem_acesso'
    if (p.pode_ver && !p.pode_editar) return 'ver'
    return 'editar'
  }
  const setNivel = (mod, nivel) => {
    setPermsFazenda(prev => ({
      ...prev,
      [mod]: { pode_ver: nivel !== 'sem_acesso', pode_editar: nivel === 'editar' }
    }))
    setPermsDirty(true)
  }

  const aplicarPermissoesFazenda = async () => {
    if (!fazendaGestao) { toast('Selecione uma fazenda', 'error'); return }
    setSalvandoPerms(true)
    const registros = MODULOS.map(([mod]) => {
      const p = permsFazenda[mod] || { pode_ver: false, pode_editar: false }
      return {
        conta_id:    contaAtual.id,
        usuario_id:  editando,
        fazenda_id:  fazendaGestao,
        modulo:      mod,
        pode_ver:    p.pode_ver,
        pode_editar: p.pode_editar,
      }
    })
    const { error } = await db.usuarioPermissoes.upsertVarios(registros)
    if (error) { toast('Erro ao salvar permissões: ' + error.message, 'error'); setSalvandoPerms(false); return }

    // Sincroniza usuario_fazendas: acesso se algum módulo tem pode_ver, senão remove o vínculo
    const temAcesso = registros.some(r => r.pode_ver)
    const { error: errVinc } = await db.usuarioFazendas.definir(contaAtual.id, editando, fazendaGestao, temAcesso)
    setSalvandoPerms(false)
    if (errVinc) { toast('Permissões salvas, mas erro ao sincronizar vínculo da fazenda: ' + errVinc.message, 'error'); return }

    setFazVinc(prev => {
      const s = new Set(prev)
      temAcesso ? s.add(fazendaGestao) : s.delete(fazendaGestao)
      return s
    })
    setPermsDirty(false)
    toast('Permissões aplicadas para ' + (fazendas.find(f => f.id === fazendaGestao)?.nome || 'a fazenda'))
  }

  const mudarPapel = async (usuario_id, novoPapel) => {
    const { error } = await supabase.rpc('definir_papel', {
      p_conta_id: contaAtual.id, p_usuario_id: usuario_id, p_novo_papel: novoPapel
    })
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    toast(novoPapel === 'admin' ? 'Promovido a administrador' : 'Alterado para operador')
    await carregar()
  }

  const removerOperador = async (m) => {
    if (m.papel === 'dono') return
    if (!confirm(`Remover ${m.email} desta conta? Ele perde o acesso, mas a conta de login dele não é apagada.`)) return
    const { error } = await db.contaMembros.removerMembro(contaAtual.id, m.usuario_id)
    if (error) { toast('Erro ao remover: ' + error.message, 'error'); return }
    toast('Operador removido da conta.')
    await carregar()
  }

  const criarFuncionario = async () => {
    if (!novo.email || !novo.senha) { toast('Preencha email e senha', 'error'); return }
    if (novo.senha.length < 6) { toast('Senha mínima de 6 caracteres', 'error'); return }
    setCriando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Sessão expirada, faça login de novo', 'error'); setCriando(false); return }

      const resp = await fetch(
        FUNCTIONS_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token,
          },
          body: JSON.stringify({ email: novo.email, senha: novo.senha, conta_id: contaAtual.id, papel: 'operador' }),
        }
      )
      const data = await resp.json()
      if (!resp.ok || data?.error) {
        toast('Erro: ' + (data?.error || resp.status), 'error')
      } else {
        toast('Usuário criado')
        setModalNovo(false)
        setNovo({ email:'', senha:'' })
        await carregar()
      }
    } catch (e) {
      toast('Erro ao criar usuário: ' + String(e), 'error')
    }
    setCriando(false)
  }

  if (loading) return <Loading text="Carregando usuários..." />

  const operadores = membros.filter(m => m.papel !== 'dono')

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:'1.1rem', fontWeight:700, color:'#2B6CD9' }}>Usuários da conta</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setModalNovo(true)}>
          <i className="ti ti-user-plus" /> Adicionar operador
        </button>
      </div>
      <div className="card">
        {operadores.length === 0 ? (
          <EmptyState icon="👥" title="Nenhum usuário" sub="Os membros da sua conta aparecerão aqui." />
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {operadores.map(m => (
              <div key={m.usuario_id} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'12px 14px', border:'.5px solid #E5E7EB', borderRadius:10
              }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:'.9rem' }}>{m.email}</div>
                  <Badge color={m.papel === 'dono' ? 'green' : 'gray'}>{m.papel}</Badge>
                </div>
                {m.papel === 'dono' ? (
                  <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>Dono</span>
                ) : m.papel === 'admin' ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => mudarPapel(m.usuario_id, 'operador')}>
                      Tornar operador
                    </button>
                    <button className="btn btn-sm" style={{ background:'#FEE2E2', color:'#DC2626', border:'none' }}
                      onClick={() => removerOperador(m)}>
                      Remover
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => abrirGestao(m)}>
                      Gerenciar
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => mudarPapel(m.usuario_id, 'admin')}>
                      Tornar admin
                    </button>
                    <button className="btn btn-sm" style={{ background:'#FEE2E2', color:'#DC2626', border:'none' }}
                      onClick={() => removerOperador(m)}>
                      Remover
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalNovo} onClose={() => setModalNovo(false)} title="Adicionar operador" width={420}>
        <Field label="E-mail *">
          <input className="input" style={{ width:'100%' }} type="email"
            value={novo.email} onChange={e => setNovo(p => ({...p, email:e.target.value}))} />
        </Field>
        <Field label="Senha provisória *">
          <input className="input" style={{ width:'100%' }}
            value={novo.senha} onChange={e => setNovo(p => ({...p, senha:e.target.value}))} />
        </Field>
        <p style={{ fontSize:'.78rem', color:'#6B7280', marginTop:4 }}>
          O operador entra com este e-mail e senha. Você define as fazendas e
          permissões dele depois, no botão Gerenciar.
        </p>
        <div className="modal-actions" style={{ marginTop:16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setModalNovo(false)}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={criarFuncionario} disabled={criando}>
            {criando ? 'Criando...' : 'Criar usuário'}
          </button>
        </div>
      </Modal>

      <Modal open={!!editando} onClose={() => setEditando(null)} title="Permissões do usuário" width={640}>
        <p style={{ fontSize:'.78rem', color:'#6B7280', marginTop:-4, marginBottom:14 }}>
          Escolha uma fazenda e defina o acesso por módulo. O vínculo do operador
          com a fazenda é atualizado automaticamente ao aplicar.
        </p>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontWeight:600, fontSize:'.85rem', marginBottom:8 }}>Fazendas</div>
          {fazendas.length === 0 ? (
            <div style={{ fontSize:'.82rem', color:'#9CA3AF' }}>Nenhuma fazenda cadastrada.</div>
          ) : (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {fazendas.map(f => (
                <button key={f.id} type="button"
                  className={`pill ${fazendaGestao === f.id ? 'active' : ''}`}
                  onClick={() => mudarFazendaGestao(f.id)}
                  style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{
                    width:8, height:8, borderRadius:'50%', display:'inline-block',
                    background: fazVinc.has(f.id) ? '#22C55E' : '#D1D5DB'
                  }} />
                  {f.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom:20 }}>
          <div style={{ fontWeight:600, fontSize:'.85rem', marginBottom:10 }}>
            O que pode fazer em cada módulo
            {fazendaGestao && <span style={{ fontWeight:400, color:'#6B7280' }}> — {fazendas.find(f => f.id === fazendaGestao)?.nome}</span>}
          </div>
          {carregandoPerms ? (
            <div style={{ fontSize:'.82rem', color:'#9CA3AF' }}>Carregando permissões...</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {MODULOS.map(([key, label]) => (
                <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'.5px solid #F3F4F6', flexWrap:'wrap', gap:6 }}>
                  <span style={{ fontSize:'.85rem' }}>{label}</span>
                  <div className="pill-group">
                    <button type="button" className={`pill ${nivelDoModulo(key)==='sem_acesso'?'active':''}`} onClick={() => setNivel(key,'sem_acesso')}>Sem acesso</button>
                    <button type="button" className={`pill ${nivelDoModulo(key)==='ver'?'active':''}`} onClick={() => setNivel(key,'ver')}>Ver</button>
                    <button type="button" className={`pill ${nivelDoModulo(key)==='editar'?'active':''}`} onClick={() => setNivel(key,'editar')}>Ver e editar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop:12 }}>
            <button className="btn btn-primary btn-sm" onClick={aplicarPermissoesFazenda} disabled={salvandoPerms || !fazendaGestao}>
              {salvandoPerms ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setEditando(null)}>Fechar</button>
        </div>
      </Modal>
    </div>
  )
}
