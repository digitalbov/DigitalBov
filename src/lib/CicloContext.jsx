import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { db } from './supabase'
import { useFazenda } from './FazendaContext'

const CicloCtx = createContext(null)

export const CARENCIA_DIAS = 180

// Status do ciclo em relação à data de hoje. Independe do campo 'atual' do
// banco (que é setado manualmente ao criar um novo ciclo): aqui o "atual" é
// sempre o ciclo cujo intervalo inicio..fim contém a data de hoje.
export function statusCiclo(ciclo, hoje = new Date().toISOString().slice(0, 10)) {
  if (!ciclo) return null
  if (hoje < ciclo.inicio) return 'futuro'
  if (hoje <= ciclo.fim) return 'atual'
  const diasAposFim = Math.round((new Date(hoje) - new Date(ciclo.fim)) / 86400000)
  return diasAposFim <= CARENCIA_DIAS ? 'carencia' : 'encerrado'
}

export const STATUS_CICLO_LABEL = {
  atual:     'atual',
  carencia:  'carência',
  encerrado: 'encerrado — leitura',
  futuro:    'futuro',
}

export function CicloProvider({ children }) {
  const { fazendaAtual } = useFazenda()
  const [ciclos, setCiclos] = useState([])
  const [cicloSelecionado, setCicloSelecionadoSt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const carregarCiclos = useCallback(async () => {
    if (!fazendaAtual) { setCiclos([]); setCicloSelecionadoSt(null); setLoading(false); return [] }
    setLoading(true)
    const { data, error } = await db.ciclos.listByFazenda(fazendaAtual.id)
    if (error) console.error('[CicloContext] erro ao carregar ciclos:', error)
    setErro(error || null)
    const lista = data || []
    const hoje = new Date().toISOString().slice(0, 10)
    const atual = lista.find(c => hoje >= c.inicio && hoje <= c.fim)
    setCiclos(lista)
    setCicloSelecionadoSt(atual || lista[0] || null)
    setLoading(false)
    return lista
  }, [fazendaAtual])

  useEffect(() => { carregarCiclos() }, [carregarCiclos])

  const setCicloSelecionado = useCallback((ciclo) => setCicloSelecionadoSt(ciclo), [])

  const hoje = new Date().toISOString().slice(0, 10)
  const cicloAtual = ciclos.find(c => hoje >= c.inicio && hoje <= c.fim) || null

  const dentroDoCiclo = useCallback((dataStr, ciclo) => {
    if (!dataStr || !ciclo) return false
    return dataStr >= ciclo.inicio && dataStr <= ciclo.fim
  }, [])

  // Ciclo cujo intervalo inicio..fim contém a data informada (ou null se nenhum cobre).
  const cicloDaData = useCallback((dataStr) => {
    if (!dataStr) return null
    return ciclos.find(c => dataStr >= c.inicio && dataStr <= c.fim) || null
  }, [ciclos])

  // Uma data só pode ser gravada se pertencer a um ciclo com status 'atual' ou 'carencia'.
  const dataEhEditavel = useCallback((dataStr) => {
    const c = cicloDaData(dataStr)
    if (!c) return false
    const st = statusCiclo(c)
    return st === 'atual' || st === 'carencia'
  }, [cicloDaData])

  const statusCicloSelecionado = statusCiclo(cicloSelecionado, hoje)
  const podeEditarCiclo = statusCicloSelecionado === 'atual' || statusCicloSelecionado === 'carencia'

  return (
    <CicloCtx.Provider value={{
      ciclos, cicloSelecionado, setCicloSelecionado, cicloAtual,
      statusCicloSelecionado, podeEditarCiclo, dentroDoCiclo,
      cicloDaData, dataEhEditavel,
      loading, carregarCiclos, erro,
    }}>
      {children}
    </CicloCtx.Provider>
  )
}

export function useCiclo() {
  const ctx = useContext(CicloCtx)
  if (!ctx) throw new Error('useCiclo deve ser usado dentro de CicloProvider')
  return ctx
}
