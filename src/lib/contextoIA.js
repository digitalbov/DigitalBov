import { db } from './supabase'
import { calcCategoria } from './helpers'

export async function coletarContexto() {
  const hoje = new Date().toLocaleDateString('pt-BR')

  // Ciclo atual
  const { data: ciclo } = await db.ciclos.current()

  // Animais ativos — usa o helper existente que já tem os joins corretos
  const { data: animaisRaw } = await db.animais.list({ situacao: 'ativo' })

  const animais = (animaisRaw || []).map(a => ({
    brinco: a.brinco,
    sexo: a.sexo === 'F' ? 'Fêmea' : 'Macho',
    categoria: calcCategoria(a.data_nascimento, a.sexo),
    sit_reprodutiva: a.sit_reprodutiva,
    proprietario: a.proprietario?.nome,
    lote: a.lote?.nome
  }))

  // Resumo do rebanho
  const totalAnimais = animais.length
  const matrizes = animais.filter(a => a.sexo === 'Fêmea' && ['Vaca', 'Vaca Madura'].includes(a.categoria))
  const prenhas  = matrizes.filter(a => a.sit_reprodutiva === 'prenha')
  const vazias   = matrizes.filter(a => a.sit_reprodutiva === 'vazia')

  const porCategoria = animais.reduce((acc, a) => {
    acc[a.categoria] = (acc[a.categoria] || 0) + 1
    return acc
  }, {})

  // Lotes de inseminação — versão leve (sem partos/pesagens/abortos/estação
  // aninhados, que este resumo não usa), calcula prenhas/vazias pelas inseminacoes
  let inseminacoes = []
  if (ciclo) {
    const { data: lotesIns } = await db.lotesInseminacao.listInseminacoesResumo(ciclo.id)
    inseminacoes = (lotesIns || []).map(l => {
      const ins      = l.inseminacoes || []
      const nPrenhas = ins.filter(i => i.diagnostico === 'P').length
      const nVazias  = ins.filter(i => i.diagnostico === 'V').length
      const nPend    = ins.filter(i => !i.diagnostico).length
      const total    = ins.length
      return {
        lote: `Lote ${l.numero} — ${l.touro}`,
        data: l.data,
        total_inseminadas: total,
        prenhas: nPrenhas,
        vazias: nVazias,
        aguardando_dg: nPend,
        taxa_prenhez: total > 0 ? Math.round((nPrenhas / total) * 100) + '%' : '—'
      }
    })
  }

  // Partos — usa helper existente (bezerro sexo vem do join animais!bezerro_id)
  let partos = []
  if (ciclo) {
    const { data: partosRaw } = await db.partos.list(ciclo.id)
    partos = (partosRaw || []).map(p => ({
      data: p.data_parto,
      mae: p.mae?.brinco,
      sexo_bezerro: p.bezerro?.sexo === 'M' ? 'Macho' : p.bezerro?.sexo === 'F' ? 'Fêmea' : '?'
    }))
  }

  // Estoque — usa helper existente (sem coluna "validade" que não existe)
  const { data: estoqueRaw } = await db.estoque.list()
  const estoque = (estoqueRaw || []).map(e => ({
    item: e.item,
    categoria: e.categoria,
    quantidade: e.quantidade,
    unidade: e.unidade,
    minimo: e.minimo,
    abaixo_minimo: e.minimo > 0 && e.quantidade < e.minimo,
    validade: e.validade || null
  }))

  // Sanidade — usa helper existente; coluna correta é "proximo" (não "proxima_data")
  const { data: sanidadeRaw } = await db.sanidade.list()
  const sanidade = (sanidadeRaw || []).slice(0, 20).map(s => ({
    tipo: s.tipo,
    procedimento: s.procedimento,
    data: s.data,
    proxima: s.proximo
  }))

  // Financeiro do ciclo atual
  let financeiro = null
  if (ciclo) {
    const { data: lancamentos } = await db.lancamentos.list(ciclo.id)
    if (lancamentos) {
      const receitas = lancamentos.filter(l => l.tipo === 'R')
      const despesas = lancamentos.filter(l => l.tipo === 'D')
      const totalReceitas = receitas.reduce((s, l) => s + Number(l.valor), 0)
      const totalDespesas = despesas.reduce((s, l) => s + Number(l.valor), 0)

      const desPorGrupo = despesas.reduce((acc, l) => {
        acc[l.grupo] = (acc[l.grupo] || 0) + Number(l.valor)
        return acc
      }, {})

      financeiro = {
        ciclo: ciclo.nome,
        total_receitas: totalReceitas.toFixed(2),
        total_despesas: totalDespesas.toFixed(2),
        saldo: (totalReceitas - totalDespesas).toFixed(2),
        despesas_por_grupo: desPorGrupo
      }
    }
  }

  return {
    data_hoje: hoje,
    ciclo_atual: ciclo ? { nome: ciclo.nome, inicio: ciclo.inicio, fim: ciclo.fim } : null,
    rebanho: {
      total_animais: totalAnimais,
      por_categoria: porCategoria,
      matrizes_total: matrizes.length,
      matrizes_prenhas: prenhas.length,
      matrizes_vazias: vazias.length
    },
    animais_lista: animais,
    inseminacoes_ciclo: inseminacoes,
    partos_ciclo: partos,
    estoque,
    sanidade_recente: sanidade,
    financeiro
  }
}
