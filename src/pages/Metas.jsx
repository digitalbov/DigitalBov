import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { db } from '../lib/supabase'
import {
  calcCategoria, calcGMD, calcTaxaPrenhez, contarPrenhas, contarExpostas, contarMatrizes,
  calcGestacaoLote, calcDesmameMetrics, calcIntervaloPartos, algumErro, fmtMoeda, pesagensDeManejo,
} from '../lib/helpers'
import { Loading, Modal, toast, BotaoPDF, EmptyState, ErroCarregamento, SeletorCicloLocal, AlertBox } from '../components/UI'
import { usePermissoes } from '../lib/PermissoesContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, LabelList, ReferenceLine,
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
  taxa_paricao:         { label: 'Taxa de Parição',         icon: '🍼', inverted: false, desc: 'Partos / prenhas confirmadas (ciclo atual)', semDadosMsg: 'Aguardando partos' },
  gmd_terneiros:        { label: 'GMD Terneiros',           icon: '⚖️', inverted: false, desc: 'GMD médio dos terneiros com ≥2 pesagens' },
  gmd_terneiros_femeas: { label: 'GMD Terneiras (fêmeas)',  icon: '⚖️', inverted: false, desc: 'GMD médio das terneiras (fêmeas) com ≥2 pesagens' },
  gmd_terneiros_machos: { label: 'GMD Terneiros (machos)',  icon: '⚖️', inverted: false, desc: 'GMD médio dos terneiros (machos) com ≥2 pesagens' },
  kg_bezerro_matriz:    { label: 'Kg Desmamado / Matriz',   icon: '🐄', inverted: false, desc: 'Peso de desmame somado / matrizes expostas (ciclo atual)', semDadosMsg: 'Aguardando desmames' },
  kg_desmame:           { label: 'Kg ao Desmame',           icon: '⚖️', inverted: false, desc: 'Peso médio dos terneiros desmamados na safra do ciclo', semDadosMsg: 'Aguardando desmames' },
  intervalo_partos:     { label: 'Intervalo entre Partos',  icon: '📅', inverted: true,  desc: 'Média de dias entre partos consecutivos da mesma matriz (meta = máx. aceitável)', semDadosMsg: 'Precisa de matrizes com 2+ partos' },
  taxa_aborto:          { label: 'Perda Gestacional',       icon: '⚠️', inverted: true,  desc: 'Abortos + perdas não identificadas / prenhas — exclui gestações ainda em andamento', semDadosMsg: 'Aguardando desfechos da safra' },
  mortalidade:          { label: 'Mortalidade de Terneiros', icon: '📊', inverted: true,  desc: 'Mortos entre os terneiros nascidos na safra do ciclo (meta = máx. aceitável)', semDadosMsg: 'Aguardando nascimentos' },
  // Produção da safra x hectare útil — mesmos 4 números que antes eram um
  // painel kpi-card só leitura (ver git history); viraram indicador completo
  // (meta + semáforo + barra) sem mudar nenhuma conta, só a apresentação.
  producao_kg:       { label: 'Kg de Terneiros Produzidos', icon: '🌾', inverted: false, desc: 'Última pesagem de manejo somada dos terneiros da safra', semDadosMsg: 'Aguardando pesagens de desmame', mostraSubtitulo: true },
  producao_valor:    { label: 'Valor Produzido',            icon: '💰', inverted: false, desc: 'Machos × valor médio de Terneiro + fêmeas × valor médio de Terneira (categorias_preco)', semDadosMsg: 'Cadastre peso/preço de Terneiro e Terneira em Parâmetros', mostraSubtitulo: true },
  producao_kg_ha:    { label: 'Kg por Hectare',              icon: '🌱', inverted: false, desc: 'Kg de terneiros produzidos / hectare útil (soma dos piquetes)', semDadosMsg: 'Cadastre piquetes com área', mostraSubtitulo: true },
  producao_valor_ha: { label: 'R$ por Hectare',              icon: '💵', inverted: false, desc: 'Valor produzido / hectare útil (soma dos piquetes)', semDadosMsg: 'Cadastre piquetes e o preço das categorias', mostraSubtitulo: true },
  // Custos — fonte ÚNICA é o grupo financeiro 'Inseminação' (lancamentos_financeiros,
  // tipo despesa), agrupado pela DATA do lançamento dentro do intervalo do ciclo
  // selecionado (não pelo ciclo_id salvo no lançamento — a despesa pode ter sido
  // lançada já no ciclo seguinte e ainda assim pertencer à monta deste ciclo).
  // Sem meta padrão (como Produção): custo varia demais por região/protocolo pra
  // ter um "ideal" universal — fica "Sem meta" até o usuário definir um valor.
  custo_insem_terneiro: { label: 'Custo de Inseminação / Terneiro', icon: '💉', inverted: true, desc: "Grupo financeiro 'Inseminação' do período de monta ÷ terneiros produzidos dessa safra", semDadosMsg: 'Sem despesas de Inseminação lançadas no período', mostraSubtitulo: true },
  custo_insem_pct_valor: { label: 'Custo de Inseminação / Valor do Terneiro', icon: '📉', inverted: true, desc: "Grupo financeiro 'Inseminação' ÷ valor produzido da safra (Terneiro/Terneira)", semDadosMsg: 'Sem despesas de Inseminação lançadas no período', mostraSubtitulo: true },
  custo_insem_total: { label: 'Custo Total de Inseminação', icon: '💰', inverted: true, desc: "Soma do grupo financeiro 'Inseminação' lançado dentro do período de monta deste ciclo", semDadosMsg: 'Sem despesas de Inseminação lançadas no período', mostraSubtitulo: true },
  custo_insem_matriz: { label: 'Custo de Inseminação / Matriz Exposta', icon: '🐄', inverted: true, desc: "Grupo financeiro 'Inseminação' ÷ matrizes expostas no ciclo", semDadosMsg: 'Sem despesas de Inseminação lançadas no período', mostraSubtitulo: true },
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
      return `${d.hectareUtil.toFixed(1)} ha úteis`
    default:
      return null
  }
}

// ── Texto de apoio dos 4 indicadores de Custos — mostra quantos lançamentos
// do grupo 'Inseminação' entraram na soma, pra deixar auditável (o rótulo
// "baseado no grupo financeiro Inseminação" já está no `desc` de cada card).
function subtituloCustos(indicador, d) {
  if (!d || !['custo_insem_terneiro', 'custo_insem_pct_valor', 'custo_insem_total', 'custo_insem_matriz'].includes(indicador)) return null
  if (d.nLancamentos === 0) return null
  return `${d.nLancamentos} lançamento${d.nLancamentos === 1 ? '' : 's'} de Inseminação no período`
}
// Posição no array = ordem de entrada nos GRUPOS abaixo — cada grupo tem seu
// próprio grid de 4 colunas (.grid-4), então a posição dentro do array só
// importa relativa ao grupo, não à tela inteira (ver GRUPOS/render).
const ORDEM = ['taxa_prenhez', 'taxa_aproveitamento', 'taxa_paricao', 'taxa_aborto', 'mortalidade', 'gmd_terneiros', 'gmd_terneiros_femeas', 'gmd_terneiros_machos', 'kg_bezerro_matriz', 'intervalo_partos', 'kg_desmame', 'producao_kg', 'producao_valor', 'producao_kg_ha', 'producao_valor_ha', 'custo_insem_terneiro', 'custo_insem_pct_valor', 'custo_insem_total', 'custo_insem_matriz']
// Containers exibidos na tela, nesta ordem — Produção sempre por último.
const GRUPOS = [
  { titulo: 'Reprodução', indicadores: ['taxa_prenhez', 'taxa_aproveitamento', 'taxa_paricao', 'intervalo_partos'] },
  { titulo: 'Perdas',     indicadores: ['taxa_aborto', 'mortalidade'] },
  { titulo: 'GMD',        indicadores: ['gmd_terneiros', 'gmd_terneiros_femeas', 'gmd_terneiros_machos', 'kg_bezerro_matriz', 'kg_desmame'] },
  { titulo: 'Produção da Safra x Hectare Útil', indicadores: ['producao_kg', 'producao_kg_ha', 'producao_valor', 'producao_valor_ha'] },
  { titulo: 'Custos', indicadores: ['custo_insem_terneiro', 'custo_insem_pct_valor', 'custo_insem_total', 'custo_insem_matriz'] },
]
const IDEAIS = {
  taxa_prenhez: '90%', taxa_paricao: '85%', gmd_terneiros: '0,8', mortalidade: '5%',
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
}
// Unidade padrão de cada indicador — usada quando ainda não existe uma linha
// salva no banco (card "virtual"), pra sempre ter algo pra mostrar/editar.
const UNIDADES_PADRAO = {
  taxa_prenhez: '%', taxa_paricao: '%', mortalidade: '%',
  gmd_terneiros: 'kg/dia', gmd_terneiros_femeas: 'kg/dia', gmd_terneiros_machos: 'kg/dia',
  taxa_aproveitamento: '%', kg_bezerro_matriz: 'kg', intervalo_partos: 'dias', taxa_aborto: '%',
  kg_desmame: 'kg',
  producao_kg: 'kg', producao_valor: 'R$', producao_kg_ha: 'kg/ha', producao_valor_ha: 'R$/ha',
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
      <div className="card-title" style={{ marginBottom: 3, paddingRight: 24 }}>{cfg.label}</div>
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
  if (!dados || dados.every(d => d.total === 0)) return <SemDadosGrafico texto="Sem despesas do grupo 'Inseminação' lançadas em nenhum ciclo ainda." />
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
        <Tooltip {...TOOLTIP_STY} formatter={v => [fmtMoeda(v), "Grupo 'Inseminação'"]} />
        <Bar dataKey="total" name="Custo de Inseminação" radius={[6, 6, 0, 0]}>
          {dados.map((d, i) => <Cell key={i} fill={d.ciclo === cicloAtualNome ? 'url(#gradCusto)' : '#CBD5E1'} />)}
          <LabelList dataKey="total" position="top" formatter={v => v > 0 ? fmtMoeda(v) : ''} style={{ fontSize: 9, fill: '#374151', fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Metas() {
  const contentRef = useRef(null)

  const [loading,      setLoading]      = useState(true)
  const [metas,        setMetas]        = useState([])
  const [atuais,       setAtuais]       = useState({})
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
  const [producaoDetalhes, setProducaoDetalhes] = useState(null)
  const [producaoPorSexo,  setProducaoPorSexo]  = useState(null)
  const [desfechosSafra,   setDesfechosSafra]   = useState(null)
  const [gmdIndividuais,   setGmdIndividuais]   = useState([])
  const [custosDetalhes,   setCustosDetalhes]   = useState(null)
  const [custoPorCiclo,    setCustoPorCiclo]    = useState([])
  const [seriesPrecoVenda3D,   setSeriesPrecoVenda3D]   = useState([])

  const { podeEditar } = usePermissoes()
  const podeEditarMetas = podeEditar('metas')
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()

  useEffect(() => { loadAll() }, [cicloLocal?.id, filtroProp])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      // Metas da tabela (metasErr = tabela não existe, não é erro de rede)
      const { data: metasDataRaw, error: metasErr } = await db.metas.list()
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
      ])
      if (algumErro('[Metas]', resultados)) { setLoadError(true); return }
      const [rLotes, rPartosTodos, rAnimais, rPesagens, rProps, rCatPrecos, rPiquetes, rLancamentos, rVendas, rEntradas] = resultados
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

      // ── taxa_prenhez / taxa_aproveitamento (fórmulas oficiais — helpers) ──
      // prenhas deduplica por animal_id (contarPrenhas), senão nem o número bate
      // com taxaPrenhez nem os denominadores dos indicadores abaixo ficam corretos.
      const todasInseminacoes = filtrar(lotesCiclo.flatMap(l => l.inseminacoes || []), i => i.animal?.proprietario_id)
      const prenhas           = contarPrenhas(todasInseminacoes)
      const matrizesExpostas  = contarExpostas(todasInseminacoes)
      const taxaPrenhez       = calcTaxaPrenhez(todasInseminacoes)

      const primeiraMontaCiclo = lotesCiclo.map(l => l.data).filter(Boolean).sort()[0] || null
      const animaisFiltrados   = filtroProp ? todosAnimais.filter(a => a.proprietario_id === filtroProp) : todosAnimais
      const matrizesAptas      = primeiraMontaCiclo ? contarMatrizes(animaisFiltrados, primeiraMontaCiclo) : 0
      const taxaAproveitamento = matrizesAptas > 0 ? (matrizesExpostas / matrizesAptas) * 100 : null

      // ── taxa_paricao / kg_bezerro_matriz — partos ANCORADOS no lote (safra da
      // monta), igual ao funil do Reprodutivo: os partos podem cair no ciclo
      // seguinte, mas pertencem à safra da monta deste ciclo. _touroLote carrega
      // o touro do LOTE que gerou o parto (usado no gráfico de nascimentos por
      // touro, abaixo) — só dá pra saber isso antes de achatar l.partos.
      const partosSafra = filtrar(
        lotesCiclo.flatMap(l => (l.partos || []).map(p => ({ ...p, _touroLote: l.touro }))),
        p => p.mae?.proprietario_id
      )
      const nPartos      = partosSafra.length
      // Guardado por nPartos > 0: com prenhas>0 mas zero partos ainda, a safra
      // só está em andamento — 0% pareceria "parição ruim" quando na verdade é
      // "ainda não tem o que medir".
      const taxaParicao  = (prenhas > 0 && nPartos > 0) ? (nPartos / prenhas) * 100 : null
      // pesoMedioDesmame = soma dos pesos de desmame ÷ terneiros desmamados
      // (diferente de kgPorMatrizExposta, que divide pelas matrizes expostas) —
      // ambos já vêm prontos do mesmo helper, sem duplicar a lógica de pesagens.
      const desmameMetrics  = calcDesmameMetrics(partosSafra, matrizesExpostas)
      const kgBezerroMatriz = desmameMetrics.kgPorMatrizExposta
      const kgDesmame       = desmameMetrics.pesoMedioDesmame

      // ── taxa_aborto (perda gestacional) — soma "gestando" lote a lote, pois
      // cada lote (IATF/repasse) tem sua própria data de monta; helpers.
      // calcGestacaoLote é a MESMA fórmula corrigida usada em Reprodutivo.jsx.
      const abortosSafra = filtrar(lotesCiclo.flatMap(l => l.abortos || []), a => a.animal?.proprietario_id)
      const nAbortos = abortosSafra.length
      let gestandoTotal = 0
      lotesCiclo.forEach(l => {
        const insLote     = filtrar(l.inseminacoes || [], i => i.animal?.proprietario_id)
        const partosLote  = filtrar(l.partos || [],       p => p.mae?.proprietario_id)
        const abortosLote = filtrar(l.abortos || [],      a => a.animal?.proprietario_id)
        gestandoTotal += calcGestacaoLote(l.data, contarPrenhas(insLote), partosLote.length, abortosLote.length).gestando
      })
      const perdasNaoIdentificadas = Math.max(0, prenhas - nPartos - nAbortos - gestandoTotal)
      // Guardado por "algum desfecho já aconteceu" (nPartos+nAbortos+perdas > 0):
      // se todas as prenhas ainda estão gestando, 0% de perda é prematuro, não
      // uma avaliação real da safra.
      const desfechosResolvidos = nPartos + nAbortos + perdasNaoIdentificadas
      const taxaAborto = (prenhas > 0 && desfechosResolvidos > 0) ? ((nAbortos + perdasNaoIdentificadas) / prenhas) * 100 : null

      // ── intervalo_partos — todo o histórico (não só este ciclo), mesma mãe.
      const partosParaIntervalo = filtroProp ? todosPartos.filter(p => p.mae?.proprietario_id === filtroProp) : todosPartos
      const { media: intervaloPartosDias } = calcIntervaloPartos(partosParaIntervalo)

      // ── gmd_terneiros / gmd_terneiros_femeas / gmd_terneiros_machos — mesmo
      // helper (calcGMD), separado por sexo pra ter um GMD específico de cada.
      // Cohort ANCORADO NA SAFRA DA MONTA (mesmo anchor de nPartos/produção
      // acima), não no nascimento: um terneiro nascido em outubro (ciclo
      // seguinte) mas gerado pela monta DESTE ciclo pertence a esta safra, não
      // à do nascimento — senão GMD fica desencontrado de taxa_paricao/kg
      // produzido. Fonte: EXATAMENTE partosSafra (mesmo array usado acima em
      // nPartos/kgBezerroMatriz/produção) — de propósito o mesmo cohort, pra
      // GMD, nPartos e produção sempre falarem do mesmo conjunto de terneiros.
      // NOTA: partosSafra só inclui partos vinculados a um lote de inseminação
      // deste ciclo (join via lotes_inseminacao.partos) — um parto de MONTA
      // NATURAL (lote_inseminacao_id nulo) já ficava de fora de nPartos/
      // produção/mortalidade antes desta mudança, e continua de fora aqui pelo
      // mesmo motivo: não existe "ciclo da monta" pra uma cobertura não
      // lançada, então não há como ancorá-la nesta safra sem inventar um
      // critério novo (e diferente do que os outros 3 indicadores já usam).
      // Terneiro nesse caso não é perdido do sistema — ele só não entra na
      // conta ancorada-por-safra de nenhum dos 4 indicadores (GMD incluso).
      // Só exclui morto (perda real, categoria diferente de venda). Categoria
      // (Terneiro/Terneira) avaliada na data da ÚLTIMA pesagem do animal, não
      // em "hoje" — senão um vendido há meses já teria "envelhecido" pra fora
      // da categoria pela idade de hoje.
      const dentroCicloLocal = (d) => !!(d && cicloLocal && d >= cicloLocal.inicio && d <= cicloLocal.fim)
      const bezerroIdsSafra = new Set(partosSafra.map(p => p.bezerro_id).filter(Boolean))
      const candidatosGmd = animaisFiltrados.filter(a =>
        a.situacao !== 'morto' && bezerroIdsSafra.has(a.id)
      )
      const gmdsT = [], gmdsF = [], gmdsM = []
      for (const t of candidatosGmd) {
        const todasDoAnimal = todasPesagens.filter(p => p.animal_id === t.id)
        const ps = pesagensDeManejo(todasDoAnimal).sort((a, b) => a.data.localeCompare(b.data))
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
      const gmdTerneiros       = media(gmdsT)
      const gmdTerneirosFemeas = media(gmdsF)
      const gmdTerneirosMachos = media(gmdsM)
      // Valores individuais de GMD (não só a média) — alimenta o histograma do
      // gráfico de GMD abaixo dos cards.
      setGmdIndividuais(gmdsT)

      // ── mortalidade (de bezerros da safra, não do rebanho geral) — só avalia
      // depois que nasceu o primeiro bezerro da safra/ciclo (nPartos > 0);
      // mesma base de dados (partosSafra) usada em taxa_paricao/kg_bezerro_matriz.
      const mortosBezerros = partosSafra.filter(p => p.bezerro?.situacao === 'morto').length
      const mortalidade = nPartos > 0 ? (mortosBezerros / nPartos) * 100 : null

      // ── Desfechos da safra (gráfico "Perdas"): partido em vivos/mortos (dos
      // partos já ocorridos), abortos, perdas gestacionais não identificadas, e
      // gestações ainda em andamento — mesmas variáveis já calculadas acima
      // pra taxa_aborto/mortalidade, só reorganizadas pro donut. A soma das 5
      // fatias bate com `prenhas` (nPartos vivos+mortos = nPartos).
      setDesfechosSafra({
        vivos: Math.max(0, nPartos - mortosBezerros),
        mortos: mortosBezerros,
        abortos: nAbortos,
        perdasNaoIdentificadas,
        gestando: gestandoTotal,
      })

      // ── Proporção de sexo dos terneiros — mesma base (partosSafra) usada em
      // taxa_paricao/mortalidade/kg_bezerro_matriz acima, já filtrada por proprietário.
      const qtdMachos = partosSafra.filter(p => p.bezerro?.sexo === 'M').length
      const qtdFemeas = partosSafra.filter(p => p.bezerro?.sexo === 'F').length
      setSexoTerneiros({ machos: qtdMachos, femeas: qtdFemeas })

      // ── Produção da safra: kg de terneiros x valor em R$ x hectare útil.
      // Peso de cada terneiro = a pesagem de MANEJO mais recente por data
      // (nascimento/desmama/sobreano/intermediária) — NUNCA a pesagem de
      // venda/compra, que registra o peso médio do LOTE inteiro, não o peso
      // real do animal (ver pesagensDeManejo em helpers.js); só cai pra
      // venda/compra se o animal nunca teve nenhuma pesagem de manejo.
      // Índices são históricos: um terneiro vendido continua contando com o
      // peso real que ele tinha antes da venda, a venda em si não "reseta"
      // o peso pro valor médio do lote. Valor em R$ = quantidade de machos ×
      // valor médio da categoria "Terneiro" + quantidade de fêmeas × valor médio
      // da categoria "Terneira", onde valor médio = peso_medio × preco_kg
      // (Financeiro → Parâmetros / tabela categorias_preco) — não o peso real
      // pesado, é o valor de referência cadastrado por categoria, por isso não
      // muda com esta correção. Hectare útil = soma de piquetes.area_ha (mesma
      // fonte usada em Comparativo/Propriedade), sempre da fazenda inteira.
      const pesoTerneiroSafra = (bezerroId) => {
        const todas = todasPesagens.filter(p => p.animal_id === bezerroId)
        if (todas.length === 0) return null
        const ps = pesagensDeManejo(todas)
        const maisRecente = [...ps].sort((a, b) => b.data.localeCompare(a.data))[0]
        return parseFloat(maisRecente.peso_kg) || null
      }
      const pesosSafra = partosSafra
        .map(p => p.bezerro_id ? pesoTerneiroSafra(p.bezerro_id) : null)
        .filter(v => v != null && v > 0)
      const kgProduzido = pesosSafra.reduce((s, v) => s + v, 0)

      // Kg produzido separado por sexo (mesma fonte, só reagrupada por
      // bezerro.sexo) — alimenta o gráfico de barras "Produção por sexo".
      const kgPorSexo = partosSafra.reduce((acc, p) => {
        if (!p.bezerro_id) return acc
        const peso = pesoTerneiroSafra(p.bezerro_id)
        if (peso == null || peso <= 0) return acc
        if (p.bezerro?.sexo === 'M') acc.kgMachos += peso
        else if (p.bezerro?.sexo === 'F') acc.kgFemeas += peso
        return acc
      }, { kgMachos: 0, kgFemeas: 0 })

      const catPrecosData  = rCatPrecos.data || []
      const catTerneiro    = catPrecosData.find(c => c.categoria === 'Terneiro')
      const catTerneira    = catPrecosData.find(c => c.categoria === 'Terneira')
      const valorUnitTerneiro = catTerneiro ? (catTerneiro.peso_medio || 0) * (catTerneiro.preco_kg || 0) : 0
      const valorUnitTerneira = catTerneira ? (catTerneira.peso_medio || 0) * (catTerneira.preco_kg || 0) : 0
      const valorProduzido = qtdMachos * valorUnitTerneiro + qtdFemeas * valorUnitTerneira

      const hectareUtil = (rPiquetes.data || []).reduce((s, p) => s + (parseFloat(p.area_ha) || 0), 0)
      const kgPorHa    = hectareUtil > 0 ? kgProduzido / hectareUtil : null
      const valorPorHa = hectareUtil > 0 ? valorProduzido / hectareUtil : null

      // Só temValorCadastrado é usado na tela (gate do AlertBox) — os valores em
      // si (kg/R$/ha) agora vão pra `atuais`, que já alimenta os IndicadorCard.
      setProducaoSafra({ temValorCadastrado: !!(catTerneiro || catTerneira) })

      // Base de cálculo dos 4 indicadores de Produção — vira o texto de apoio
      // (subtituloProducao) mostrado abaixo do "Valor atual" de cada card.
      setProducaoDetalhes({ pesados: pesosSafra.length, totalTerneiros: nPartos, hectareUtil, qtdMachos, qtdFemeas })

      // Produção por sexo (kg e R$) — alimenta o gráfico de barras agrupadas
      // do container Produção. Valor por sexo é literalmente a decomposição
      // da fórmula de valorProduzido acima (qtdMachos×valorUnitTerneiro,
      // qtdFemeas×valorUnitTerneira), não um cálculo novo.
      setProducaoPorSexo({
        kgMachos: kgPorSexo.kgMachos, kgFemeas: kgPorSexo.kgFemeas,
        valorMachos: qtdMachos * valorUnitTerneiro, valorFemeas: qtdFemeas * valorUnitTerneira,
        temValorCadastrado: !!(catTerneiro || catTerneira),
      })

      // ── Custos (grupo financeiro 'Inseminação') — fonte ÚNICA aprovada pelo
      // usuário: lancamentos_financeiros com grupo='Inseminação' e tipo='D'
      // (despesa), agrupados pela DATA do lançamento dentro do intervalo do
      // ciclo selecionado (dentroCicloLocal, mesma função do bloco de GMD
      // acima) — NÃO pelo `ciclo_id` gravado no lançamento, porque a despesa
      // da monta pode ter sido lançada já no ciclo seguinte e ainda assim
      // pertencer à safra deste ciclo. Casamento custo↔terneiro: nPartos já é
      // contado pela SAFRA DA MONTA (partosSafra vem de lotesCiclo, ancorado
      // no ciclo_id do LOTE, não na data de nascimento do bezerro — ver
      // comentário de partosSafra acima) — então dividir o custo de
      // Inseminação deste ciclo pelo nPartos deste ciclo é o par correto: os
      // dois lados já apontam pra mesma monta, nunca uma monta pelos
      // terneiros de outra safra.
      const todosLancamentos = rLancamentos.data || []
      const despesasInseminacaoCiclo = todosLancamentos.filter(l =>
        l.tipo === 'D' && l.grupo === 'Inseminação' && dentroCicloLocal(l.data)
      )
      const custoInseminacaoTotal = despesasInseminacaoCiclo.length > 0
        ? despesasInseminacaoCiclo.reduce((s, l) => s + (parseFloat(l.valor) || 0), 0)
        : null
      const custoPorTerneiro = (custoInseminacaoTotal != null && nPartos > 0) ? custoInseminacaoTotal / nPartos : null
      const custoPctValor    = (custoInseminacaoTotal != null && valorProduzido > 0) ? (custoInseminacaoTotal / valorProduzido) * 100 : null
      const custoPorMatriz   = (custoInseminacaoTotal != null && matrizesExpostas > 0) ? custoInseminacaoTotal / matrizesExpostas : null
      setCustosDetalhes({ nLancamentos: despesasInseminacaoCiclo.length })

      // Custo de Inseminação por ciclo (todos os ciclos cadastrados, mesma
      // regra de recorte por data) — alimenta o gráfico comparativo do
      // container Custos, com o ciclo selecionado destacado.
      setCustoPorCiclo(
        [...ciclos].sort((a, b) => a.inicio.localeCompare(b.inicio)).map(c => ({
          ciclo: c.nome,
          total: todosLancamentos
            .filter(l => l.tipo === 'D' && l.grupo === 'Inseminação' && l.data >= c.inicio && l.data <= c.fim)
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

      // ── Nascimentos por touro — touro do lote de inseminação que gerou o
      // parto (_touroLote); se o parto não tiver lote vinculado (monta natural),
      // cai pro campo `pai` gravado no bezerro. Mesma base partosSafra (já filtrada).
      const porTouroMap = {}
      partosSafra.forEach(p => {
        const touro = (p._touroLote || p.bezerro?.pai || '').trim() || 'Não informado'
        porTouroMap[touro] = (porTouroMap[touro] || 0) + 1
      })
      setNascPorTouro(
        Object.entries(porTouroMap)
          .map(([touro, qtd]) => ({ touro, qtd }))
          .sort((a, b) => b.qtd - a.qtd)
      )

      // ── Sexo por touro — mesmo critério de touro do bloco acima, agora
      // separando machos/fêmeas por touro (pro donut "sexo por touro").
      const porTouroSexoMap = {}
      partosSafra.forEach(p => {
        const touro = (p._touroLote || p.bezerro?.pai || '').trim() || 'Não informado'
        if (!porTouroSexoMap[touro]) porTouroSexoMap[touro] = { machos: 0, femeas: 0 }
        if (p.bezerro?.sexo === 'M') porTouroSexoMap[touro].machos++
        else if (p.bezerro?.sexo === 'F') porTouroSexoMap[touro].femeas++
      })
      setNascPorTouroSexo(
        Object.entries(porTouroSexoMap)
          .map(([touro, v]) => ({ touro, ...v, total: v.machos + v.femeas }))
          .sort((a, b) => b.total - a.total)
      )

      // ── Curva de parição — nascimentos agrupados no tempo (mesma base
      // partosSafra). Granularidade adaptativa pelo período coberto pelos
      // partos: safra curta agrupa fino (semana), safra longa agrupa grosso
      // (mês), senão o gráfico vira uma parede de barras ou fica vazio demais.
      const { modo: modoAgrup, dados: periodoDados } = agruparPorPeriodo(partosSafra)
      setModoAgrupamento(modoAgrup)
      setNascPorPeriodo(periodoDados)

      // Produção da safra — mesma condição de "sem dado" que o painel antigo já
      // usava (qtdPesados/hectareUtil/temValorCadastrado), só que agora vira
      // null em vez de '—' direto no JSX, pra IndicadorCard tratar igual aos
      // outros indicadores (sem_dado, sem inventar um "0" enganoso).
      const temValorCadastrado = !!(catTerneiro || catTerneira)
      setAtuais({
        taxa_prenhez: taxaPrenhez, taxa_paricao: taxaParicao, gmd_terneiros: gmdTerneiros, mortalidade,
        gmd_terneiros_femeas: gmdTerneirosFemeas, gmd_terneiros_machos: gmdTerneirosMachos,
        taxa_aproveitamento: taxaAproveitamento, kg_bezerro_matriz: kgBezerroMatriz,
        intervalo_partos: intervaloPartosDias, taxa_aborto: taxaAborto, kg_desmame: kgDesmame,
        producao_kg:       pesosSafra.length > 0 ? kgProduzido : null,
        producao_valor:    temValorCadastrado ? valorProduzido : null,
        producao_kg_ha:    kgPorHa,
        producao_valor_ha: (hectareUtil > 0 && temValorCadastrado) ? valorPorHa : null,
        custo_insem_terneiro:  custoPorTerneiro,
        custo_insem_pct_valor: custoPctValor,
        custo_insem_total:     custoInseminacaoTotal,
        custo_insem_matriz:    custoPorMatriz,
      })
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

      <div ref={contentRef}>
        {/* Cards agrupados em containers (Reprodução/Perdas/GMD/Produção), nesta
            ordem fixa — Produção sempre por último. Cada grupo usa .grid-4 (4
            colunas fixas no desktop, 1 no mobile, ver global.css); grupos com
            menos de 4 indicadores (ex: Perdas) só deixam colunas vazias. */}
        {GRUPOS.map(grupo => {
          const cardsDoGrupo = grupo.indicadores
            .map(ind => metasOrdenadas.find(m => m.indicador === ind))
            .filter(Boolean)
          const ehProducao = grupo.titulo.startsWith('Produção')
          return (
            <div key={grupo.titulo} className="card" style={{ marginBottom: 14 }}>
              <div className="card-title">{grupo.titulo}</div>
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
                    subtitulo={subtituloProducao(m.indicador, producaoDetalhes) || subtituloCustos(m.indicador, custosDetalhes)} />
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
            </div>
          )
        })}

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
                    {cfg.label}
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
