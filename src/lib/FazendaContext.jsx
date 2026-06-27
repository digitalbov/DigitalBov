import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, setCurrentFazendaId } from './supabase'

const FazendaCtx = createContext(null)

export function FazendaProvider({ children }) {
  const [fazendas,      setFazendas]      = useState([])
  const [fazendaAtual,  setFazendaAtualSt]= useState(null)
  const [loading,       setLoading]       = useState(true)

  const carregarFazendas = useCallback(async () => {
    const { data } = await supabase.from('fazendas').select('*').eq('ativo', true).order('nome')
    const lista = data || []
    setFazendas(lista)
    const savedId = localStorage.getItem('fazenda_atual_id')
    const sel = lista.find(f => f.id === savedId) || lista[0] || null
    setFazendaAtualSt(sel)
    setCurrentFazendaId(sel?.id || null)
    setLoading(false)
    return lista
  }, [])

  useEffect(() => { carregarFazendas() }, [carregarFazendas])

  const setFazendaAtual = useCallback((fazenda) => {
    setFazendaAtualSt(fazenda)
    setCurrentFazendaId(fazenda?.id || null)
    if (fazenda) localStorage.setItem('fazenda_atual_id', fazenda.id)
    else         localStorage.removeItem('fazenda_atual_id')
  }, [])

  const atualizarFazendaAtual = useCallback((fazendaAtualizada) => {
    setFazendaAtualSt(prev => prev?.id === fazendaAtualizada.id ? fazendaAtualizada : prev)
    setFazendas(prev => prev.map(f => f.id === fazendaAtualizada.id ? fazendaAtualizada : f))
  }, [])

  return (
    <FazendaCtx.Provider value={{
      fazendas, fazendaAtual, setFazendaAtual,
      carregarFazendas, atualizarFazendaAtual, loading
    }}>
      {children}
    </FazendaCtx.Provider>
  )
}

export function useFazenda() {
  const ctx = useContext(FazendaCtx)
  if (!ctx) throw new Error('useFazenda deve ser usado dentro de FazendaProvider')
  return ctx
}
