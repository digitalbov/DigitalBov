import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, setCurrentContaId } from './supabase'
import { definirPermissaoSimulacao } from './hoje'

const ContaCtx = createContext(null)

export function ContaProvider({ children }) {
  const [contas,       setContas]      = useState([])
  const [contaAtual,   setContaAtualSt] = useState(null)
  const [loading,      setLoading]     = useState(true)

  const carregarContas = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setContas([]); setContaAtualSt(null); setCurrentContaId(null); definirPermissaoSimulacao(false); setLoading(false); return }
    const { data: membros } = await supabase
      .from('conta_membros')
      .select('conta_id, papel, contas(*)')
      .eq('status', 'ativo')
      .eq('usuario_id', user.id)

    const lista = (membros || [])
      .map(m => m.contas ? { ...m.contas, papel: m.papel } : null)
      .filter(Boolean)

    setContas(lista)

    const savedId = localStorage.getItem('conta_atual_id')
    const sel = lista.find(c => c.id === savedId) || lista[0] || null
    setContaAtualSt(sel)
    setCurrentContaId(sel?.id || null)
    // Guarda de baixo nível: qualquer troca/carregamento de conta reafirma se
    // ESTA conta pode usar data simulada — getDataSimulada() (hoje.js) ignora
    // o localStorage inteiro quando isto é false, mesmo que sobre um valor de
    // uma sessão anterior numa conta de teste no mesmo navegador.
    definirPermissaoSimulacao(sel?.testes)
    setLoading(false)
    return lista
  }, [])

  useEffect(() => { carregarContas() }, [carregarContas])

  const setContaAtual = useCallback((conta) => {
    setContaAtualSt(conta)
    setCurrentContaId(conta?.id || null)
    definirPermissaoSimulacao(conta?.testes)
    if (conta) localStorage.setItem('conta_atual_id', conta.id)
    else       localStorage.removeItem('conta_atual_id')
    // Ao trocar de conta, limpa a fazenda salva (pertencia à conta anterior)
    localStorage.removeItem('fazenda_atual_id')
  }, [])

  return (
    <ContaCtx.Provider value={{ contas, contaAtual, setContaAtual, carregarContas, loading }}>
      {children}
    </ContaCtx.Provider>
  )
}

export function useConta() {
  const ctx = useContext(ContaCtx)
  if (!ctx) throw new Error('useConta deve ser usado dentro de ContaProvider')
  return ctx
}
