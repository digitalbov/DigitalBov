import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useConta } from './ContaContext'
import { useFazenda } from './FazendaContext'

const PermCtx = createContext(null)

export function PermissoesProvider({ children }) {
  const { contaAtual, loading: contaLoading } = useConta()
  const { fazendaAtual } = useFazenda()
  const [permsVer, setPermsVer] = useState({})
  const [permsEditar, setPermsEditar] = useState({})
  const [ehAdmin, setEhAdmin] = useState(false)
  const [carregado, setCarregado] = useState(false)

  const carregar = useCallback(async () => {
    setCarregado(false)
    if (contaLoading) return            // espera a conta terminar de carregar
    if (!contaAtual) { setEhAdmin(false); setPermsVer({}); setPermsEditar({}); setCarregado(true); return }

    const admin = contaAtual.papel === 'dono' || contaAtual.papel === 'admin'
    setEhAdmin(admin)
    if (admin) { setPermsVer({}); setPermsEditar({}); setCarregado(true); return }

    if (!fazendaAtual) { setPermsVer({}); setPermsEditar({}); setCarregado(true); return }

    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('usuario_permissoes')
      .select('modulo, pode_ver, pode_editar')
      .eq('usuario_id', user.id)
      .eq('conta_id', contaAtual.id)
      .eq('fazenda_id', fazendaAtual.id)
    const mapVer = {}, mapEditar = {}
    ;(data || []).forEach(p => { mapVer[p.modulo] = p.pode_ver; mapEditar[p.modulo] = p.pode_editar })
    setPermsVer(mapVer)
    setPermsEditar(mapEditar)
    setCarregado(true)
  }, [contaAtual, contaLoading, fazendaAtual])

  useEffect(() => { carregar() }, [carregar])

  // Enquanto não carregou, podeVer/podeEditar retornam false (esconde conteúdo por segurança)
  const podeVer = useCallback((modulo) => {
    if (!carregado) return false
    if (ehAdmin) return true
    return !!permsVer[modulo]
  }, [carregado, ehAdmin, permsVer])

  const podeEditar = useCallback((modulo) => {
    if (!carregado) return false
    if (ehAdmin) return true
    return !!permsEditar[modulo]
  }, [carregado, ehAdmin, permsEditar])

  return (
    <PermCtx.Provider value={{ podeVer, podeEditar, ehAdmin, carregado }}>
      {children}
    </PermCtx.Provider>
  )
}

export function usePermissoes() {
  const ctx = useContext(PermCtx)
  if (!ctx) throw new Error('usePermissoes deve ser usado dentro de PermissoesProvider')
  return ctx
}
