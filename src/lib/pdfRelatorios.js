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

export function gerarPDFRelatorioGeral(dados) {
  const {
    fazenda, cicloNome, kpisTopo, catMap, totalAtivos, indices,
    valorRows, propsSelecionadas, valorTotal, vencSan, ativos, inativos, filename, logoDataURL,
  } = dados
  const writer = new PdfWriter({ titulo: 'Relatório Geral', fazenda, subtitulo: subtitulo(cicloNome), logoDataURL })

  writer.kpis(kpisTopo)

  writer.heading('Composição do rebanho', 2)
  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  writer.table(
    [{ label: 'Categoria' }, { label: 'Qtde', align: 'right' }, { label: '%', align: 'right' }],
    catEntries.map(([cat, qt]) => [cat, qt, totalAtivos > 0 ? `${Math.round(qt / totalAtivos * 100)}%` : '—']),
    { larguras: [0.6, 0.2, 0.2] },
  )

  writer.heading('Índices principais', 2)
  indices.forEach(item => linhaIndice(writer, item))

  if (valorRows.length > 0) {
    writer.heading('Valor estimado do rebanho', 2)
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

  writer.finalize('DigitalBov — Relatório Geral')
  writer.save(filename)
}

export function gerarPDFRelatorioReprodutivo(dados) {
  const { fazenda, cicloNome, lotesRows, kpiIns, kpiPrn, txPrenhez, nascKpis, partosRows, indicesReprod, filename, logoDataURL } = dados
  const writer = new PdfWriter({ titulo: 'Painel Reprodutivo', fazenda, subtitulo: subtitulo(cicloNome), logoDataURL })

  writer.heading('Lotes de inseminação', 2)
  if (lotesRows.length === 0) {
    writer.paragraph([{ text: 'Nenhum lote registrado neste ciclo.', cor: [156, 163, 175] }])
  } else {
    const headers = [
      { label: 'Lote' }, { label: 'Touro' }, { label: 'Data' }, { label: 'Insem.', align: 'right' },
      { label: 'Prenhas', align: 'right' }, { label: 'Tx prenhez', align: 'right' }, { label: 'Parto prev.' },
    ]
    const rows = lotesRows.map(l => [
      { text: l.numero, bold: true }, l.touro, l.dataFmt, l.insCount,
      { text: l.prn, cor: AZUL }, l.txPct, l.partoPrevFmt,
    ])
    rows.push([
      { text: 'Total', bold: true }, '', '', kpiIns,
      { text: kpiPrn, cor: AZUL, bold: true }, txPrenhez != null ? `${txPrenhez}%` : '—', '',
    ])
    writer.table(headers, rows, { larguras: [0.16, 0.22, 0.12, 0.1, 0.1, 0.13, 0.17] })
    writer.paragraph([{ text: `Total do ciclo ${cicloNome}: matrizes distintas (a mesma vaca exposta em mais de um lote não é contada 2x).`, italic: true, cor: [156, 163, 175] }])
  }

  writer.heading(`Nascimentos — ciclo ${cicloNome}`, 2)
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

  writer.heading(`Índices reprodutivos — ciclo ${cicloNome}`, 2)
  indicesReprod.forEach(item => linhaIndice(writer, item))

  writer.finalize('DigitalBov — Painel Reprodutivo')
  writer.save(filename)
}

export function gerarPDFRelatorioFinanceiro(dados) {
  const { fazenda, cicloNome, kpisTopo, receitasGrupo, despesasGrupo, indicadores, filename, logoDataURL } = dados
  const writer = new PdfWriter({ titulo: 'Gestão Financeira', fazenda, subtitulo: subtitulo(cicloNome), logoDataURL })

  writer.kpis(kpisTopo, { perRow: 3 })

  writer.heading('Receitas por grupo', 2)
  if (receitasGrupo.length === 0) {
    writer.paragraph([{ text: 'Nenhuma receita lançada neste ciclo.', cor: [156, 163, 175] }])
  } else {
    receitasGrupo.forEach(({ grupo, valor }) => writer.linha(grupo, fmt(valor), { corValor: AZUL }))
  }

  writer.heading('Despesas por grupo', 2)
  if (despesasGrupo.length === 0) {
    writer.paragraph([{ text: 'Nenhuma despesa lançada neste ciclo.', cor: [156, 163, 175] }])
  } else {
    despesasGrupo.forEach(({ grupo, valor }) => writer.linha(grupo, fmt(valor), { corValor: VERMELHO }))
  }

  writer.heading('Indicadores de rentabilidade', 2)
  indicadores.forEach(item => linhaIndice(writer, { ...item, ok: item.ok }))

  writer.finalize('DigitalBov — Gestão Financeira')
  writer.save(filename)
}

function fmt(v) {
  if (v === null || v === undefined) return '—'
  return 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
