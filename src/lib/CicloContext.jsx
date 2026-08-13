import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { db } from './supabase'
import { useFazenda } from './FazendaContext'
import { hojeISO } from './hoje'

const CicloCtx = createContext(null)

// Carência: janela após o fim do ciclo em que ele ainda aceita lançamentos/
// ajustes antes de virar somente leitura ("encerrado"). Regra de negócio: 180 dias.
export const CARENCIA_DIAS = 180

// ── Ciclo pecuário esperado para uma data (01/07 a 30/06 do ano seguinte) ──
// Nome no formato curto já usado em todo o sistema (ex: '2025/26' — ver
// docs/01_supabase_schema.sql e a criação manual de ciclo em Financeiro.jsx).
export function calcularCicloEsperado(dataISO) {
  const [anoStr, mesStr] = dataISO.split('-')
  const ano = parseInt(anoStr, 10)
  const mes = parseInt(mesStr, 10)
  const anoInicio = mes >= 7 ? ano : ano - 1
  const anoFim    = anoInicio + 1
  return {
    nome:   `${anoInicio}/${String(anoFim).slice(-2)}`,
    inicio: `${anoInicio}-07-01`,
    fim:    `${anoFim}-06-30`,
  }
}

// Trava em memória (por aba) contra criação duplicada quando carregarCiclos
// dispara mais de uma vez em sequência rápida (ex: StrictMode em dev, troca
// rápida de fazenda) — não cobre duas abas simultâneas, mas isso é reduzido
// pela reconsulta por nome logo antes do insert (ver criarCicloAutomatico).
const _criandoCicloPorFazenda = new Set()

// Status do ciclo em relação à data de hoje. Independe do campo 'atual' do
// banco (que é setado manualmente ao criar um novo ciclo): aqui o "atual" é
// sempre o ciclo cujo intervalo inicio..fim contém a data de hoje.
export function statusCiclo(ciclo, hoje = hojeISO()) {
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

  // Cria o ciclo automaticamente para a fazenda quando não existe nenhum
  // cobrindo hoje() — substitui a criação manual (Financeiro > Novo ciclo) no
  // fluxo normal; o usuário só cria na mão em casos fora do padrão.
  const criarCicloAutomatico = async (fazendaId, esperado) => {
    if (_criandoCicloPorFazenda.has(fazendaId)) return null
    _criandoCicloPorFazenda.add(fazendaId)
    try {
      // Reconsulta pelo nome (chave natural) imediatamente antes de inserir —
      // reduz (não elimina) a janela de corrida com outra aba/carregamento.
      const { data: existente } = await db.ciclos.byNome(esperado.nome)
      if (existente) return existente
      await db.ciclos.deactivateAll()
      const { data: criado, error } = await db.ciclos.insert({
        fazenda_id: fazendaId,
        nome: esperado.nome, inicio: esperado.inicio, fim: esperado.fim, atual: true,
      })
      if (error) { console.error('[CicloContext] erro ao criar ciclo automático:', error); return null }
      return criado
    } finally {
      _criandoCicloPorFazenda.delete(fazendaId)
    }
  }

  const carregarCiclos = useCallback(async () => {
    if (!fazendaAtual) { setCiclos([]); setCicloSelecionadoSt(null); setLoading(false); return [] }
    setLoading(true)
    const { data, error } = await db.ciclos.listByFazenda(fazendaAtual.id)
    if (error) console.error('[CicloContext] erro ao carregar ciclos:', error)
    setErro(error || null)
    let lista = data || []
    const hoje = hojeISO()
    let atual = lista.find(c => hoje >= c.inicio && hoje <= c.fim)
    if (!atual) {
      const esperado = calcularCicloEsperado(hoje)
      const criado = await criarCicloAutomatico(fazendaAtual.id, esperado)
      if (criado) {
        lista = [criado, ...lista.filter(c => c.id !== criado.id)]
        atual = criado
      }
    }
    setCiclos(lista)
    setCicloSelecionadoSt(atual || lista[0] || null)
    setLoading(false)
    return lista
  }, [fazendaAtual])

  useEffect(() => { carregarCiclos() }, [carregarCiclos])

  const setCicloSelecionado = useCallback((ciclo) => setCicloSelecionadoSt(ciclo), [])

  const hoje = hojeISO()
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
