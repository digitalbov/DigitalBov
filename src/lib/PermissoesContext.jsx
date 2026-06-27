import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useConta } from './ContaContext'

const PermCtx = createContext(null)

export function PermissoesProvider({ children }) {
  const { contaAtual, loading: contaLoading } = useConta()
  const [perms, setPerms] = useState({})
  const [ehAdmin, setEhAdmin] = useState(false)
  const [carregado, setCarregado] = useState(false)

  const carregar = useCallback(async () => {
    setCarregado(false)
    if (contaLoading) return            // espera a conta terminar de carregar
    if (!contaAtual) { setEhAdmin(false); setPerms({}); setCarregado(true); return }

    const admin = contaAtual.papel === 'dono' || contaAtual.papel === 'admin'
    setEhAdmin(admin)
    if (admin) { setPerms({}); setCarregado(true); return }

    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('usuario_permissoes')
      .select('modulo, pode_editar')
      .eq('usuario_id', user.id)
    const map = {}
    ;(data || []).forEach(p => { map[p.modulo] = p.pode_editar })
    setPerms(map)
    setCarregado(true)
  }, [contaAtual, contaLoading])

  useEffect(() => { carregar() }, [carregar])

  // Enquanto não carregou, podeEditar retorna false (esconde botões por segurança)
  const podeEditar = useCallback((modulo) => {
    if (!carregado) return false
    if (ehAdmin) return true
    return !!perms[modulo]
  }, [carregado, ehAdmin, perms])

  return (
    <PermCtx.Provider value={{ podeEditar, ehAdmin, carregado }}>
      {children}
    </PermCtx.Provider>
  )
}

export function usePermissoes() {
  const ctx = useContext(PermCtx)
  if (!ctx) throw new Error('usePermissoes deve ser usado dentro de PermissoesProvider')
  return ctx
}
