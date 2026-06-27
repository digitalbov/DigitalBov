import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useConta } from './ContaContext'

const PermCtx = createContext(null)

export function PermissoesProvider({ children }) {
  const { contaAtual } = useConta()
  const [perms, setPerms] = useState({})   // modulo -> pode_editar
  const [ehAdmin, setEhAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    if (!contaAtual) { setLoading(false); return }
    const admin = contaAtual.papel === 'dono' || contaAtual.papel === 'admin'
    setEhAdmin(admin)
    if (admin) { setPerms({}); setLoading(false); return }  // admin edita tudo

    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('usuario_permissoes')
      .select('modulo, pode_editar')
      .eq('usuario_id', user.id)
    const map = {}
    ;(data || []).forEach(p => { map[p.modulo] = p.pode_editar })
    setPerms(map)
    setLoading(false)
  }, [contaAtual])

  useEffect(() => { carregar() }, [carregar])

  // podeEditar('animais') -> true/false. Admin sempre true.
  const podeEditar = useCallback((modulo) => {
    if (ehAdmin) return true
    return !!perms[modulo]
  }, [ehAdmin, perms])

  return (
    <PermCtx.Provider value={{ podeEditar, ehAdmin, loading }}>
      {children}
    </PermCtx.Provider>
  )
}

export function usePermissoes() {
  const ctx = useContext(PermCtx)
  if (!ctx) throw new Error('usePermissoes deve ser usado dentro de PermissoesProvider')
  return ctx
}
