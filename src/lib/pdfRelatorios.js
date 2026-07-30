import { PdfWriter } from './pdfWriter'

// ── PDF de Relatórios com TEXTO REAL ────────────────────────────────────────
// Antes usava o mesmo gerador de captura de tela (gerarPDFComMolduras) que o
// Manual — mesmo problema (imagem gigante, arquivo pesado, texto não
// selecionável), só que aqui o conteúdo é 100% dados já calculados em
// Relatorios.jsx (KPIs, tabelas, listas), nunca um gráfico/imagem de verdade.
// Por isso, em vez de percorrer o DOM (como pdfManual.js faz pro manual, que
// é texto solto), aqui os 3 relatórios são montados DIRETO dos dados que o
// componente já tem prontos — mais simples e mais confiável que tentar
// reconstruir cards/grids/barra-de-progresso a partir do HTML renderizado.
const AZUL = [30, 85, 176], VERMELHO = [121, 31, 31], AMBAR = [186, 117, 23], VERDE = [39, 80, 10]

function linhaIndice(writer, { l, v, meta, ok }) {
  const valor = meta ? `${v}   meta: ${meta} ${ok ? '✓' : '↑'}` : v
  writer.linha(l, valor, { corValor: ok ? AZUL : VERMELHO })
}

function subtitulo(cicloNome) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  return `Ciclo ${cicloNome || '—'} · Gerado em ${hoje}`
}

// Fase 8 (Etapa F) — estilo formal do relatório de fechamento: capa rica
// (período + proprietários abaixo do subtítulo) e seções numeradas (nível 1,
// em vez do nível 2 "subtítulo" que os 3 relatórios usavam antes).
// `criarWriter` monta o writer + a função `h()` que os 3 geradores abaixo
// usam pra desenhar cada heading.
function criarWriter({ titulo, fazenda, cicloNome, periodoTxt, propsTxt, logoDataURL }) {
  const linhasCapa = [periodoTxt, propsTxt].filter(Boolean)
  const writer = new PdfWriter({
    titulo, fazenda, subtitulo: subtitulo(cicloNome), linhasCapa, logoDataURL, numerarSecoes: true,
  })
  const h = (text, level = 1) => writer.heading(text, level)
  return { writer, h }
}

// Chamado por último, antes de save() — sem sumário nem bloco de assinatura
// (Fase 14): esses relatórios ficam com capa rica + seções numeradas + rodapé.
function finalizarDocumento(writer, rodapeTexto) {
  writer.finalize(rodapeTexto)
}

export function gerarPDFRelatorioGeral(dados) {
  const {
    fazenda, cicloNome, periodoTxt, propsTxt, kpisTopo, catMap, totalAtivos, indices,
    valorRows, propsSelecionadas, valorTotal, vencSan, ativos, inativos, filename, logoDataURL,
  } = dados
  const { writer, h } = criarWriter({ titulo: 'Relatório Geral', fazenda, cicloNome, periodoTxt, propsTxt, logoDataURL })

  writer.kpis(kpisTopo)

  h('Composição do rebanho', 1)
  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  writer.table(
    [{ label: 'Categoria' }, { label: 'Qtde', align: 'right' }, { label: '%', align: 'right' }],
    catEntries.map(([cat, qt]) => [cat, qt, totalAtivos > 0 ? `${Math.round(qt / totalAtivos * 100)}%` : '—']),
    { larguras: [0.6, 0.2, 0.2] },
  )

  h('Índices principais', 1)
  indices.forEach(item => linhaIndice(writer, item))

  if (valorRows.length > 0) {
    h('Valor estimado do rebanho', 1)
    const headers = [
      { label: 'Categoria' },
      ...propsSelecionadas.map(p => ({ label: p.nome.split(' ')[0], align: 'right' })),
      { label: 'Total', align: 'right' }, { label: 'Valor estimado', align: 'right' },
    ]
    const rows = valorRows.map(row => [
      row.cat,
      ...row.porProp.map(pp => pp.count || '—'),
      row.total,
      row.valor > 0 ? { text: fmt(row.valor), cor: AZUL, bold: true } : '—',
    ])
    const totalPorProp = propsSelecionadas.map(p =>
      valorRows.reduce((s, r) => s + (r.porProp.find(pp => pp.propId === p.id)?.count || 0), 0))
    rows.push([
      { text: 'Total geral', bold: true },
      ...totalPorProp,
      valorRows.reduce((s, r) => s + r.total, 0),
      { text: fmt(valorTotal), cor: AZUL, bold: true },
    ])
    const nProps = propsSelecionadas.length
    const catW = 0.30, totW = 0.12, valW = 0.22
    const restante = 1 - catW - totW - valW
    const propW = nProps > 0 ? restante / nProps : 0
    const larguras = [catW, ...Array(nProps).fill(propW), totW, valW + (nProps === 0 ? restante : 0)]
    writer.table(headers, rows, { larguras })
  }

  if (vencSan > 0) {
    writer.alertBox('amber', 'Procedimentos sanitários vencidos',
      `${vencSan} procedimento(s) com data de reforço vencida. Verifique o módulo Sanidade.`)
  }
  writer.alertBox('green', 'Sistema operacional',
    `${ativos} animais ativos · ${inativos} inativos no histórico · Ciclo ${cicloNome} em andamento`)

  finalizarDocumento(writer, 'DigitalBov — Relatório Geral')
  writer.save(filename)
}

const idxPct = v => v != null ? `${v}%` : '—'

export function gerarPDFRelatorioReprodutivo(dados) {
  const {
    fazenda, cicloNome, periodoTxt, propsTxt, lotesRows, kpiIns, kpiPrn, txPrenhez, nascKpis, partosRows, indicesReprod,
    mostrarEstacoes, gruposEstacaoRows, consolidadoIdxRow, filename, logoDataURL,
  } = dados
  const { writer, h } = criarWriter({ titulo: 'Painel Reprodutivo', fazenda, cicloNome, periodoTxt, propsTxt, logoDataURL })

  h('Lotes de inseminação', 1)
  if (lotesRows.length === 0) {
    writer.paragraph([{ text: 'Nenhum lote registrado neste ciclo.', cor: [156, 163, 175] }])
  } else {
    const headers = [
      { label: 'Lote' }, { label: 'Touro' }, { label: 'Data' }, { label: 'Insem.', align: 'right' },
      { label: 'Prenhas', align: 'right' }, { label: 'Tx prenhez', align: 'right' }, { label: 'Parto prev.' },
    ]
    const larguras = [0.16, 0.22, 0.12, 0.1, 0.1, 0.13, 0.17]
    // Fase 8 (Etapa E) — 2+ estações no ciclo: uma tabela por estação (com
    // subtotal), em vez da tabela única de antes. 1 grupo só cai no mesmo
    // formato flat de sempre.
    if (mostrarEstacoes && gruposEstacaoRows) {
      gruposEstacaoRows.forEach(g => {
        writer.paragraph([{ text: g.periodo ? `${g.nome} · ${g.periodo}` : g.nome, bold: true }])
        const rows = g.lotesRows.map(l => [
          { text: l.numero, bold: true }, l.touro, l.dataFmt, l.insCount,
          { text: l.prn, cor: AZUL }, l.txPct, l.partoPrevFmt,
        ])
        rows.push([
          { text: 'Subtotal', cor: [156, 163, 175] }, '', '', g.subtotal.kpiIns,
          { text: g.subtotal.kpiPrn, cor: AZUL }, idxPct(g.subtotal.txPrenhez), '',
        ])
        writer.table(headers, rows, { larguras })
      })
    } else {
      const rows = lotesRows.map(l => [
        { text: l.numero, bold: true }, l.touro, l.dataFmt, l.insCount,
        { text: l.prn, cor: AZUL }, l.txPct, l.partoPrevFmt,
      ])
      rows.push([
        { text: 'Total', bold: true }, '', '', kpiIns,
        { text: kpiPrn, cor: AZUL, bold: true }, idxPct(txPrenhez), '',
      ])
      writer.table(headers, rows, { larguras })
    }
    writer.paragraph([{ text: `Total do ciclo ${cicloNome}: matrizes distintas (a mesma vaca exposta em mais de um lote não é contada 2x).`, italic: true, cor: [156, 163, 175] }])
  }

  h(`Nascimentos — ciclo ${cicloNome}`, 1)
  if (partosRows.length === 0) {
    writer.paragraph([{ text: 'Nenhum nascimento registrado.', cor: [156, 163, 175] }])
  } else {
    writer.kpis(nascKpis, { perRow: 3 })
    writer.table(
      [{ label: 'Data' }, { label: 'Mãe' }, { label: 'Sexo' }, { label: 'Brinco' }],
      partosRows.map(p => [p.dataFmt, { text: p.maeBrinco, bold: true }, p.sexoTxt, p.bezerroBrinco]),
      { larguras: [0.2, 0.3, 0.25, 0.25] },
    )
  }

  h(`Índices reprodutivos — ${mostrarEstacoes ? `consolidado do ciclo ${cicloNome}` : `ciclo ${cicloNome}`}`, 1)
  indicesReprod.forEach(item => linhaIndice(writer, item))

  if (mostrarEstacoes && gruposEstacaoRows) {
    h('Índices por estação de monta', 1)
    const headers = [
      { label: 'Estação' }, { label: 'Expostas', align: 'right' }, { label: 'Prenhas', align: 'right' },
      { label: 'Tx prenhez', align: 'right' }, { label: 'Partos', align: 'right' }, { label: 'Tx parição', align: 'right' },
      { label: 'Ef. gest.', align: 'right' }, { label: 'Perda gest.', align: 'right' }, { label: 'Mortalidade', align: 'right' },
    ]
    const rows = gruposEstacaoRows.map(g => [
      { text: g.nome, bold: true }, g.subtotal.kpiIns, { text: g.subtotal.kpiPrn, cor: AZUL }, idxPct(g.subtotal.txPrenhez),
      g.idxRow.partos, idxPct(g.idxRow.txParicao), idxPct(g.idxRow.txEficiencia), idxPct(g.idxRow.txPerdaGestacional), idxPct(g.idxRow.txMortalidade),
    ])
    if (consolidadoIdxRow) {
      rows.push([
        { text: 'Consolidado do ciclo', bold: true }, consolidadoIdxRow.kpiIns, { text: consolidadoIdxRow.kpiPrn, cor: AZUL, bold: true },
        idxPct(consolidadoIdxRow.txPrenhez), consolidadoIdxRow.partos, idxPct(consolidadoIdxRow.txParicao),
        idxPct(consolidadoIdxRow.txEficiencia), idxPct(consolidadoIdxRow.txPerdaGestacional), idxPct(consolidadoIdxRow.txMortalidade),
      ])
    }
    writer.table(headers, rows, { larguras: [0.18, 0.09, 0.09, 0.11, 0.09, 0.11, 0.11, 0.11, 0.11] })
  }

  finalizarDocumento(writer, 'DigitalBov — Painel Reprodutivo')
  writer.save(filename)
}

export function gerarPDFRelatorioFinanceiro(dados) {
  const {
    fazenda, cicloNome, periodoTxt, propsTxt, kpisTopo, receitasGrupo, despesasGrupo,
    indicadores, resultadoPorProp, filename, logoDataURL,
  } = dados
  const { writer, h } = criarWriter({ titulo: 'Gestão Financeira', fazenda, cicloNome, periodoTxt, propsTxt, logoDataURL })

  writer.kpis(kpisTopo, { perRow: 3 })

  h('Receitas por grupo', 1)
  if (receitasGrupo.length === 0) {
    writer.paragraph([{ text: 'Nenhuma receita lançada neste ciclo.', cor: [156, 163, 175] }])
  } else {
    receitasGrupo.forEach(({ grupo, valor }) => writer.linha(grupo, fmt(valor), { corValor: AZUL }))
  }

  h('Despesas por grupo', 1)
  if (despesasGrupo.length === 0) {
    writer.paragraph([{ text: 'Nenhuma despesa lançada neste ciclo.', cor: [156, 163, 175] }])
  } else {
    despesasGrupo.forEach(({ grupo, valor }) => writer.linha(grupo, fmt(valor), { corValor: VERMELHO }))
  }

  if (resultadoPorProp && resultadoPorProp.length > 0) {
    h('Resultado por proprietário', 1)
    writer.table(
      [{ label: 'Proprietário' }, { label: 'Receitas', align: 'right' }, { label: 'Despesas', align: 'right' }, { label: 'Resultado', align: 'right' }],
      resultadoPorProp.map(p => [
        { text: p.nome, bold: true }, { text: fmt(p.rec), cor: AZUL }, { text: fmt(p.desp), cor: VERMELHO },
        { text: fmt(p.resu), cor: p.resu >= 0 ? AZUL : VERMELHO, bold: true },
      ]),
      { larguras: [0.34, 0.22, 0.22, 0.22] },
    )
  }

  h('Indicadores de rentabilidade', 1)
  indicadores.forEach(item => linhaIndice(writer, { ...item, ok: item.ok }))

  finalizarDocumento(writer, 'DigitalBov — Gestão Financeira')
  writer.save(filename)
}

function fmt(v) {
  if (v === null || v === undefined) return '—'
  return 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
