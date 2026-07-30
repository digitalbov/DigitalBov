import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { db } from '../lib/supabase'
import {
  calcCategoria, calcGMD, calcTaxaPrenhez, contarPrenhas, contarExpostas, contarMatrizes,
  calcGestacaoLote, calcDesmameMetrics, calcIntervaloPartos, algumErro, fmtMoeda,
} from '../lib/helpers'
import { Loading, Modal, toast, BotaoPDF, EmptyState, ErroCarregamento, SeletorCicloLocal, AlertBox, Badge } from '../components/UI'
import { usePermissoes } from '../lib/PermissoesContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, LabelList, ReferenceLine, Legend,
} from 'recharts'

// three.js/@react-three/fiber só baixam quando esta tela abre (lazy), nunca no
// bundle inicial do app — ver GraficoPrecoVenda3D.jsx.
const GraficoPrecoVenda3D = lazy(() => import('../components/GraficoPrecoVenda3D'))

// ── Metadata de cada indicador ────────────────────────────────────
// semDadosMsg: mensagem mostrada no lugar de "Sem dados suficientes" quando o
// indicador ainda não tem base pra ser avaliado (denominador 0 ou nenhum
// evento aconteceu ainda) — evita mostrar "meta batida" enganoso pra um 0%
// que na verdade é "ainda não sabemos".
const CFG = {
  taxa_prenhez:         { label: 'Taxa de Prenhez',         icon: '💉', inverted: false, desc: 'Prenhas / total de inseminadas no ciclo atual' },
  taxa_aproveitamento:  { label: 'Taxa de Aproveitamento',  icon: '🎯', inverted: false, desc: 'Matrizes expostas / matrizes aptas (fêmeas >24 meses na data da monta)' },
  // Fase 8 (correção de nomenclatura, Opção A) — "taxa_paricao" existia com
  // esse nome desde antes, com fórmula partos/PRENHAS. Isso colidia com
  // outra tela (Reprodutivo.jsx) que já usava "Taxa de parição" pra
  // partos/EXPOSTAS (padrão do setor). Decisão: taxa_paricao mantém a
  // fórmula/chave/meta já configurada por quem usa o sistema (zero migração,
  // nenhuma meta salva muda de sentido) — só o RÓTULO muda, pra "Eficiência
  // Gestacional". A chave nova abaixo (taxa_paricao_expostas) é quem passa a
  // se chamar "Taxa de Parição" de verdade, com meta própria (75%, sem
  // herdar nada — número novo, denominador estruturalmente maior).
  taxa_paricao:         { label: 'Eficiência Gestacional',  icon: '🍼', inverted: false, desc: 'Partos / prenhas confirmadas (ciclo atual) — mede quantas gestações confirmadas realmente resultaram em parto', semDadosMsg: 'Aguardando partos' },
  taxa_paricao_expostas:{ label: 'Taxa de Parição',         icon: '🐮', inverted: false, desc: 'Partos / matrizes expostas no ciclo (padrão do setor) — inclui vacas que nunca prenharam, diferente de Eficiência Gestacional', semDadosMsg: 'Aguardando partos' },
  gmd_terneiros:        { label: 'GMD Terneiros',           icon: '⚖️', inverted: false, desc: 'GMD médio dos terneiros com ≥2 pesagens' },
  gmd_terneiros_femeas: { label: 'GMD Terneiras (fêmeas)',  icon: '⚖️', inverted: false, desc: 'GMD médio das terneiras (fêmeas) com ≥2 pesagens' },
  gmd_terneiros_machos: { label: 'GMD Terneiros (machos)',  icon: '⚖️', inverted: false, desc: 'GMD médio dos terneiros (machos) com ≥2 pesagens' },
  kg_bezerro_matriz:    { label: 'Kg Desmamado / Matriz',   icon: '🐄', inverted: false, desc: 'Peso de desmame somado / matrizes expostas (ciclo atual)', semDadosMsg: 'Aguardando desmames' },
  kg_nascimento:        { label: 'Kg ao Nascer',            icon: '⚖️', inverted: false, desc: 'Peso médio dos terneiros ao nascer na safra do ciclo', semDadosMsg: 'Aguardando pesagens de nascimento' },
  kg_desmame:           { label: 'Kg ao Desmame',           icon: '⚖️', inverted: false, desc: 'Peso médio dos terneiros desmamados na safra do ciclo', semDadosMsg: 'Aguardando desmames' },
  intervalo_partos:     { label: 'Intervalo entre Partos',  icon: '📅', inverted: true,  desc: 'Média de dias entre partos consecutivos da mesma matriz (meta = máx. aceitável)', semDadosMsg: 'Precisa de matrizes com 2+ partos' },
  taxa_aborto:          { label: 'Perda Gestacional',       icon: '⚠️', inverted: true,  desc: 'Abortos + perdas não identificadas / prenhas — exclui gestações ainda em andamento', semDadosMsg: 'Aguardando desfechos da safra' },
  mortalidade:          { label: 'Mortalidade de Terneiros', icon: '📊', inverted: true,  desc: 'Mortos entre os terneiros nascidos na safra do ciclo (meta = máx. aceitável)', semDadosMsg: 'Aguardando nascimentos' },
  // Produção da safra x hectare útil — mesmos 4 números que antes eram um
  // painel kpi-card só leitura (ver git history); viraram indicador completo
  // (meta + semáforo + barra) sem mudar nenhuma conta, só a apresentação.
  // Títulos curtos de propósito (ver labelComSexo mais abaixo) — não cabiam
  // em duas linhas dentro do card com "Produzido em"/"por Hectare" por
  // extenso. "(Estimado)" saiu do título dos dois cards de valor estimado e
  // virou o badge `estimado: true`, renderizado à parte em IndicadorCard.
  // Espaço NÃO separável (NBSP, não espaço normal) entre "Terneiros" e "♂♀"
  // — impede a linha de quebrar bem no meio do par palavra+símbolos.
  producao_kg:       { label: 'Kg de Terneiros ♂♀', icon: '🌾', inverted: false, desc: 'Última pesagem de manejo somada dos terneiros da safra', semDadosMsg: 'Aguardando pesagens de desmame', mostraSubtitulo: true },
  producao_valor:    { label: 'Valor de Terneiros ♂♀',      icon: '💰', inverted: false, desc: 'Machos × valor médio de Terneiro + fêmeas × valor médio de Terneira (categorias_preco) — valor estimado com base no valor de referência definido pelo usuário em Parâmetros do sistema', semDadosMsg: 'Cadastre peso/preço de Terneiro e Terneira em Parâmetros', mostraSubtitulo: true, estimado: true },
  producao_kg_ha:    { label: 'Kg de Terneiros ♂♀ / ha',    icon: '🌱', inverted: false, desc: 'Kg de terneiros produzidos / hectare útil (soma dos piquetes)', semDadosMsg: 'Cadastre piquetes com área', mostraSubtitulo: true },
  producao_valor_ha: { label: 'Valor de Terneiros ♂♀ / ha', icon: '💵', inverted: false, desc: 'Valor produzido (estimado) / hectare útil (soma dos piquetes) — valor estimado com base no valor de referência definido pelo usuário em Parâmetros do sistema', semDadosMsg: 'Cadastre piquetes e o preço das categorias', mostraSubtitulo: true, estimado: true },
  // Receita REAL — venda efetiva (transacao_animais_itens), mesma população
  // de bezerroIdsSafra que os 4 de cima (SEM filtro de categoria_venda: um
  // terneiro vendido depois de virar Novilho/Novilha, ou sob categoria com
  // override, ainda conta). Ao lado dos cards estimados, pra comparação direta.
  receita_real_terneiros:    { label: 'Receita Real de Terneiros ♂♀',      icon: '💲', inverted: false, desc: 'Soma do valor de venda efetiva (transacao_animais_itens) dos terneiros/terneiras NASCIDOS nesta safra, seja qual for a categoria no momento da venda', semDadosMsg: 'Sem vendas no período', mostraSubtitulo: true },
  receita_real_terneiros_ha: { label: 'Receita Real de Terneiros ♂♀ / ha', icon: '💷', inverted: false, desc: 'Receita real de terneiros/as / hectare útil (soma dos piquetes)', semDadosMsg: 'Sem vendas no período', mostraSubtitulo: true },
  // Custos — fonte ÚNICA é o grupo financeiro 'Inseminação' (lancamentos_financeiros,
  // tipo despesa), agrupado pela DATA do lançamento dentro do intervalo do ciclo
  // selecionado (não pelo ciclo_id salvo no lançamento — a despesa pode ter sido
  // lançada já no ciclo seguinte e ainda assim pertencer à monta deste ciclo).
  // Sem meta padrão (como Produção): custo varia demais por região/protocolo pra
  // ter um "ideal" universal — fica "Sem meta" até o usuário definir um valor.
  // Rótulo/desc ficam mode-agnósticos de propósito (Inseminação/Monta Natural/
  // Consolidado usam grupos financeiros diferentes — ver comentário em
  // calcularBloco) — qual grupo entrou de fato na conta aparece no subtítulo
  // de cada card (subtituloCustos), que É mode-aware.
  custo_insem_terneiro: { label: 'Custo de Monta / Terneiro', icon: '💉', inverted: true, desc: 'Despesas da modalidade de monta selecionada, no período, ÷ terneiros produzidos dessa safra', semDadosMsg: 'Sem despesas lançadas no período', mostraSubtitulo: true },
  custo_insem_pct_valor: { label: 'Custo de Monta / Valor do Terneiro', icon: '📉', inverted: true, desc: 'Despesas da modalidade de monta selecionada ÷ valor produzido da safra (Terneiro/Terneira)', semDadosMsg: 'Sem despesas lançadas no período', mostraSubtitulo: true },
  custo_insem_total: { label: 'Custo Total de Monta', icon: '💰', inverted: true, desc: 'Soma das despesas da modalidade de monta selecionada, lançadas dentro do período de monta deste ciclo', semDadosMsg: 'Sem despesas lançadas no período', mostraSubtitulo: true },
  custo_insem_matriz: { label: 'Custo de Monta / Matriz Exposta', icon: '🐄', inverted: true, desc: 'Despesas da modalidade de monta selecionada ÷ matrizes expostas no ciclo', semDadosMsg: 'Sem despesas lançadas no período', mostraSubtitulo: true },
}

// ── Texto de apoio dos 4 indicadores de Produção — mostra a base de cálculo
// por trás do número (quantos terneiros entraram na conta, quantos ha), pra
// dar confiabilidade ao valor. producao_valor não tem um "X de Y" natural (não
// há um "total possível" pra comparar contra), então mostra a composição
// macho+fêmea que a fórmula usa (mesmas variáveis de valorProduzido em loadAll).
function subtituloProducao(indicador, d) {
  if (!d) return null
  switch (indicador) {
    case 'producao_kg':
      return `${d.pesados} de ${d.totalTerneiros} terneiro${d.totalTerneiros === 1 ? '' : 's'} pesado${d.pesados === 1 ? '' : 's'}`
    case 'producao_valor':
      return `${d.qtdMachos} macho${d.qtdMachos === 1 ? '' : 's'} + ${d.qtdFemeas} fêmea${d.qtdFemeas === 1 ? '' : 's'}`
    case 'producao_kg_ha':
    case 'producao_valor_ha':
    case 'receita_real_terneiros_ha':
      return `${d.hectareUtil.toFixed(1)} ha úteis`
    case 'receita_real_terneiros':
      // 0 vendas já vira "Sem vendas no período" no valor principal
      // (semDadosMsg) — mesmo padrão de subtituloCustos com nLancamentos.
      return d.vendasSafraLength > 0
        ? `${d.vendasSafraLength} venda${d.vendasSafraLength === 1 ? '' : 's'} de terneiro/a desta safra`
        : null
    default:
      return null
  }
}

// ── Texto de apoio dos 4 indicadores de Custos — rótulo HONESTO: diz de qual
// grupo financeiro o número saiu de fato, o que muda por modo (ver
// custosDetalhes em loadAll) — desc dos cards em CFG é mode-agnóstico de
// propósito, então é aqui que a fonte real fica auditável.
const GRUPO_CUSTO_LABEL = {
  ia:          "no grupo financeiro 'Inseminação'",
  natural:     "no grupo financeiro 'Monta Natural'",
  consolidado: "nos grupos financeiros 'Inseminação' + 'Monta Natural'",
}
function subtituloCustos(indicador, custosPorModo, modo) {
  if (!['custo_insem_terneiro', 'custo_insem_pct_valor', 'custo_insem_total', 'custo_insem_matriz'].includes(indicador)) return null
  const d = custosPorModo?.[modo]
  if (!d || d.nLancamentos === 0) return null
  return `Baseado ${GRUPO_CUSTO_LABEL[modo]} — ${d.nLancamentos} lançamento${d.nLancamentos === 1 ? '' : 's'} no período`
}
// Posição no array = ordem de entrada nos GRUPOS abaixo — cada grupo tem seu
// próprio grid de 4 colunas (.grid-4), então a posição dentro do array só
// importa relativa ao grupo, não à tela inteira (ver GRUPOS/render).
const ORDEM = ['taxa_prenhez', 'taxa_aproveitamento', 'taxa_paricao_expostas', 'taxa_paricao', 'taxa_aborto', 'mortalidade', 'gmd_terneiros', 'gmd_terneiros_femeas', 'gmd_terneiros_machos', 'kg_bezerro_matriz', 'intervalo_partos', 'kg_nascimento', 'kg_desmame', 'producao_kg', 'producao_valor', 'receita_real_terneiros', 'producao_kg_ha', 'producao_valor_ha', 'receita_real_terneiros_ha', 'custo_insem_terneiro', 'custo_insem_pct_valor', 'custo_insem_total', 'custo_insem_matriz']
// Containers exibidos na tela, nesta ordem — Produção sempre por último.
const GRUPOS = [
  { titulo: 'Reprodução', indicadores: ['taxa_prenhez', 'taxa_aproveitamento', 'taxa_paricao_expostas', 'taxa_paricao', 'intervalo_partos'] },
  { titulo: 'Perdas',     indicadores: ['taxa_aborto', 'mortalidade'] },
  { titulo: 'GMD',        indicadores: ['gmd_terneiros', 'gmd_terneiros_femeas', 'gmd_terneiros_machos', 'kg_bezerro_matriz', 'kg_nascimento', 'kg_desmame'] },
  // Grid de 4 colunas: linha 1 = Kg, Kg/ha, Valor Estimado, Receita Real —
  // linha 2 = Valor Estimado/ha, Receita Real/ha. Cada card real fica na
  // posição logo após seu estimado correspondente (só R$ tem par real; Kg é
  // só estimado — não há "kg vendido" pra comparar).
  { titulo: 'Produção da Safra x Hectare Útil', indicadores: ['producao_kg', 'producao_kg_ha', 'producao_valor', 'receita_real_terneiros', 'producao_valor_ha', 'receita_real_terneiros_ha'] },
  { titulo: 'Custos', indicadores: ['custo_insem_terneiro', 'custo_insem_pct_valor', 'custo_insem_total', 'custo_insem_matriz'] },
]
const IDEAIS = {
  taxa_prenhez: '90%', taxa_paricao: '85%', taxa_paricao_expostas: '75%', gmd_terneiros: '0,8', mortalidade: '5%',
  taxa_aproveitamento: '100%', kg_bezerro_matriz: '>160kg', intervalo_partos: '~365d', taxa_aborto: '<5%',
  kg_desmame: '>180kg', gmd_terneiros_femeas: '0,8', gmd_terneiros_machos: '0,8',
}
// Usados só para auto-criar a linha do indicador na tabela `metas` na primeira
// vez que a tela carrega (a tabela não tem seed automático) — o usuário pode
// ajustar o valor depois em "Editar metas". A tabela `metas` só tem as colunas
// id/conta_id/fazenda_id/indicador/valor_meta — NÃO existe coluna `unidade`
// (a unidade de exibição vem sempre de UNIDADES_PADRAO, nunca do banco).
// Os 4 indicadores de Produção NÃO entram aqui de propósito: kg/R$ totais da
// fazenda variam demais de escala pra ter um "padrão" razoável — ficam sem
// meta ("Sem meta") até o usuário definir um valor em "Editar metas".
const DEFAULTS_NOVOS_INDICADORES = {
  taxa_aproveitamento: 100,
  kg_bezerro_matriz:   160,
  intervalo_partos:    365,
  taxa_aborto:         5,
  kg_desmame:          180,
  gmd_terneiros_femeas: 0.8,
  gmd_terneiros_machos: 0.8,
  // Fase 8 — chave nova (taxa_paricao ANTIGA continua com o default que já
  // tinha configurado, ou sem um aqui mesmo — não mexi nela). 75% é a meta
  // aprovada pra "Taxa de Parição" (partos/expostas) — decisão do usuário,
  // não um número já em uso em nenhum outro lugar.
  taxa_paricao_expostas: 75,
}
// Unidade padrão de cada indicador — usada quando ainda não existe uma linha
// salva no banco (card "virtual"), pra sempre ter algo pra mostrar/editar.
const UNIDADES_PADRAO = {
  taxa_prenhez: '%', taxa_paricao: '%', taxa_paricao_expostas: '%', mortalidade: '%',
  gmd_terneiros: 'kg/dia', gmd_terneiros_femeas: 'kg/dia', gmd_terneiros_machos: 'kg/dia',
  taxa_aproveitamento: '%', kg_bezerro_matriz: 'kg', intervalo_partos: 'dias', taxa_aborto: '%',
  kg_nascimento: 'kg', kg_desmame: 'kg',
  producao_kg: 'kg', producao_valor: 'R$', producao_kg_ha: 'kg/ha', producao_valor_ha: 'R$/ha',
  receita_real_terneiros: 'R$', receita_real_terneiros_ha: 'R$/ha',
  custo_insem_terneiro: 'R$/terneiro', custo_insem_pct_valor: '%', custo_insem_total: 'R$', custo_insem_matriz: 'R$/matriz',
}

// Paleta cíclica pro donut de nascimentos por touro (número de touros é
// variável) — cores vivas e distintas, reaproveitando tons já usados em
// outros pontos do app (azul/roxo/rosa/âmbar/verde/teal/vermelho/ciano).
const CORES_TOURO = ['#2B6CD9', '#7B2FBE', '#DB2777', '#D97706', '#166534', '#0C447C', '#DC2626', '#0891B2']

// ── Curva de parição: agrupa partos no tempo com granularidade adaptativa ──
// Safra curta (até ~2 meses de partos) agrupa por semana; safra média (até ~5
// meses) por dezena de dias; safra longa (todo o ano) por mês — senão o
// gráfico vira uma parede de barras (bins finos demais) ou fica achatado
// (poucos bins grossos demais numa safra curta).
function agruparPorPeriodo(partosArr) {
  const datas = partosArr.map(p => p.data_parto).filter(Boolean).sort()
  if (datas.length === 0) return { modo: null, dados: [] }

  const dMin = new Date(datas[0] + 'T12:00:00')
  const dMax = new Date(datas[datas.length - 1] + 'T12:00:00')
  const spanDias = Math.max(1, Math.round((dMax - dMin) / 86400000))

  const modo = spanDias <= 60 ? 'semana' : spanDias <= 150 ? 'dezena' : 'mes'
  const binDias = modo === 'semana' ? 7 : 10

  const fmtCurta = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const fmtMes   = (d) => {
    const s = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '')
  }

  const bins = new Map() // chave -> { inicio: Date, qtd }
  partosArr.forEach(p => {
    if (!p.data_parto) return
    const d = new Date(p.data_parto + 'T12:00:00')
    let chave, inicioBin
    if (modo === 'mes') {
      chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      inicioBin = new Date(d.getFullYear(), d.getMonth(), 1, 12)
    } else {
      const diasDesdeMin = Math.floor((d - dMin) / 86400000)
      const binIndex = Math.floor(diasDesdeMin / binDias)
      inicioBin = new Date(dMin.getTime() + binIndex * binDias * 86400000)
      chave = String(binIndex)
    }
    if (!bins.has(chave)) bins.set(chave, { inicio: inicioBin, qtd: 0 })
    bins.get(chave).qtd++
  })

  const dados = [...bins.values()]
    .sort((a, b) => a.inicio - b.inicio)
    .map(v => ({ periodo: modo === 'mes' ? fmtMes(v.inicio) : fmtCurta(v.inicio), qtd: v.qtd }))

  return { modo, dados }
}

// ── Avalia status da meta ─────────────────────────────────────────
function avaliar(atual, meta, inverted) {
  if (atual === null || meta === null || meta === 0) return 'sem-dado'
  if (inverted) return atual <= meta ? 'verde' : atual <= meta * 1.1 ? 'amarelo' : 'vermelho'
  const pct = (atual / meta) * 100
  return pct >= 100 ? 'verde' : pct >= 90 ? 'amarelo' : 'vermelho'
}

// Negrito nos símbolos ♂♀ dentro do label de um indicador, sem cor própria
// (herda a cor do texto ao redor). "Terneiros ♂♀" fica colado mesmo quebrando
// linha porque o espaço entre os dois já é NBSP na própria string em CFG, não
// um espaço normal — não precisa de nowrap nem de span extra pra isso aqui.
//
// Retorna UM span só (nunca uma Fragment com vários filhos soltos): o
// container onde isto é usado (.card-title) é display:flex — cada filho
// direto de um flex container vira um item de flex próprio, e texto solto +
// elementos como itens de flex separados quebra de forma esquisita (cada
// pedaço em sua própria "caixa"/linha, em vez de fluir como texto normal).
// Um span só = um item de flex só, com o texto fluindo normalmente por
// dentro dele. label continua string pura em todo lugar que precisa disso
// (gráfico comparativo, toasts de erro — ver CFG/GraficoComparativoModo):
// isto só aplica o negrito na hora de renderizar em JSX (card e modal).
function labelComSexo(label) {
  const partes = (label || '').split('♂♀')
  if (partes.length !== 2) return label
  return <span>{partes[0]}<strong>♂♀</strong>{partes[1]}</span>
}

function statusSty(s, semDadosMsg) {
  if (s === 'verde')    return { dot: '#27A838', bg: '#E8F0FC', borda: '#A5C8F5', cor: '#1A5C25', txt: 'Atingiu a meta'       }
  if (s === 'amarelo')  return { dot: '#D97706', bg: '#FEF3C7', borda: '#F3D5A3', cor: '#633806', txt: 'Próximo da meta'      }
  if (s === 'vermelho') return { dot: '#E24B4A', bg: '#FCEBEB', borda: '#F5B5B5', cor: '#791F1F', txt: 'Abaixo da meta'      }
  return                        { dot: '#9CA3AF', bg: '#F9FAFB', borda: '#E5E7EB', cor: '#6B7280', txt: semDadosMsg || 'Sem dados suficientes' }
}

// ── Card de indicador ─────────────────────────────────────────────
function IndicadorCard({ meta, atual, subtitulo }) {
  const cfg    = CFG[meta.indicador] || {}
  const status = avaliar(atual, meta.valor_meta, cfg.inverted)
  const sty    = statusSty(status, cfg.semDadosMsg)

  // Indicadores em R$ (inclusive "R$ por algo": /ha, /terneiro, /matriz) usam
  // fmtMoeda (já inclui "R$" formatado) em vez de toFixed — nesse caso o
  // sufixo abaixo não repete a unidade (senão viraria "R$ 1.234,56 R$"), só
  // mostra o "/algo" quando for o caso.
  const ehMonetario = meta.unidade === 'R$' || meta.unidade.startsWith('R$/')
  const fmtVal  = (v) => {
    if (v === null || isNaN(v)) return null
    if (ehMonetario) return fmtMoeda(v)
    if (meta.unidade === 'kg/dia') return v.toFixed(3)
    return v.toFixed(1)
  }
  const sufixo   = ehMonetario ? (meta.unidade.startsWith('R$/') ? '/' + meta.unidade.split('/')[1] : '') : meta.unidade
  const atualFmt = fmtVal(atual)
  const metaFmt  = meta.valor_meta != null ? fmtVal(parseFloat(meta.valor_meta)) : null

  // Barra: quanto do alvo foi atingido (0-100%)
  const barPct = (atual !== null && meta.valor_meta > 0)
    ? Math.min(100, cfg.inverted
        ? (atual === 0 ? 100 : (meta.valor_meta / atual) * 100)
        : (atual / meta.valor_meta) * 100)
    : 0

  return (
    <div className="card" style={{ borderTop: `3px solid ${sty.dot}`, position: 'relative' }}>
      {/* Semáforo dot */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        width: 14, height: 14, borderRadius: '50%',
        background: sty.dot, boxShadow: `0 0 8px ${sty.dot}80`
      }} />

      <div style={{ fontSize: 20, marginBottom: 4 }}>{cfg.icon}</div>
      <div className="card-title" style={{ marginBottom: 3, paddingRight: 24 }}>{labelComSexo(cfg.label)}</div>
      {/* "(Estimado)" saiu do título (não cabia em duas linhas) e virou este
          badge — só nos 2 cards de valor estimado, ao lado do card de
          Receita Real correspondente pra distinção ficar clara. Div (bloco)
          em volta do Badge (span) pra garantir espaçamento vertical
          confiável — margin em inline não empurra o próximo bloco. */}
      {cfg.estimado && <div style={{ marginBottom: 8 }}><Badge color="gray">Estimado</Badge></div>}
      <div style={{ fontSize: '.71rem', color: '#9CA3AF', marginBottom: 14 }}>{cfg.desc}</div>

      {/* Valores */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: sty.cor, lineHeight: 1.1 }}>
            {atualFmt !== null ? `${atualFmt}` : '—'}&nbsp;
            <span style={{ fontSize: '.85rem', fontWeight: 500 }}>{sufixo}</span>
          </div>
          <div style={{ fontSize: '.71rem', color: '#9CA3AF', marginTop: 3 }}>Valor atual</div>
          {cfg.mostraSubtitulo && (
            <div style={{ fontSize: '.68rem', color: '#B0B7C3', marginTop: 2, minHeight: 14 }}>
              {atual !== null && subtitulo ? subtitulo : ' '}
            </div>
          )}
        </div>
        <div style={{ borderLeft: '1.5px solid #F3F4F6', paddingLeft: 20 }}>
          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#9CA3AF', lineHeight: 1.1 }}>
            {metaFmt !== null ? `${metaFmt}` : 'Sem meta'}&nbsp;
            {metaFmt !== null && <span style={{ fontSize: '.85rem', fontWeight: 500 }}>{sufixo}</span>}
          </div>
          <div style={{ fontSize: '.71rem', color: '#9CA3AF', marginTop: 3 }}>Meta</div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${barPct}%`, borderRadius: 4,
            background: sty.dot, transition: 'width .6s ease'
          }} />
        </div>
        <div style={{ fontSize: '.70rem', color: '#9CA3AF', marginTop: 3 }}>
          {atual !== null ? `${barPct.toFixed(0)}% da meta${cfg.inverted ? ' (menor = melhor)' : ''}` : 'Sem dados'}
        </div>
      </div>

      {/* Badge de status */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: sty.bg, color: sty.cor,
        borderRadius: 8, padding: '4px 10px', fontSize: '.75rem', fontWeight: 600
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sty.dot, flexShrink: 0 }} />
        {sty.txt}
      </div>
    </div>
  )
}

// ── Gráficos por container ──────────────────────────────────────────
// Estilo compartilhado: gradiente azul→roxo (mesma dupla de cores já usada em
// CORES_TOURO/sexo do app), tooltip com cantos arredondados, sem dependência
// nova (tudo recharts, já usado no resto do arquivo).
const TOOLTIP_STY = { contentStyle: { borderRadius: 10, border: '1px solid #E5E7EB', fontSize: '.8rem', boxShadow: '0 4px 16px rgba(0,0,0,.08)' } }

function SemDadosGrafico({ texto }) {
  return <p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '28px 0' }}>{texto}</p>
}

// Reprodução — curva de parição, restilizada (gradiente + tooltip claro).
function GraficoParicao({ dados, modo, cicloNome }) {
  if (!dados || dados.length === 0) return <SemDadosGrafico texto="Sem nascimentos registrados neste ciclo." />
  return (
    <>
      <div style={{ fontSize: '.72rem', color: '#9CA3AF', marginBottom: 8 }}>
        Nascimentos agrupados por {modo === 'semana' ? 'semana' : modo === 'dezena' ? 'dezena de dias' : 'mês'} — mostra o início, o pico e o fim da parição do ciclo {cicloNome || '—'}.
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={dados} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id="gradParicao" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2B6CD9" stopOpacity={1} />
              <stop offset="100%" stopColor="#7B2FBE" stopOpacity={.85} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="periodo" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip {...TOOLTIP_STY} formatter={v => [`${v} nascimento${v !== 1 ? 's' : ''}`, 'Nascimentos']} cursor={{ fill: 'rgba(43,108,217,.06)' }} />
          <Bar dataKey="qtd" name="Nascimentos" fill="url(#gradParicao)" radius={[6, 6, 0, 0]}>
            <LabelList dataKey="qtd" position="top" style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  )
}

// Perdas — donut de desfechos da safra (vivos/mortos/abortos/perdas não
// identificadas/gestando), mesmas variáveis já usadas nos cards de taxa_aborto
// e mortalidade, só reorganizadas visualmente.
function GraficoDesfechos({ dados }) {
  if (!dados) return null
  const fatias = [
    { name: 'Vivos',                value: dados.vivos,                color: '#27A838' },
    { name: 'Mortos',                value: dados.mortos,               color: '#E24B4A' },
    { name: 'Abortos',               value: dados.abortos,              color: '#D97706' },
    { name: 'Perdas não identif.',   value: dados.perdasNaoIdentificadas, color: '#7B2FBE' },
    { name: 'Gestando',              value: dados.gestando,             color: '#2B6CD9' },
  ].filter(d => d.value > 0)
  const total = fatias.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <SemDadosGrafico texto="Sem desfechos de prenhez registrados neste ciclo ainda." />
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
      <ResponsiveContainer width={200} height={190}>
        <PieChart>
          <Pie data={fatias} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" labelLine={false}>
            {fatias.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip {...TOOLTIP_STY} formatter={(v, name) => [`${v} (${Math.round(v / total * 100)}%)`, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fatias.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: '.83rem', color: '#374151' }}>
              {d.name}: <strong>{d.value}</strong> · {Math.round(d.value / total * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// GMD — histograma de GMD individual (buckets) + comparativo fêmeas x machos
// x meta. Cores reaproveitam a linguagem de semáforo já usada nos cards
// (vermelho/âmbar/azul/verde = pior→melhor).
const BUCKETS_GMD = [
  { faixa: '< 0,5',      min: -Infinity, max: 0.5,      cor: '#E24B4A' },
  { faixa: '0,5 – 0,8',  min: 0.5,       max: 0.8,      cor: '#D97706' },
  { faixa: '0,8 – 1,0',  min: 0.8,       max: 1.0,      cor: '#2B6CD9' },
  { faixa: '≥ 1,0',      min: 1.0,       max: Infinity, cor: '#27A838' },
]
function GraficoHistogramaGMD({ valores }) {
  if (!valores || valores.length === 0) return <SemDadosGrafico texto="Sem terneiros com GMD calculável neste ciclo." />
  const dados = BUCKETS_GMD.map(b => ({
    ...b, qtd: valores.filter(v => v >= b.min && v < b.max).length,
  }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={dados} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="faixa" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip {...TOOLTIP_STY} formatter={v => [`${v} terneiro${v !== 1 ? 's' : ''}`, 'Quantidade']} />
        <Bar dataKey="qtd" name="Terneiros" radius={[6, 6, 0, 0]}>
          {dados.map((d, i) => <Cell key={i} fill={d.cor} />)}
          <LabelList dataKey="qtd" position="top" style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
function GraficoComparativoGMD({ femeas, machos }) {
  if (femeas == null && machos == null) return <SemDadosGrafico texto="Sem GMD calculável por sexo neste ciclo." />
  const dados = [
    { nome: 'Fêmeas', gmd: femeas || 0, cor: '#DB2777' },
    { nome: 'Machos',  gmd: machos || 0, cor: '#2B6CD9' },
  ]
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={dados} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip {...TOOLTIP_STY} formatter={v => [`${Number(v).toFixed(3)} kg/dia`, 'GMD']} />
        <ReferenceLine y={0.8} stroke="#7B2FBE" strokeDasharray="5 4" label={{ value: 'Meta 0,80', position: 'insideTopRight', fill: '#7B2FBE', fontSize: 10, fontWeight: 600 }} />
        <Bar dataKey="gmd" name="GMD" radius={[6, 6, 0, 0]}>
          {dados.map((d, i) => <Cell key={i} fill={d.cor} />)}
          <LabelList dataKey="gmd" position="top" formatter={v => v.toFixed(2)} style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Produção — barras kg e valor, agrupadas por sexo (macho/fêmea), lado a lado.
function GraficoProducaoPorSexo({ dados }) {
  if (!dados) return null
  const { kgMachos, kgFemeas, valorMachos, valorFemeas, temValorCadastrado } = dados
  if (kgMachos === 0 && kgFemeas === 0) return <SemDadosGrafico texto="Sem pesagens de terneiros da safra ainda." />
  const dadosKg  = [{ nome: 'Machos', valor: kgMachos, cor: '#2B6CD9' }, { nome: 'Fêmeas', valor: kgFemeas, cor: '#DB2777' }]
  const dadosR$  = [{ nome: 'Machos', valor: valorMachos, cor: '#2B6CD9' }, { nome: 'Fêmeas', valor: valorFemeas, cor: '#DB2777' }]
  return (
    <div className="grid-2">
      <div>
        <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Kg produzido por sexo</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dadosKg} margin={{ top: 16, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip {...TOOLTIP_STY} formatter={v => [`${Number(v).toFixed(1)} kg`, 'Peso']} />
            <Bar dataKey="valor" name="Kg" radius={[6, 6, 0, 0]}>
              {dadosKg.map((d, i) => <Cell key={i} fill={d.cor} />)}
              <LabelList dataKey="valor" position="top" formatter={v => v.toFixed(0)} style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Valor produzido por sexo</div>
        {temValorCadastrado ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dadosR$} margin={{ top: 16, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip {...TOOLTIP_STY} formatter={v => [fmtMoeda(v), 'Valor']} />
              <Bar dataKey="valor" name="R$" radius={[6, 6, 0, 0]}>
                {dadosR$.map((d, i) => <Cell key={i} fill={d.cor} />)}
                <LabelList dataKey="valor" position="top" formatter={v => fmtMoeda(v)} style={{ fontSize: 9, fill: '#374151', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <SemDadosGrafico texto="Cadastre o preço de Terneiro/Terneira em Parâmetros." />}
      </div>
    </div>
  )
}

// Custos — série comparativa de custo de Inseminação por ciclo (única fonte
// disponível hoje é o grupo financeiro 'Inseminação' — ver CFG). O ciclo
// selecionado atualmente fica destacado no gradiente azul→roxo; os demais em
// cinza-azulado, pra servir de referência histórica sem competir visualmente.
function GraficoCustoPorCiclo({ dados, cicloAtualNome }) {
  if (!dados || dados.every(d => d.total === 0)) return <SemDadosGrafico texto="Sem despesas dos grupos 'Inseminação' ou 'Monta Natural' lançadas em nenhum ciclo ainda." />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="gradCusto" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2B6CD9" stopOpacity={1} />
            <stop offset="100%" stopColor="#7B2FBE" stopOpacity={.85} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="ciclo" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
        <Tooltip {...TOOLTIP_STY} formatter={v => [fmtMoeda(v), "Inseminação + Monta Natural"]} />
        <Bar dataKey="total" name="Custo de Monta (Inseminação + Monta Natural)" radius={[6, 6, 0, 0]}>
          {dados.map((d, i) => <Cell key={i} fill={d.ciclo === cicloAtualNome ? 'url(#gradCusto)' : '#CBD5E1'} />)}
          <LabelList dataKey="total" position="top" formatter={v => v > 0 ? fmtMoeda(v) : ''} style={{ fontSize: 9, fill: '#374151', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Fase 2 — Monta Natural: resolução de indicador → campo do bloco ────────
// Um lugar só traduzindo indicador (chave de CFG/ORDEM) pro campo correspondente
// dentro de um bloco calculado (ia/natural/consolidado) — usado tanto por
// construirAtuais (valor exibido nos cards) quanto por GraficoComparativoModo
// (mesmos números, só reaproveitados na visualização, sem cálculo novo).
function valorIndicadorDoBloco(ind, bloco, temValorCadastrado) {
  if (!bloco) return null
  switch (ind) {
    case 'taxa_prenhez':         return bloco.taxaPrenhez
    case 'taxa_aproveitamento':  return bloco.taxaAproveitamento
    case 'taxa_paricao':         return bloco.taxaParicao
    case 'taxa_paricao_expostas': return bloco.taxaParicaoExpostas
    case 'intervalo_partos':     return bloco.intervaloPartos
    case 'taxa_aborto':          return bloco.taxaAborto
    case 'mortalidade':          return bloco.mortalidade
    case 'gmd_terneiros':        return bloco.gmdTerneiros
    case 'gmd_terneiros_femeas': return bloco.gmdTerneirosFemeas
    case 'gmd_terneiros_machos': return bloco.gmdTerneirosMachos
    case 'kg_bezerro_matriz':    return bloco.kgBezerroMatriz
    case 'kg_nascimento':        return bloco.kgNascimento
    case 'kg_desmame':           return bloco.kgDesmame
    case 'producao_kg':          return bloco.pesosSafraLength > 0 ? bloco.kgProduzido : null
    case 'producao_valor':       return temValorCadastrado ? bloco.valorProduzido : null
    case 'producao_kg_ha':       return bloco.kgPorHa
    case 'producao_valor_ha':    return temValorCadastrado ? bloco.valorPorHa : null
    case 'receita_real_terneiros':    return bloco.receitaRealTerneiros
    case 'receita_real_terneiros_ha': return bloco.receitaRealTerneirosHa
    case 'custo_insem_terneiro':  return bloco.custoPorTerneiro
    case 'custo_insem_pct_valor': return bloco.custoPctValor
    case 'custo_insem_total':     return bloco.custoInseminacaoTotal
    case 'custo_insem_matriz':    return bloco.custoPorMatriz
    default: return null
  }
}

// `atuais` (valor de cada card) deriva de blocosPorModo + o modo escolhido em
// cada contêiner — NUNCA um cálculo novo, sempre valorIndicadorDoBloco lendo o
// bloco certo. Com todo modo em 'consolidado' (default), isso lê só
// blocos.consolidado pra tudo = exatamente o cálculo de hoje == regressão-zero.
// Custos em modo 'natural' usa o grupo financeiro 'Monta Natural' (ver
// calcularBloco em loadAll) — deixou de ser um null forçado.
function construirAtuais(blocos, modos, temValorCadastrado) {
  if (!blocos) return {}
  const modoPorTitulo = {
    'Reprodução': modos.reproducao, 'Perdas': modos.perdas, 'GMD': modos.gmd,
    'Produção da Safra x Hectare Útil': modos.producao, 'Custos': modos.custos,
  }
  const out = {}
  GRUPOS.forEach(grupo => {
    const modo = modoPorTitulo[grupo.titulo]
    grupo.indicadores.forEach(ind => {
      out[ind] = valorIndicadorDoBloco(ind, blocos[modo], temValorCadastrado)
    })
  })
  return out
}

const MODOS_LABEL = { ia: 'Inseminação', natural: 'Monta Natural', consolidado: 'Consolidado' }
// Seletor de 3 estados acima de cada contêiner — default sempre 'consolidado'.
function SeletorModo({ value, onChange }) {
  return (
    <div className="pill-group" style={{ marginBottom: 12 }}>
      {['ia', 'natural', 'consolidado'].map(m => (
        <button key={m} className={`pill ${value === m ? 'active' : ''}`} onClick={() => onChange(m)}>
          {MODOS_LABEL[m]}
        </button>
      ))}
    </div>
  )
}

// Modo Consolidado: gráfico comparativo IA × Monta Natural, um par de barras
// por indicador do contêiner — mesmos números já calculados nos 2 modos
// (valorIndicadorDoBloco), sem cálculo novo, só a visualização lado a lado.
function GraficoComparativoModo({ indicadores, blocoIA, blocoNatural, temValorCadastrado }) {
  const dados = indicadores
    .filter(ind => ind !== 'intervalo_partos' || blocoIA.intervaloPartos != null || blocoNatural.intervaloPartos != null)
    .map(ind => ({
      nome: CFG[ind]?.label || ind,
      IA:      valorIndicadorDoBloco(ind, blocoIA, temValorCadastrado),
      Natural: valorIndicadorDoBloco(ind, blocoNatural, temValorCadastrado),
    }))
    .filter(d => d.IA != null || d.Natural != null)
  if (dados.length === 0) return <SemDadosGrafico texto="Sem dados de IA nem de monta natural neste ciclo pra comparar." />
  return (
    <div>
      <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>
        Comparativo IA × Monta Natural
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={dados} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="nome" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" interval={0} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip {...TOOLTIP_STY} formatter={v => v == null ? '—' : Number(v).toFixed(2)} />
          <Legend wrapperStyle={{ fontSize: '.75rem' }} />
          <Bar dataKey="IA" name="Inseminação" fill="#2B6CD9" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Natural" name="Monta Natural" fill="#7B2FBE" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Metas() {
  const contentRef = useRef(null)
  // Guarda contra corrida entre loadAll()s sobrepostos — cicloLocal começa
  // null (useCicloLocal) e vira o ciclo real assim que carrega, disparando o
  // useEffect [cicloLocal?.id] de novo com uma 2ª chamada em paralelo. Sem
  // isto, a chamada MAIS LENTA vence (não a mais recente): se a 1ª (ciclo
  // null → lotesCiclo=[] → tudo zerado) resolver DEPOIS da 2ª (ciclo real,
  // dados corretos), o painel fica com "Sem dados" mesmo com o ciclo certo
  // selecionado — indistinguível na tela de um bug de cálculo (foi assim que
  // pareceu que vender uma vaca zerava matrizes aptas: a venda só levou o
  // usuário de volta pra Metas, remontando o componente e reabrindo a janela
  // de corrida). loadSeqRef marca qual chamada é a mais recente; qualquer
  // chamada que termine depois de ter sido superada só é descartada, nunca
  // aplicada ao estado.
  const loadSeqRef = useRef(0)

  const [loading,      setLoading]      = useState(true)
  const [metas,        setMetas]        = useState([])
  const [semTabela,    setSemTabela]    = useState(false)
  const [loadError,    setLoadError]    = useState(false)
  const [editOpen,     setEditOpen]     = useState(false)
  const [editVals,     setEditVals]     = useState({})
  const [salvandoMeta, setSalvandoMeta] = useState(false)
  const [proprietarios, setProprietarios] = useState([])
  const [filtroProp,    setFiltroProp]    = useState('')
  const [sexoTerneiros, setSexoTerneiros] = useState({ machos: 0, femeas: 0 })
  const [nascPorTouro,  setNascPorTouro]  = useState([])
  const [nascPorTouroSexo, setNascPorTouroSexo] = useState([])
  const [nascPorPeriodo,   setNascPorPeriodo]   = useState([])
  const [modoAgrupamento,  setModoAgrupamento]  = useState(null)
  const [producaoSafra,    setProducaoSafra]    = useState(null)
  const [custosDetalhes,   setCustosDetalhes]   = useState(null)
  const [custoPorCiclo,    setCustoPorCiclo]    = useState([])
  const [seriesPrecoVenda3D,   setSeriesPrecoVenda3D]   = useState([])
  // Fase 2 — Monta Natural: bloco de indicadores calculado 3x por load (uma
  // vez por modo: ia/natural/consolidado — ver calcularBloco em loadAll),
  // guardado bruto aqui. `atuais`/gmdIndividuais/desfechosSafra/produção-por-
  // sexo NÃO são mais state — são derivados NO RENDER a partir disto + qual
  // modo está selecionado em cada contêiner, pra trocar o seletor não exigir
  // um novo fetch (ver construção logo antes do return principal, abaixo).
  const [blocosPorModo, setBlocosPorModo] = useState(null)
  // Seletor de modo por contêiner (Reprodução/Perdas/GMD/Produção/Custos) —
  // default SEMPRE 'consolidado': é o cálculo de hoje, inalterado (lotesCiclo
  // inteiro, sem filtro por tipo) — regressão-zero por construção, sem
  // precisar o usuário trocar nada pra ver os números de sempre.
  const [modoReproducao, setModoReproducao] = useState('consolidado')
  const [modoPerdas,     setModoPerdas]     = useState('consolidado')
  const [modoGmd,        setModoGmd]        = useState('consolidado')
  const [modoProducao,   setModoProducao]   = useState('consolidado')
  const [modoCustos,     setModoCustos]     = useState('consolidado')
  // Filtro GERAL (topo da tela) — Opção A: continua existindo ao lado dos 5
  // seletores por contêiner, sincronizado num sentido só. Trocar o geral
  // aplica o mesmo modo aos 5 de uma vez (aplicarModoGeral abaixo); trocar um
  // contêiner individual depois disso só sobrescreve aquele um — o geral não
  // fica "grudado" tentando refletir um consenso entre os 5 (não recalcula
  // nada, só dispara os mesmos 5 setters que os seletores individuais já
  // usavam — nenhum cálculo novo, nenhum toque em matrizesAptas/ehMatriz).
  const [modoGeral, setModoGeral] = useState('consolidado')
  const aplicarModoGeral = (m) => {
    setModoGeral(m)
    setModoReproducao(m); setModoPerdas(m); setModoGmd(m); setModoProducao(m); setModoCustos(m)
  }

  const { podeEditar } = usePermissoes()
  const podeEditarMetas = podeEditar('metas')
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()

  useEffect(() => { loadAll() }, [cicloLocal?.id, filtroProp])

  const loadAll = async () => {
    const mySeq = ++loadSeqRef.current
    setLoading(true)
    setLoadError(false)
    try {
      // Metas da tabela (metasErr = tabela não existe, não é erro de rede)
      const { data: metasDataRaw, error: metasErr } = await db.metas.list()
      if (mySeq !== loadSeqRef.current) return // superada por um loadAll() mais novo
      if (metasErr) {
        setSemTabela(true)
        return
      }
      let metasData = metasDataRaw || []

      // Auto-cria a linha dos indicadores novos na primeira vez que a tela
      // carrega nesta conta/fazenda (a tabela `metas` não tem seed automático,
      // e o campo `indicador` é texto livre — não precisa de ALTER no banco).
      // O usuário ajusta o valor-alvo depois em "Editar metas".
      if (podeEditarMetas) {
        const existentes = new Set(metasData.map(m => m.indicador))
        const faltantes = Object.keys(DEFAULTS_NOVOS_INDICADORES).filter(k => !existentes.has(k))
        if (faltantes.length > 0) {
          const criadas = await Promise.all(
            faltantes.map(ind => db.metas.insert({ indicador: ind, valor_meta: DEFAULTS_NOVOS_INDICADORES[ind] }))
          )
          metasData = [...metasData, ...criadas.filter(r => !r.error && r.data).map(r => r.data)]
        }
      }
      setMetas(metasData)

      // Ciclo selecionado localmente na tela (SeletorCicloLocal), inicia a
      // partir do ciclo global mas pode ser trocado sem afetar o resto do app.
      const ciclo = cicloLocal

      // Carregar dados para cálculo em paralelo. lotesInseminacao.list traz o
      // funil completo (inseminações + partos + abortos + pesagens de desmame
      // do bezerro) — mesma fonte usada em Reprodutivo.jsx, pra não divergir.
      const resultados = await Promise.all([
        ciclo ? db.lotesInseminacao.list(ciclo.id) : { data: [] },
        db.partos.listAll(),
        db.animais.list(),
        db.pesagens.listAll(),
        db.proprietarios.list(),
        db.categoriasPreco.list(),
        db.piquetes.list(),
        db.lancamentos.listAll(),
        db.transacoes.listVendas(),
        db.transacaoAnimaisItens.listDataEntradaCompras(),
        db.transacaoAnimaisItens.listVendasAnimais(),
      ])
      if (mySeq !== loadSeqRef.current) return // superada por um loadAll() mais novo
      if (algumErro('[Metas]', resultados)) { setLoadError(true); return }
      const [rLotes, rPartosTodos, rAnimais, rPesagens, rProps, rCatPrecos, rPiquetes, rLancamentos, rVendas, rEntradas, rVendasAnimaisItens] = resultados
      setProprietarios(rProps.data || [])

      const lotesCiclo    = rLotes.data       || []
      const todasPesagens = rPesagens.data    || []
      const todosPartos   = rPartosTodos.data || []
      // data_entrada (só animais comprados — ver ehMatriz em helpers.js) mesclada
      // uma vez aqui, uma query só pra toda a lista (nunca N+1 por animal).
      const entradaMap = new Map(
        (rEntradas.data || []).map(r => [r.animal_id, r.transacoes_animais?.data || null])
      )
      const todosAnimais = (rAnimais.data || []).map(a => ({ ...a, data_entrada: entradaMap.get(a.id) || null }))

      // Filtro por proprietário — mesmo padrão usado em Rebanho/Reprodutivo
      // (via animal.proprietario_id, embutido nos embeds da query).
      const filtrar = (arr, getPropId) => filtroProp ? arr.filter(x => getPropId(x) === filtroProp) : arr

      // ── Matrizes aptas (denominador comum aos 3 modos — o pool de fêmeas
      // elegíveis não depende do método de cobertura) e recursos físicos/
      // financeiros, todos INVARIANTES por modo — calculados 1x, antes do
      // bloco por-modo abaixo.
      const primeiraMontaCiclo = lotesCiclo.map(l => l.data).filter(Boolean).sort()[0] || null
      const animaisFiltrados   = filtroProp ? todosAnimais.filter(a => a.proprietario_id === filtroProp) : todosAnimais
      const matrizesAptas      = primeiraMontaCiclo ? contarMatrizes(animaisFiltrados, primeiraMontaCiclo) : 0

      const dentroCicloLocal = (d) => !!(d && cicloLocal && d >= cicloLocal.inicio && d <= cicloLocal.fim)

      const catPrecosData  = rCatPrecos.data || []
      const catTerneiro    = catPrecosData.find(c => c.categoria === 'Terneiro')
      const catTerneira    = catPrecosData.find(c => c.categoria === 'Terneira')
      const valorUnitTerneiro = catTerneiro ? (catTerneiro.peso_medio || 0) * (catTerneiro.preco_kg || 0) : 0
      const valorUnitTerneira = catTerneira ? (catTerneira.peso_medio || 0) * (catTerneira.preco_kg || 0) : 0
      const temValorCadastrado = !!(catTerneiro || catTerneira)

      const hectareUtil = (rPiquetes.data || []).reduce((s, p) => s + (parseFloat(p.area_ha) || 0), 0)

      // Receita real de vendas (Terneiro/Terneira) — filtrada por SAFRA dentro
      // de calcularBloco (bezerroIdsSafra), não aqui: sem escopo de categoria
      // nem de ciclo, ver comentário em db.transacaoAnimaisItens.listVendasAnimais.
      const vendasAnimaisItens = rVendasAnimaisItens.data || []

      // Peso mais recente do bezerro — TODA pesagem conta, inclusive
      // compra/venda (peso real do lote pesado no negócio).
      const pesoTerneiroSafra = (bezerroId) => {
        const todas = todasPesagens.filter(p => p.animal_id === bezerroId)
        if (todas.length === 0) return null
        const maisRecente = [...todas].sort((a, b) => b.data.localeCompare(a.data))[0]
        return parseFloat(maisRecente.peso_kg) || null
      }

      // ── Custos — cada modo tem seu PRÓPRIO grupo financeiro de origem:
      // IA usa 'Inseminação', Natural usa 'Monta Natural' (espelha 'Inseminação'
      // — mesmo mecanismo, custo de touro/monta natural), Consolidado soma os
      // dois. Sempre lancamentos_financeiros tipo='D', agrupados pela DATA do
      // lançamento dentro do intervalo do ciclo selecionado — NÃO pelo
      // `ciclo_id` gravado nele, porque a despesa da monta pode ter sido
      // lançada já no ciclo seguinte e ainda assim pertencer à safra deste
      // ciclo. null (não 0) quando não há nenhum lançamento do(s) grupo(s) do
      // modo no período — "sem despesa lançada" é diferente de "custou zero".
      const todosLancamentos = rLancamentos.data || []
      const despesasInseminacaoCiclo = todosLancamentos.filter(l =>
        l.tipo === 'D' && l.grupo === 'Inseminação' && dentroCicloLocal(l.data)
      )
      const despesasMontaNaturalCiclo = todosLancamentos.filter(l =>
        l.tipo === 'D' && l.grupo === 'Monta Natural' && dentroCicloLocal(l.data)
      )
      const custoInseminacaoTotal = despesasInseminacaoCiclo.length > 0
        ? despesasInseminacaoCiclo.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0)
        : null
      const custoMontaNaturalTotal = despesasMontaNaturalCiclo.length > 0
        ? despesasMontaNaturalCiclo.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0)
        : null
      const custoConsolidadoTotal = (custoInseminacaoTotal != null || custoMontaNaturalTotal != null)
        ? (custoInseminacaoTotal || 0) + (custoMontaNaturalTotal || 0)
        : null
      setCustosDetalhes({
        ia:          { nLancamentos: despesasInseminacaoCiclo.length },
        natural:     { nLancamentos: despesasMontaNaturalCiclo.length },
        consolidado: { nLancamentos: despesasInseminacaoCiclo.length + despesasMontaNaturalCiclo.length },
      })

      // ── Bloco de indicadores POR MODO (Fase 2 — Monta Natural). Mecanismo
      // único: filtra os LOTES por tipo antes de rodar a MESMA fórmula que já
      // existia. calcularBloco(lotesCiclo) [= "Consolidado"] é bit-a-bit o
      // cálculo de hoje, sem nenhuma linha alterada — regressão-zero por
      // construção, nunca por coincidência.
      const calcularBloco = (lotesX, custoTotalModo) => {
        // taxa_prenhez / taxa_aproveitamento — prenhas deduplica por
        // animal_id (contarPrenhas), senão nem taxaPrenhez nem os
        // denominadores abaixo ficam corretos.
        const todasInseminacoes = filtrar(lotesX.flatMap(l => l.inseminacoes || []), i => i.animal?.proprietario_id)
        const prenhas           = contarPrenhas(todasInseminacoes)
        const matrizesExpostas  = contarExpostas(todasInseminacoes)
        const taxaPrenhez       = calcTaxaPrenhez(todasInseminacoes)
        const taxaAproveitamento = matrizesAptas > 0 ? (matrizesExpostas / matrizesAptas) * 100 : null

        // taxa_paricao / kg_bezerro_matriz — partos ANCORADOS no lote (safra
        // da monta): podem cair no ciclo seguinte, mas pertencem à safra da
        // monta deste ciclo/modo. _touroLote/_loteNumero/_loteTouros só pra
        // resolver o rótulo do gráfico "por touro" mais abaixo (Frente B —
        // lote de monta natural com vários touros vira paternidade indefinida,
        // nunca atribuída ao 1º touro).
        const partosSafra = filtrar(
          lotesX.flatMap(l => (l.partos || []).map(p => ({
            ...p, _touroLote: l.touro, _loteNumero: l.numero, _loteTouros: l.lote_touros,
          }))),
          p => p.mae?.proprietario_id
        )
        const nPartos     = partosSafra.length
        // Guardado por nPartos > 0: com prenhas>0 mas zero partos ainda, a
        // safra só está em andamento — 0% pareceria "parição ruim" quando na
        // verdade é "ainda não tem o que medir".
        const taxaParicao = (prenhas > 0 && nPartos > 0) ? (nPartos / prenhas) * 100 : null
        // Fase 8 — "Taxa de Parição" oficial (padrão do setor): partos ÷
        // matrizes EXPOSTAS, não prenhas (ver CFG.taxa_paricao_expostas).
        const taxaParicaoExpostas = (matrizesExpostas > 0 && nPartos > 0) ? (nPartos / matrizesExpostas) * 100 : null
        const desmameMetrics  = calcDesmameMetrics(partosSafra, matrizesExpostas)
        const kgBezerroMatriz = desmameMetrics.kgPorMatrizExposta
        const kgNascimento    = desmameMetrics.pesoMedioNascimento
        const kgDesmame       = desmameMetrics.pesoMedioDesmame

        // taxa_aborto (perda gestacional) — soma "gestando" lote a lote, pois
        // cada lote tem sua própria data de monta; calcGestacaoLote é a MESMA
        // fórmula usada em Reprodutivo.jsx. abortos JÁ têm lote_inseminacao_id
        // gravado (confirmado no insert de salvarAborto em Reprodutivo.jsx) —
        // então perda gestacional por modo é confiável, sem dado faltando.
        const abortosSafra = filtrar(lotesX.flatMap(l => l.abortos || []), a => a.animal?.proprietario_id)
        const nAbortos = abortosSafra.length
        let gestandoTotal = 0
        lotesX.forEach(l => {
          const insLote     = filtrar(l.inseminacoes || [], i => i.animal?.proprietario_id)
          const partosLote  = filtrar(l.partos || [],       p => p.mae?.proprietario_id)
          const abortosLote = filtrar(l.abortos || [],      a => a.animal?.proprietario_id)
          gestandoTotal += calcGestacaoLote(l.data, contarPrenhas(insLote), partosLote.length, abortosLote.length).gestando
        })
        const perdasNaoIdentificadas = Math.max(0, prenhas - nPartos - nAbortos - gestandoTotal)
        const desfechosResolvidos = nPartos + nAbortos + perdasNaoIdentificadas
        const taxaAborto = (prenhas > 0 && desfechosResolvidos > 0) ? ((nAbortos + perdasNaoIdentificadas) / prenhas) * 100 : null

        // gmd_terneiros/_femeas/_machos — cohort ANCORADO NA SAFRA DA MONTA
        // (mesmo anchor de nPartos/produção acima), EXATAMENTE partosSafra
        // deste modo — GMD, nPartos e produção sempre falam do mesmo conjunto
        // de terneiros, agora também dentro de cada modo. Só exclui morto.
        // TODA pesagem do animal entra (inclusive compra/venda). Categoria
        // avaliada na data da ÚLTIMA pesagem, não em "hoje".
        const bezerroIdsSafra = new Set(partosSafra.map(p => p.bezerro_id).filter(Boolean))
        const candidatosGmd = animaisFiltrados.filter(a => a.situacao !== 'morto' && bezerroIdsSafra.has(a.id))
        const gmdsT = [], gmdsF = [], gmdsM = []
        for (const t of candidatosGmd) {
          const ps = todasPesagens.filter(p => p.animal_id === t.id).sort((a, b) => a.data.localeCompare(b.data))
          if (ps.length < 2) continue
          const dataUltimaPesagem = ps[ps.length - 1].data
          if (!['Terneiro', 'Terneira'].includes(calcCategoria(t.data_nascimento, t.sexo, dataUltimaPesagem))) continue
          const g = parseFloat(calcGMD(ps))
          if (g > 0) {
            gmdsT.push(g)
            if (t.sexo === 'F') gmdsF.push(g)
            else if (t.sexo === 'M') gmdsM.push(g)
          }
        }
        const media = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null

        // mortalidade — de bezerros da safra (partosSafra deste modo), não do
        // rebanho geral; só avalia depois que nasceu o 1º bezerro (nPartos>0).
        const mortosBezerros = partosSafra.filter(p => p.bezerro?.situacao === 'morto').length
        const mortalidade = nPartos > 0 ? (mortosBezerros / nPartos) * 100 : null

        // Proporção de sexo + produção (kg/valor/ha) — mesma base partosSafra
        // deste modo, mesmas fórmulas de sempre (ver comentário original em
        // versões anteriores deste arquivo/git history).
        const qtdMachos = partosSafra.filter(p => p.bezerro?.sexo === 'M').length
        const qtdFemeas = partosSafra.filter(p => p.bezerro?.sexo === 'F').length
        const pesosSafra = partosSafra.map(p => p.bezerro_id ? pesoTerneiroSafra(p.bezerro_id) : null).filter(v => v != null && v > 0)
        const kgProduzido = pesosSafra.reduce((s, v) => s + v, 0)
        const kgPorSexo = partosSafra.reduce((acc, p) => {
          if (!p.bezerro_id) return acc
          const peso = pesoTerneiroSafra(p.bezerro_id)
          if (peso == null || peso <= 0) return acc
          if (p.bezerro?.sexo === 'M') acc.kgMachos += peso
          else if (p.bezerro?.sexo === 'F') acc.kgFemeas += peso
          return acc
        }, { kgMachos: 0, kgFemeas: 0 })
        const valorMachos = qtdMachos * valorUnitTerneiro
        const valorFemeas = qtdFemeas * valorUnitTerneira
        const valorProduzido = valorMachos + valorFemeas
        const kgPorHa    = hectareUtil > 0 ? kgProduzido / hectareUtil : null
        const valorPorHa = hectareUtil > 0 ? valorProduzido / hectareUtil : null

        // Receita REAL (venda efetiva) — mesma população de bezerroIdsSafra do
        // GMD/kg produzido acima, não filtrada por categoria de venda: um
        // terneiro vendido bem depois (já Novilho/Novilha, ou sob categoria com
        // override) ainda é resultado desta safra. null (não 0) sem nenhuma
        // venda ainda — "sem vendas no período" é diferente de "vendeu por
        // zero". Pode ficar abaixo do valor ESTIMADO (valorProduzido) enquanto
        // houver terneiros da safra ainda não vendidos — vai preenchendo
        // conforme as vendas acontecem, mesmo que atravessem ciclo.
        const vendasSafra = vendasAnimaisItens.filter(v => bezerroIdsSafra.has(v.animal_id))
        const receitaRealTerneiros = vendasSafra.length > 0
          ? vendasSafra.reduce((s, v) => s + (parseFloat(v.valor) || 0), 0)
          : null
        const receitaRealTerneirosHa = (hectareUtil > 0 && receitaRealTerneiros != null) ? receitaRealTerneiros / hectareUtil : null

        // Custos — divide o total do grupo financeiro DESTE modo
        // (custoTotalModo — Inseminação/Monta Natural/soma dos dois, ver
        // chamada de calcularBloco abaixo) pelo cohort deste mesmo modo.
        const custoPorTerneiro = (custoTotalModo != null && nPartos > 0) ? custoTotalModo / nPartos : null
        const custoPctValor    = (custoTotalModo != null && valorProduzido > 0) ? (custoTotalModo / valorProduzido) * 100 : null
        const custoPorMatriz   = (custoTotalModo != null && matrizesExpostas > 0) ? custoTotalModo / matrizesExpostas : null

        return {
          partosSafra, prenhas, matrizesExpostas, taxaPrenhez, taxaAproveitamento,
          nPartos, taxaParicao, taxaParicaoExpostas, kgBezerroMatriz, kgNascimento, kgDesmame,
          nAbortos, gestandoTotal, perdasNaoIdentificadas, taxaAborto,
          gmdTerneiros: media(gmdsT), gmdTerneirosFemeas: media(gmdsF), gmdTerneirosMachos: media(gmdsM),
          gmdIndividuais: gmdsT,
          mortosBezerros, mortalidade,
          qtdMachos, qtdFemeas, pesosSafraLength: pesosSafra.length, kgProduzido, kgPorSexo,
          valorMachos, valorFemeas, valorProduzido, kgPorHa, valorPorHa,
          vendasSafraLength: vendasSafra.length, receitaRealTerneiros, receitaRealTerneirosHa,
          custoPorTerneiro, custoPctValor, custoPorMatriz,
        }
      }

      const lotesIA      = lotesCiclo.filter(l => l.tipo !== 'natural')
      const lotesNatural  = lotesCiclo.filter(l => l.tipo === 'natural')
      const blocoIA          = calcularBloco(lotesIA, custoInseminacaoTotal)
      const blocoNatural     = calcularBloco(lotesNatural, custoMontaNaturalTotal)
      const blocoConsolidado = calcularBloco(lotesCiclo, custoConsolidadoTotal)

      // ── intervalo_partos — todo o histórico (não só este ciclo), mesma mãe.
      // Consolidado usa TODOS os partos (mesmo os sem lote vinculado — monta
      // natural não lançada/legado), exatamente como hoje. IA/Natural só
      // conseguem classificar partos que TÊM lote com tipo conhecido — um
      // parto sem lote não entra em nenhum dos dois modos específicos (mesmo
      // critério de "não inventar um cohort novo" já usado no GMD).
      const partosParaIntervalo = filtroProp ? todosPartos.filter(p => p.mae?.proprietario_id === filtroProp) : todosPartos
      const intervaloConsolidado = calcIntervaloPartos(partosParaIntervalo).media
      const intervaloIA          = calcIntervaloPartos(partosParaIntervalo.filter(p => p.lote?.tipo === 'ia')).media
      const intervaloNatural     = calcIntervaloPartos(partosParaIntervalo.filter(p => p.lote?.tipo === 'natural')).media
      blocoIA.intervaloPartos          = intervaloIA
      blocoNatural.intervaloPartos     = intervaloNatural
      blocoConsolidado.intervaloPartos = intervaloConsolidado
      // custo_insem_total — total do grupo financeiro DESTE modo (não é mais
      // invariante entre os 3: Inseminação/Monta Natural/soma dos dois),
      // anexado aqui só pra valorIndicadorDoBloco ler de um lugar só.
      blocoIA.custoInseminacaoTotal          = custoInseminacaoTotal
      blocoNatural.custoInseminacaoTotal     = custoMontaNaturalTotal
      blocoConsolidado.custoInseminacaoTotal = custoConsolidadoTotal

      // ── Estado invariante (sempre Consolidado — cards/gráficos fora dos 5
      // contêineres com seletor de modo, ver Metas.jsx render): proporção de
      // sexo geral, produção (subtítulo "X de Y pesados"/gráfico por sexo) e
      // "temValorCadastrado" (gate do AlertBox, sistema inteiro, não por modo).
      setSexoTerneiros({ machos: blocoConsolidado.qtdMachos, femeas: blocoConsolidado.qtdFemeas })
      setProducaoSafra({ temValorCadastrado, hectareUtil })

      // Custo de monta por ciclo (Inseminação + Monta Natural, todos os ciclos
      // cadastrados, mesma regra de recorte por data) — alimenta o gráfico
      // histórico do container Custos, com o ciclo selecionado destacado.
      setCustoPorCiclo(
        [...ciclos].sort((a, b) => a.inicio.localeCompare(b.inicio)).map(c => ({
          ciclo: c.nome,
          total: todosLancamentos
            .filter(l => l.tipo === 'D' && (l.grupo === 'Inseminação' || l.grupo === 'Monta Natural') && l.data >= c.inicio && l.data <= c.fim)
            .reduce((s, l) => s + (parseFloat(l.valor) || 0), 0),
        }))
      )

      // ── Preço de venda por kg, por categoria, ao longo do tempo — histórico
      // completo (transacoes_animais tipo='V'), independente do ciclo
      // selecionado (é uma série de mercado, não um índice de safra). Agrupa
      // por (data, categoria): quando há mais de uma venda da mesma categoria
      // no mesmo dia, usa a média ponderada por quantidade, não a última —
      // mais representativo do preço praticado naquele dia. Alimenta o
      // gráfico 3D no rodapé da tela (GraficoPrecoVenda3D) — uma série (linha)
      // por categoria, cada uma com sua lista de pontos {data, precoKg}.
      const vendasComPreco = (rVendas.data || []).filter(v => v.preco_kg > 0 && v.data && v.categoria)
      const categoriasVenda = [...new Set(vendasComPreco.map(v => v.categoria))].sort()
      const agregadoDataCategoria = {}
      vendasComPreco.forEach(v => {
        const chave = `${v.data}|${v.categoria}`
        const qtd = parseInt(v.quantidade) || 1
        if (!agregadoDataCategoria[chave]) agregadoDataCategoria[chave] = { somaPonderada: 0, qtdTotal: 0 }
        agregadoDataCategoria[chave].somaPonderada += parseFloat(v.preco_kg) * qtd
        agregadoDataCategoria[chave].qtdTotal += qtd
      })
      setSeriesPrecoVenda3D(categoriasVenda.map(categoria => ({
        categoria,
        pontos: Object.entries(agregadoDataCategoria)
          .filter(([chave]) => chave.endsWith('|' + categoria))
          .map(([chave, agg]) => ({ data: chave.split('|')[0], precoKg: agg.somaPonderada / agg.qtdTotal }))
          .sort((a, b) => a.data.localeCompare(b.data)),
      })))

      // ── Nascimentos por touro / Sexo por touro — SEMPRE Consolidado (não é
      // um dos 5 contêineres com seletor de modo). Frente B: lote de monta
      // natural com VÁRIOS touros (_loteTouros) vira paternidade indefinida —
      // nunca atribuída ao 1º touro (_touroLote sozinho); sem lote cai pro
      // campo `pai` gravado no bezerro (mesmo fallback de sempre).
      const rotuloTouroDoParto = (p) => {
        if (p._loteTouros?.length > 0) return `Monta natural (vários touros) — Lote Nº ${p._loteNumero}`
        return (p._touroLote || p.bezerro?.pai || '').trim() || 'Não informado'
      }
      const porTouroMap = {}
      blocoConsolidado.partosSafra.forEach(p => {
        const touro = rotuloTouroDoParto(p)
        porTouroMap[touro] = (porTouroMap[touro] || 0) + 1
      })
      setNascPorTouro(
        Object.entries(porTouroMap)
          .map(([touro, qtd]) => ({ touro, qtd }))
          .sort((a, b) => b.qtd - a.qtd)
      )

      const porTouroSexoMap = {}
      blocoConsolidado.partosSafra.forEach(p => {
        const touro = rotuloTouroDoParto(p)
        if (!porTouroSexoMap[touro]) porTouroSexoMap[touro] = { machos: 0, femeas: 0 }
        if (p.bezerro?.sexo === 'M') porTouroSexoMap[touro].machos++
        else if (p.bezerro?.sexo === 'F') porTouroSexoMap[touro].femeas++
      })
      setNascPorTouroSexo(
        Object.entries(porTouroSexoMap)
          .map(([touro, v]) => ({ touro, ...v, total: v.machos + v.femeas }))
          .sort((a, b) => b.total - a.total)
      )

      // ── Curva de parição — nascimentos agrupados no tempo, SEMPRE
      // Consolidado (mesmo motivo acima). Granularidade adaptativa pelo
      // período coberto pelos partos.
      const { modo: modoAgrup, dados: periodoDados } = agruparPorPeriodo(blocoConsolidado.partosSafra)
      setModoAgrupamento(modoAgrup)
      setNascPorPeriodo(periodoDados)

      // ── Guarda os 3 blocos calculados — `atuais`/gmdIndividuais/
      // desfechosSafra/produção-por-sexo são DERIVADOS disto no render (ver
      // construirAtuais, fora do loadAll), conforme o modo selecionado em
      // cada contêiner — trocar o seletor não recarrega os dados.
      setBlocosPorModo({ ia: blocoIA, natural: blocoNatural, consolidado: blocoConsolidado })
    } catch (e) {
      console.error('[Metas] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = () => {
    const vals = {}
    metasOrdenadas.forEach(m => { vals[m.id] = m.valor_meta != null ? String(m.valor_meta) : '' })
    setEditVals(vals)
    setEditOpen(true)
  }

  // Linhas "virtuais" (sem id real na tabela `metas`) são CRIADAS ao salvar, não
  // atualizadas — cobre o caso de a auto-criação no load não ter rodado (usuário
  // sem permissão na hora, ou insert falhou) sem depender de rodar SQL manual.
  const salvarMetas = async () => {
    if (!podeEditarMetas) return
    setSalvandoMeta(true)
    const erros = []
    for (const m of metasOrdenadas) {
      const novo = parseFloat(editVals[m.id])
      if (isNaN(novo)) continue
      if (m._virtual) {
        const { error } = await db.metas.insert({ indicador: m.indicador, valor_meta: novo })
        if (error) erros.push(`${CFG[m.indicador]?.label || m.indicador}: ${error.message}`)
      } else if (novo !== parseFloat(m.valor_meta)) {
        const { error } = await db.metas.update(m.id, { valor_meta: novo })
        if (error) erros.push(`${CFG[m.indicador]?.label || m.indicador}: ${error.message}`)
      }
    }
    setSalvandoMeta(false)
    // Erros do Supabase (RLS, constraint etc.) antes ficavam silenciosos — o toast
    // dizia "sucesso" mesmo quando nada foi persistido. Agora, se algo falhar, o
    // modal permanece aberto e o erro real é mostrado em vez de fechar como se
    // tivesse dado certo.
    if (erros.length > 0) {
      toast(`Erro ao salvar: ${erros.join('; ')}`, 'error')
    } else {
      toast('Metas atualizadas!')
      setEditOpen(false)
    }
    loadAll()
  }

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  if (semTabela) {
    return (
      <EmptyState
        icon="🎯"
        title="Tabela de metas não encontrada"
        sub="Execute o SQL de criação da tabela no painel do Supabase para habilitar esta página."
      />
    )
  }

  // ── Fase 2 — Monta Natural: valores derivados de blocosPorModo + o modo
  // selecionado em cada contêiner (trocar o seletor não refaz o fetch, só
  // recalcula estas leituras). Com os 5 seletores em 'consolidado' (default),
  // isso é bit-a-bit o `atuais`/gráficos de antes — regressão-zero.
  const modos = { reproducao: modoReproducao, perdas: modoPerdas, gmd: modoGmd, producao: modoProducao, custos: modoCustos }
  const atuais = construirAtuais(blocosPorModo, modos, producaoSafra?.temValorCadastrado)
  const bGmdAtual      = blocosPorModo ? blocosPorModo[modoGmd]      : null
  const bPerdasAtual   = blocosPorModo ? blocosPorModo[modoPerdas]   : null
  const bProducaoAtual = blocosPorModo ? blocosPorModo[modoProducao] : null
  const gmdIndividuais = bGmdAtual ? bGmdAtual.gmdIndividuais : []
  const desfechosSafra = bPerdasAtual ? {
    vivos: Math.max(0, bPerdasAtual.nPartos - bPerdasAtual.mortosBezerros),
    mortos: bPerdasAtual.mortosBezerros,
    abortos: bPerdasAtual.nAbortos,
    perdasNaoIdentificadas: bPerdasAtual.perdasNaoIdentificadas,
    gestando: bPerdasAtual.gestandoTotal,
  } : null
  const producaoDetalhes = bProducaoAtual ? {
    pesados: bProducaoAtual.pesosSafraLength, totalTerneiros: bProducaoAtual.nPartos,
    hectareUtil: producaoSafra?.hectareUtil || 0,
    qtdMachos: bProducaoAtual.qtdMachos, qtdFemeas: bProducaoAtual.qtdFemeas,
    vendasSafraLength: bProducaoAtual.vendasSafraLength,
  } : null
  const producaoPorSexo = bProducaoAtual ? {
    kgMachos: bProducaoAtual.kgPorSexo.kgMachos, kgFemeas: bProducaoAtual.kgPorSexo.kgFemeas,
    valorMachos: bProducaoAtual.valorMachos, valorFemeas: bProducaoAtual.valorFemeas,
    temValorCadastrado: !!producaoSafra?.temValorCadastrado,
  } : null

  // Card aparece pra TODO indicador em ORDEM, mesmo sem linha salva na tabela
  // `metas` (ex: auto-criação falhou, ou o usuário não tem permissão de editar
  // metas). Sem isso, um indicador sem meta salva simplesmente não renderizava
  // — o card não pode depender de existir uma meta, só o "Meta: —" depende.
  // `unidade` NUNCA vem do banco (a tabela não tem essa coluna) — sempre de
  // UNIDADES_PADRAO, tanto pra linhas reais quanto virtuais.
  const metasOrdenadas = ORDEM.map(ind => {
    const m = metas.find(mm => mm.indicador === ind)
    return m
      ? { ...m, unidade: UNIDADES_PADRAO[ind] || '' }
      : { id: `virtual-${ind}`, indicador: ind, valor_meta: null, unidade: UNIDADES_PADRAO[ind] || '', _virtual: true }
  })

  // Sumário
  const statuses = metasOrdenadas.map(m => avaliar(atuais[m.indicador], m.valor_meta, CFG[m.indicador]?.inverted))
  const nVerde    = statuses.filter(s => s === 'verde').length
  const nAmarelo  = statuses.filter(s => s === 'amarelo').length
  const nVermelho = statuses.filter(s => s === 'vermelho').length

  return (
    <div>
      {/* Seletor de ciclo */}
      <div style={{ marginBottom: 12 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      {/* Filtro por proprietário */}
      <div className="pill-group" style={{ marginBottom: 12 }}>
        <button className={`pill ${!filtroProp ? 'active' : ''}`} onClick={() => setFiltroProp('')}>Todos</button>
        {proprietarios.map(p => (
          <button key={p.id} className={`pill ${filtroProp === p.id ? 'active' : ''}`} onClick={() => setFiltroProp(p.id)}>
            {p.nome.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Ciclo + sumário */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: '.82rem', color: '#6B7280' }}>
          <span style={{ color: '#27A838', fontWeight: 600 }}>{nVerde} ✓</span>
          {' · '}
          <span style={{ color: '#D97706', fontWeight: 600 }}>{nAmarelo} ⚠</span>
          {' · '}
          <span style={{ color: '#E24B4A', fontWeight: 600 }}>{nVermelho} ✗</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {podeEditarMetas && (
            <button className="btn btn-secondary btn-sm" onClick={openEdit}>
              <i className="ti ti-settings" /> Editar metas
            </button>
          )}
          <BotaoPDF contentRef={contentRef} filename="metas-indicadores" titulo="Metas: Indicadores" />
        </div>
      </div>

      {/* Filtro GERAL — troca os 5 seletores por contêiner de uma vez (Opção A:
          eles continuam existindo, só ficam sincronizados nesse sentido).
          Default Consolidado = número de hoje; não recarrega dado nenhum, só
          troca qual bloco já calculado (blocosPorModo) cada card lê. */}
      <div style={{
        marginBottom: 14, background: '#F9FAFB', border: '.5px solid #E5E7EB',
        borderRadius: 10, padding: '10px 14px',
      }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
          Ver por
        </div>
        <SeletorModo value={modoGeral} onChange={aplicarModoGeral} />
      </div>

      <div ref={contentRef}>
        {/* Cards agrupados em containers (Reprodução/Perdas/GMD/Produção/Custos),
            nesta ordem fixa — Produção sempre por último. Cada grupo usa .grid-4
            (4 colunas fixas no desktop, 1 no mobile, ver global.css); grupos com
            menos de 4 indicadores (ex: Perdas) só deixam colunas vazias.
            Fase 2 — Monta Natural: cada contêiner tem seu próprio seletor
            Inseminação/Monta Natural/Consolidado (SELETORES abaixo), default
            'consolidado' = número de hoje, sem mudar nada até o usuário trocar. */}
        {(() => {
          const SELETORES = {
            'Reprodução': [modoReproducao, setModoReproducao],
            'Perdas':     [modoPerdas, setModoPerdas],
            'GMD':        [modoGmd, setModoGmd],
            'Produção da Safra x Hectare Útil': [modoProducao, setModoProducao],
            'Custos':     [modoCustos, setModoCustos],
          }
          return GRUPOS.map(grupo => {
            const cardsDoGrupo = grupo.indicadores
              .map(ind => metasOrdenadas.find(m => m.indicador === ind))
              .filter(Boolean)
            const ehProducao = grupo.titulo.startsWith('Produção')
            const [modoAtual, setModoAtual] = SELETORES[grupo.titulo] || ['consolidado', () => {}]
            return (
              <div key={grupo.titulo} className="card" style={{ marginBottom: 14 }}>
                <div className="card-title">{grupo.titulo}</div>
                <SeletorModo value={modoAtual} onChange={setModoAtual} />
                {ehProducao && producaoSafra && !producaoSafra.temValorCadastrado && (
                  <div style={{ marginBottom: 12 }}>
                    <AlertBox type="amber" icon="ti-alert-triangle"
                      title="Preço médio de Terneiro/Terneira não cadastrado"
                      body='Cadastre o peso médio e o preço/kg das categorias "Terneiro" e "Terneira" em Financeiro → Parâmetros para calcular o valor produzido.' />
                  </div>
                )}
                <div className="grid-4">
                  {cardsDoGrupo.map(m => (
                    <IndicadorCard key={m.id} meta={m} atual={atuais[m.indicador] ?? null}
                      subtitulo={subtituloProducao(m.indicador, producaoDetalhes) || subtituloCustos(m.indicador, custosDetalhes, modoAtual)} />
                  ))}
                </div>

                {/* Gráfico do container — abaixo dos cards, mesmo card visual */}
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '.5px solid #F3F4F6' }}>
                  {grupo.titulo === 'Reprodução' && (
                    <GraficoParicao dados={nascPorPeriodo} modo={modoAgrupamento} cicloNome={cicloLocal?.nome} />
                  )}
                  {grupo.titulo === 'Perdas' && (
                    <GraficoDesfechos dados={desfechosSafra} />
                  )}
                  {grupo.titulo === 'GMD' && (
                    <div className="grid-2">
                      <div>
                        <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Distribuição de GMD individual</div>
                        <GraficoHistogramaGMD valores={gmdIndividuais} />
                      </div>
                      <div>
                        <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Fêmeas x Machos x Meta</div>
                        <GraficoComparativoGMD femeas={atuais.gmd_terneiros_femeas} machos={atuais.gmd_terneiros_machos} />
                      </div>
                    </div>
                  )}
                  {ehProducao && (
                    <GraficoProducaoPorSexo dados={producaoPorSexo} />
                  )}
                  {grupo.titulo === 'Custos' && (
                    <GraficoCustoPorCiclo dados={custoPorCiclo} cicloAtualNome={cicloLocal?.nome} />
                  )}
                </div>

                {/* Modo Consolidado: comparativo IA × Monta Natural — mesmos
                    números já calculados nos 2 modos, só visualização. Custos
                    entra aqui também (deixou de ser só uma nota "não aplicável"
                    — grupo 'Monta Natural' dá número de verdade pro modo Natural). */}
                {modoAtual === 'consolidado' && blocosPorModo && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '.5px solid #F3F4F6' }}>
                    <GraficoComparativoModo
                      indicadores={grupo.indicadores}
                      blocoIA={blocosPorModo.ia}
                      blocoNatural={blocosPorModo.natural}
                      temValorCadastrado={producaoSafra?.temValorCadastrado}
                    />
                  </div>
                )}
              </div>
            )
          })
        })()}

        {/* Sexo dos terneiros + GMD fêmea×macho + nascimentos por touro — mesmo
            card, três donuts lado a lado (grid-3), todos sobre a mesma base
            partosSafra/atuais deste ciclo. */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title"><i className="ti ti-chart-donut" /> Nascimentos do ciclo {cicloLocal?.nome || '—'}</div>
          <div className="grid-3">
            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 10 }}>Proporção de sexo</div>
              {(() => {
                const total = sexoTerneiros.machos + sexoTerneiros.femeas
                if (total === 0) {
                  return <p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '20px 0' }}>Sem nascimentos registrados neste ciclo.</p>
                }
                const pctMachos = Math.round((sexoTerneiros.machos / total) * 100)
                const pctFemeas = 100 - pctMachos
                const pieDataSexo = [
                  { name: 'Machos', value: sexoTerneiros.machos, pct: pctMachos, color: '#2B6CD9' },
                  { name: 'Fêmeas', value: sexoTerneiros.femeas, pct: pctFemeas, color: '#DB2777' },
                ].filter(d => d.value > 0)
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
                    <ResponsiveContainer width={160} height={150}>
                      <PieChart>
                        <Pie data={pieDataSexo} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" labelLine={false}>
                          {pieDataSexo.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v, name, item) => [`${v} (${item.payload.pct}%)`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2B6CD9', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '.85rem', color: '#374151' }}>Machos ♂: <strong>{pctMachos}%</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DB2777', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '.85rem', color: '#374151' }}>Fêmeas ♀: <strong>{pctFemeas}%</strong></span>
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#9CA3AF', marginTop: 4 }}>
                        {sexoTerneiros.machos} macho{sexoTerneiros.machos !== 1 ? 's' : ''} · {sexoTerneiros.femeas} fêmea{sexoTerneiros.femeas !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 10 }}>GMD: fêmeas x machos</div>
              {(() => {
                const gmdF = atuais.gmd_terneiros_femeas
                const gmdM = atuais.gmd_terneiros_machos
                if (gmdF == null && gmdM == null) {
                  return <p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '20px 0' }}>Sem pesagens suficientes para calcular o GMD por sexo neste ciclo.</p>
                }
                const vF = gmdF > 0 ? gmdF : 0
                const vM = gmdM > 0 ? gmdM : 0
                const totalGmd = vF + vM
                const pctFemeas = totalGmd > 0 ? Math.round((vF / totalGmd) * 100) : 0
                const pctMachos = 100 - pctFemeas
                const pieDataGmd = [
                  { name: 'Machos', value: vM, pct: pctMachos, color: '#2B6CD9' },
                  { name: 'Fêmeas', value: vF, pct: pctFemeas, color: '#DB2777' },
                ].filter(d => d.value > 0)
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
                    {pieDataGmd.length > 0 ? (
                      <ResponsiveContainer width={160} height={150}>
                        <PieChart>
                          <Pie data={pieDataGmd} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" labelLine={false}>
                            {pieDataGmd.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip formatter={(v, name, item) => [`${Number(v).toFixed(3)} kg/dia (${item.payload.pct}%)`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ width: 160, height: 150 }} />
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2B6CD9', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '.85rem', color: '#374151' }}>
                          Machos ♂: <strong>{gmdM != null ? `${gmdM.toFixed(3)} kg/dia` : '—'}</strong>{gmdM != null && totalGmd > 0 ? ` · ${pctMachos}%` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DB2777', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '.85rem', color: '#374151' }}>
                          Fêmeas ♀: <strong>{gmdF != null ? `${gmdF.toFixed(3)} kg/dia` : '—'}</strong>{gmdF != null && totalGmd > 0 ? ` · ${pctFemeas}%` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 10 }}>Por touro</div>
              {(() => {
                const totalTouro = nascPorTouro.reduce((s, t) => s + t.qtd, 0)
                if (totalTouro === 0) {
                  return <p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '20px 0' }}>Sem nascimentos registrados neste ciclo.</p>
                }
                const pieDataTouro = nascPorTouro.map((t, i) => ({
                  name: t.touro, value: t.qtd,
                  pct: Math.round((t.qtd / totalTouro) * 100),
                  color: CORES_TOURO[i % CORES_TOURO.length],
                }))
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
                    <ResponsiveContainer width={160} height={150}>
                      <PieChart>
                        <Pie data={pieDataTouro} cx="50%" cy="50%" innerRadius={40} outerRadius={62} dataKey="value" labelLine={false}>
                          {pieDataTouro.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v, name, item) => [`${v} nascimento${v !== 1 ? 's' : ''} (${item.payload.pct}%)`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 150, overflowY: 'auto' }}>
                      {pieDataTouro.map(d => (
                        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontSize: '.85rem', color: '#374151' }}>
                            {d.name}: <strong>{d.value} nascimento{d.value !== 1 ? 's' : ''} · {d.pct}%</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Sexo por touro — um mini-donut por touro (em vez de um donut só com
              2×N fatias "Touro ♂/♀", que ficaria poluído com vários touros):
              mesmas cores azul/rosa do donut geral de sexo, então dá pra comparar
              a proporção de cada touro de relance, lado a lado. */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '.5px solid #F3F4F6' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 10 }}>Sexo dos terneiros por touro</div>
            {nascPorTouroSexo.length === 0
              ? <p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '20px 0' }}>Sem nascimentos registrados neste ciclo.</p>
              : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                  {nascPorTouroSexo.map(t => {
                    const pctM = t.total > 0 ? Math.round((t.machos / t.total) * 100) : 0
                    const pctF = 100 - pctM
                    const pieData = [
                      { name: 'Machos', value: t.machos, pct: pctM, color: '#2B6CD9' },
                      { name: 'Fêmeas', value: t.femeas, pct: pctF, color: '#DB2777' },
                    ].filter(d => d.value > 0)
                    return (
                      <div key={t.touro} style={{ textAlign: 'center', width: 128 }}>
                        <div style={{ fontSize: '.76rem', fontWeight: 600, color: '#374151', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.touro}>
                          {t.touro}
                        </div>
                        <ResponsiveContainer width={110} height={100}>
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={26} outerRadius={44} dataKey="value" labelLine={false}>
                              {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip formatter={(v, name, item) => [`${v} (${item.payload.pct}%)`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ fontSize: '.7rem', color: '#374151', lineHeight: 1.5 }}>
                          <div>♂ {t.machos} · {pctM}%</div>
                          <div>♀ {t.femeas} · {pctF}%</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>
        </div>

        {/* Preço de venda por kg/@, por categoria — histórico completo (não só o
            ciclo selecionado), fonte transacoes_animais tipo='V'. Rodapé da
            tela, de propósito — é uma série de mercado, não um índice de safra,
            então fica separada dos containers de indicadores acima. Substitui o
            gráfico 2D que existia aqui (mesmos dados) — 3D real, lazy-loaded. */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title"><i className="ti ti-chart-line" /> Preço de venda por categoria — histórico completo</div>
          <div style={{ fontSize: '.72rem', color: '#9CA3AF', marginBottom: 8 }}>
            Todas as vendas de animais já registradas (qualquer safra) — arraste pra girar, role pra zoom.
          </div>
          <Suspense fallback={<p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '28px 0' }}>Carregando gráfico 3D…</p>}>
            <GraficoPrecoVenda3D series={seriesPrecoVenda3D} />
          </Suspense>
        </div>

      </div>

      {/* Modal edição de metas */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar metas" width={440}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {metasOrdenadas.map(m => {
            const cfg = CFG[m.indicador] || {}
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 500, color: '#374151', marginBottom: 3 }}>
                    {labelComSexo(cfg.label)}
                    {cfg.inverted && <span style={{ fontSize: '.70rem', color: '#9CA3AF', marginLeft: 6 }}>(menor é melhor)</span>}
                    {IDEAIS[m.indicador] && <span style={{ fontSize: '.70rem', color: '#9CA3AF', marginLeft: 6 }}>(ideal: {IDEAIS[m.indicador]})</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <input
                    type="number" step="0.01" min="0"
                    value={editVals[m.id] ?? ''}
                    onChange={e => setEditVals(p => ({ ...p, [m.id]: e.target.value }))}
                    style={{ width: 90, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: '.78rem', color: '#9CA3AF', minWidth: 44 }}>{m.unidade}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-primary" onClick={salvarMetas} disabled={salvandoMeta}>
            {salvandoMeta ? 'Salvando...' : <><i className="ti ti-check" /> Salvar metas</>}
          </button>
          <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
