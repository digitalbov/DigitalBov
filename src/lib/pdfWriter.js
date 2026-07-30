import jsPDF from 'jspdf'
import { registrarGreatVibes } from './greatvibes-font'

// ── PdfWriter ────────────────────────────────────────────────────────────────
// Gerador de PDF com TEXTO REAL (jsPDF nativo: text/rect/line), não captura de
// tela — o objetivo é arquivo pequeno, com texto selecionável/pesquisável, em
// vez do html2canvas+PNG por página que existia antes (uma imagem gigante por
// página = arquivo enorme e texto não selecionável). Usado por pdfManual.js e
// pdfRelatorios.js.
// Cabeçalho (logo/fazenda/título) só na capa (página 1) — nas páginas
// seguintes só um rodapé de texto simples com numeração, sem imagem nenhuma
// (nem a logo pequena que o gerador antigo repetia em toda página).
const COR_TEXTO   = [31, 31, 31]
const COR_MUTED   = [107, 114, 128]
const COR_TITULO  = [17, 17, 17]
const COR_BORDA   = [229, 231, 235]
const COR_PRIMARIA= [30, 85, 176]

const FONT_SIZE_BODY = 10
const LINE_H = 5

// A fonte padrão (helvetica, sem embutir) só cobre WinAnsi/Latin-1 (até
// U+00FF — é por isso que "ç/ã/é" saem certos). Qualquer caractere ACIMA
// disso (✓ ↑ ≥ ♂ ❓ emoji etc — usados nos ícones/símbolos da tela) o jsPDF
// não recusa nem ignora: ele desenha um BYTE ERRADO no lugar (glyph
// corrompido, às vezes arrastando o caractere vizinho junto) — corrompe a
// linha inteira em vez de só faltar um símbolo. `paraPdfTexto` troca cada um
// desses por um equivalente em ASCII ANTES de qualquer text()/getTextWidth()/
// splitTextToSize(), pra nunca deixar um desses chegar na fonte.
const SUBSTITUICOES_UNICODE = {
  '✓': 'OK', '✔': 'OK', '✗': 'X', '✘': 'X',
  '↑': '^', '↓': 'v', '→': '->', '←': '<-', '↔': '<->', '↩': '<-', '↩️': '<-',
  '≥': '>=', '≤': '<=', '≠': '!=',
  '♂': 'M', '♀': 'F',
  '•': '-', '●': '-', '○': '-', '▶': '>', '▲': '^', '▼': 'v',
  '❓': '?', '⚠': '!', '⚡': '!', '️': '',
  '–': '-', '—': '-', '─': '-', '═': '=', '…': '...',
  '‘': "'", '’': "'", '“': '"', '”': '"',
}
export function paraPdfTexto(s) {
  if (!s) return s
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp <= 0xFF) { out += ch; continue }
    out += SUBSTITUICOES_UNICODE[ch] ?? '' // desconhecido: descarta (nunca deixa passar cru)
  }
  return out
}

export class PdfWriter {
  // Fase 8 (Etapa F) — linhasCapa: linhas extras da capa (ciclo/período/
  // proprietários do relatório de fechamento), desenhadas abaixo do
  // subtítulo, cada uma centralizada — capa rica sem precisar de um 2º
  // desenho por chamador (nada duplicado em pdfRelatorios.js).
  constructor({ titulo, fazenda = '', subtitulo = '', linhasCapa = [], logoDataURL = null, numerarSecoes = false } = {}) {
    // compress:true liga a compressão Flate dos content streams do jsPDF —
    // sem isso (não é o padrão), cada rect/linha/preenchimento de tabela vira
    // texto PDF cru sem compactação nenhuma, o que sozinho já respondia pela
    // maior parte do tamanho do arquivo mesmo com texto real (medido: ~4-8x
    // menor com isto ligado, numa página cheia de tabelas/caixas).
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
    registrarGreatVibes(pdf)
    this.pdf = pdf
    this.pgW = pdf.internal.pageSize.getWidth()
    this.pgH = pdf.internal.pageSize.getHeight()
    this.marginX = 18
    this.marginBottom = 16
    this.maxY = this.pgH - this.marginBottom
    this.rightEdge = this.pgW - this.marginX
    this.titulo = titulo
    this.fazenda = fazenda
    this.logoDataURL = logoDataURL
    this.y = 20
    this.numerarSecoes = numerarSecoes
    this._numeroSecao = 0
    this._capa(subtitulo, linhasCapa)
  }

  // Cabeçalho — só desenhado aqui, uma vez, na página 1 (nunca de novo em
  // addPage). É o que torna a "capa/abertura" possível sem repetir o
  // cabeçalho nas 20+ páginas seguintes. Logo (Bloco D9/Fase 9), quando
  // houver, entra ACIMA do nome da fazenda — já vem pronta (recorte circular
  // + JPEG comprimido, ver carregarLogoFazenda abaixo), então é só desenhar;
  // try/catch pra uma imagem corrompida nunca derrubar a geração inteira.
  _capa(subtitulo, linhasCapa = []) {
    const pdf = this.pdf
    let y = 22
    if (this.logoDataURL) {
      const d = 24, logoY = 9
      try { pdf.addImage(this.logoDataURL, 'JPEG', this.pgW / 2 - d / 2, logoY, d, d) } catch { /* segue sem logo */ }
      y = logoY + d + 7
    }
    if (this.fazenda) {
      pdf.setFont('GreatVibes', 'normal'); pdf.setFontSize(28); pdf.setTextColor(35, 35, 35)
      pdf.text(paraPdfTexto(this.fazenda), this.pgW / 2, y, { align: 'center' })
      pdf.setFont('helvetica', 'normal')
      y += 10
    }
    pdf.setFont(undefined, 'bold'); pdf.setFontSize(18); pdf.setTextColor(...COR_TITULO)
    pdf.text(paraPdfTexto(this.titulo), this.pgW / 2, y, { align: 'center' })
    y += 6
    if (subtitulo) {
      pdf.setFont(undefined, 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...COR_MUTED)
      pdf.text(paraPdfTexto(subtitulo), this.pgW / 2, y, { align: 'center' })
      y += 6
    }
    if (linhasCapa && linhasCapa.length > 0) {
      y += 2
      pdf.setFont(undefined, 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(...COR_TEXTO)
      linhasCapa.filter(Boolean).forEach(linha => {
        pdf.text(paraPdfTexto(linha), this.pgW / 2, y, { align: 'center' })
        y += 5.5
      })
    }
    y += 3
    pdf.setDrawColor(...COR_BORDA)
    pdf.line(this.marginX, y, this.rightEdge, y)
    this.y = y + 9
  }

  ensureSpace(h) {
    if (this.y + h > this.maxY) this.addPage()
  }

  addPage() {
    this.pdf.addPage()
    this.y = 20
  }

  // Número da página ONDE O CURSOR ESTÁ AGORA — usado pelo chamador (ex:
  // pdfManual.js) pra registrar em que página cada seção/subseção começou,
  // ANTES de qualquer inserção de sumário (ver inserirSumario abaixo).
  paginaAtual() {
    return this.pdf.internal.getNumberOfPages()
  }

  // level 1 = título de seção do manual/relatório; 2/3 = subtítulos internos.
  // Fase 8 (Etapa F) — seções de nível 1 ganham número automático ("1. ",
  // "2. "...), sequencial pra cada documento (this._numeroSecao começa em 0
  // no construtor). Devolve o texto final (já numerado) pro chamador poder
  // reaproveitar o mesmo texto no sumário (inserirSumario), sem duplicar a
  // lógica de numeração em pdfRelatorios.js.
  heading(text, level = 1) {
    const size = level === 1 ? 13.5 : level === 2 ? 11 : 10
    this.ensureSpace(size === 13.5 ? 15 : 10)
    if (level === 1) this.y += 3
    let textoFinal = text
    if (level === 1 && this.numerarSecoes) {
      this._numeroSecao += 1
      textoFinal = `${this._numeroSecao}. ${text}`
    }
    this.pdf.setFont(undefined, 'bold')
    this.pdf.setFontSize(size)
    this.pdf.setTextColor(...(level === 1 ? COR_TITULO : COR_TEXTO))
    this.pdf.text(paraPdfTexto(textoFinal), this.marginX, this.y)
    this.y += size === 13.5 ? 6 : 5.5
    if (level === 1) {
      this.pdf.setDrawColor(...COR_BORDA)
      this.pdf.line(this.marginX, this.y - 3.5, this.rightEdge, this.y - 3.5)
    }
    this.pdf.setFont(undefined, 'normal')
    return textoFinal
  }

  paragraph(segments, opts = {}) {
    if (!segmentsHaveText(segments)) return
    this._wrap(normalizeSegments(segments), { indent: 0, ...opts })
    this.y += 3
  }

  bullet(segments, opts = {}) {
    if (!segmentsHaveText(segments)) return
    this._wrap(normalizeSegments(segments), { indent: 5.5, marcador: opts.marcador || '•', ...opts })
    this.y += 1.2
  }

  espaco(mm = 3) { this.y += mm }

  // Caixa de alerta (equivalente ao <AlertBox> da tela) — barra colorida à
  // esquerda, título em negrito + corpo, altura pré-medida antes de desenhar
  // pra nunca cortar a caixa entre duas páginas no meio.
  alertBox(type, title, body) {
    title = paraPdfTexto(title)
    body = paraPdfTexto(body)
    const cores = {
      green: [39, 80, 10], amber: [186, 117, 23], red: [121, 31, 31], purple: [60, 52, 137],
    }
    const cor = cores[type] || cores.green
    const padX = 5, padY = 4
    const textW = this.rightEdge - this.marginX - padX * 2
    this.pdf.setFontSize(FONT_SIZE_BODY)
    this.pdf.setFont(undefined, 'bold')
    const titleLines = title ? this.pdf.splitTextToSize(title, textW) : []
    this.pdf.setFont(undefined, 'normal')
    const bodyLines = body ? this.pdf.splitTextToSize(body, textW) : []
    const h = padY * 2 + titleLines.length * LINE_H + bodyLines.length * (LINE_H - 0.5) + (title && body ? 1.5 : 0)
    this.ensureSpace(h + 3)
    const yTop = this.y
    this.pdf.setFillColor(248, 249, 250)
    this.pdf.rect(this.marginX, yTop, this.rightEdge - this.marginX, h, 'F')
    this.pdf.setFillColor(...cor)
    this.pdf.rect(this.marginX, yTop, 1.4, h, 'F')
    let ty = yTop + padY + 3.2
    this.pdf.setTextColor(...cor)
    this.pdf.setFont(undefined, 'bold')
    for (const l of titleLines) { this.pdf.text(l, this.marginX + padX, ty); ty += LINE_H }
    this.pdf.setFont(undefined, 'normal')
    this.pdf.setTextColor(...COR_TEXTO)
    if (title && body) ty += 1
    for (const l of bodyLines) { this.pdf.text(l, this.marginX + padX, ty); ty += LINE_H - 0.5 }
    this.y = yTop + h + 4
  }

  // Grade de KPIs (cards "valor + rótulo") — usada no Resumo Geral/Financeiro
  // do relatório, equivalente ao grid de cards coloridos da tela.
  kpis(items, { perRow = 4 } = {}) {
    const gap = 4
    const totalW = this.rightEdge - this.marginX
    const boxW = (totalW - gap * (perRow - 1)) / perRow
    const boxH = 20
    this.ensureSpace(boxH + 4)
    const yTop = this.y
    items.forEach((it, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      if (col === 0 && row > 0) this.ensureSpace(boxH + 2)
      const x = this.marginX + col * (boxW + gap)
      const y = this.y + row * (boxH + gap)
      this.pdf.setFillColor(...(it.bg || [249, 250, 251]))
      this.pdf.rect(x, y, boxW, boxH, 'F')
      this.pdf.setDrawColor(...COR_BORDA)
      this.pdf.rect(x, y, boxW, boxH, 'S')
      this.pdf.setFont(undefined, 'bold'); this.pdf.setFontSize(12.5)
      this.pdf.setTextColor(...(it.cor || COR_PRIMARIA))
      this.pdf.text(paraPdfTexto(String(it.v)), x + boxW / 2, y + 10, { align: 'center' })
      this.pdf.setFont(undefined, 'normal'); this.pdf.setFontSize(7.6)
      this.pdf.setTextColor(...COR_MUTED)
      this.pdf.text(paraPdfTexto(String(it.l)), x + boxW / 2, y + 15.5, { align: 'center', maxWidth: boxW - 4 })
    })
    const rows = Math.ceil(items.length / perRow)
    this.y = yTop + rows * boxH + (rows - 1) * gap + 6
  }

  // Linha simples "rótulo .......... valor" (equivalente às .row da tela).
  linha(label, valor, { corValor } = {}) {
    this.ensureSpace(LINE_H + 1)
    this.pdf.setFont(undefined, 'normal'); this.pdf.setFontSize(FONT_SIZE_BODY)
    this.pdf.setTextColor(...COR_TEXTO)
    this.pdf.text(paraPdfTexto(String(label)), this.marginX, this.y)
    this.pdf.setFont(undefined, 'bold')
    this.pdf.setTextColor(...(corValor || COR_TEXTO))
    this.pdf.text(paraPdfTexto(String(valor)), this.rightEdge, this.y, { align: 'right' })
    this.pdf.setFont(undefined, 'normal')
    this.y += LINE_H + 1.5
  }

  // Tabela simples (cabeçalho sombreado + linhas, sem dependência externa —
  // largura de coluna fixa/uniforme ou proporcional via `larguras`).
  table(headers, rows, { larguras } = {}) {
    if (rows.length === 0) return
    const totalW = this.rightEdge - this.marginX
    const n = headers.length
    const w = larguras && larguras.length === n
      ? larguras.map(p => p * totalW)
      : Array(n).fill(totalW / n)
    const rowH = 6.5
    const drawHeader = () => {
      this.ensureSpace(rowH + 1)
      this.pdf.setFillColor(240, 244, 249)
      this.pdf.rect(this.marginX, this.y, totalW, rowH, 'F')
      this.pdf.setFont(undefined, 'bold'); this.pdf.setFontSize(8.6); this.pdf.setTextColor(...COR_TEXTO)
      let x = this.marginX
      headers.forEach((h, i) => {
        const align = h.align || 'left'
        const tx = align === 'right' ? x + w[i] - 2 : x + 2
        this.pdf.text(paraPdfTexto(String(h.label ?? h)), tx, this.y + rowH - 2, { align })
        x += w[i]
      })
      this.y += rowH
      this.pdf.setFont(undefined, 'normal')
    }
    drawHeader()
    rows.forEach((row, ri) => {
      this.ensureSpace(rowH)
      if (this.y === 20) drawHeader() // acabamos de virar página — repete cabeçalho
      if (ri % 2 === 1) { this.pdf.setFillColor(250, 250, 251); this.pdf.rect(this.marginX, this.y, totalW, rowH, 'F') }
      this.pdf.setFontSize(8.6); this.pdf.setTextColor(...COR_TEXTO)
      let x = this.marginX
      row.forEach((cell, i) => {
        const align = headers[i]?.align || 'left'
        const tx = align === 'right' ? x + w[i] - 2 : x + 2
        this.pdf.setFont(undefined, headers[i]?.bold || cell?.bold ? 'bold' : 'normal')
        const text = typeof cell === 'object' ? cell.text : cell
        if (typeof cell === 'object' && cell.cor) this.pdf.setTextColor(...cell.cor); else this.pdf.setTextColor(...COR_TEXTO)
        this.pdf.text(paraPdfTexto(String(text ?? '—')), tx, this.y + rowH - 2, { align, maxWidth: w[i] - 4 })
        x += w[i]
      })
      this.y += rowH
    })
    this.pdf.setFont(undefined, 'normal')
    this.y += 3
  }

  // Imagem "crua" (usada só pros widgets de demonstração interativos do
  // manual, pequenos — nunca a página inteira. Escala pra caber na largura
  // útil, mantendo proporção).
  image(dataURL, naturalW, naturalH) {
    const maxW = this.rightEdge - this.marginX
    const w = maxW
    const h = (naturalH * w) / naturalW
    this.ensureSpace(h + 4)
    this.pdf.addImage(dataURL, 'PNG', this.marginX, this.y, w, h)
    this.y += h + 4
  }

  // Chip inline pequeno (equivalente ao <Badge>) — usado dentro de uma linha
  // de texto corrida, não como bloco próprio.
  _wrap(segments, { indent = 0, marcador = null }) {
    const pdf = this.pdf
    const x0 = this.marginX + indent
    pdf.setFontSize(FONT_SIZE_BODY)
    this.ensureSpace(LINE_H)
    if (marcador) {
      pdf.setFont(undefined, 'normal'); pdf.setTextColor(...COR_TEXTO)
      pdf.text(paraPdfTexto(marcador), this.marginX, this.y)
    }
    let x = x0
    let lineStart = true
    const newline = () => { this.y += LINE_H; this.ensureSpace(LINE_H); x = x0; lineStart = true }
    for (const seg of segments) {
      const style = seg.bold ? 'bold' : (seg.italic ? 'italic' : 'normal')
      pdf.setFont(undefined, style)
      pdf.setTextColor(...(seg.cor || COR_TEXTO))
      const tokens = paraPdfTexto(seg.text).split(/(\s+)/)
      for (const tok of tokens) {
        if (tok === '') continue
        if (tok === '\n') { newline(); continue }
        const isSpace = /^\s+$/.test(tok)
        if (isSpace && lineStart) continue // não desenha espaço logo após quebra de linha
        const w = pdf.getTextWidth(tok)
        if (!isSpace && x + w > this.rightEdge && !lineStart) newline()
        pdf.text(tok, x, this.y)
        x += w
        lineStart = false
      }
    }
    this.y += LINE_H
  }

  // Sumário (Fase 9) — insere página(s) em branco logo após a capa (posição
  // 2, 3...) com a lista de seções/subseções e o NÚMERO DE PÁGINA REAL de
  // cada uma, clicável (link interno). `entries` já vem pronto do chamador
  // (pdfManual.js), com `page` = número registrado DURANTE a geração do
  // conteúdo, ou seja, ANTES desta inserção — como inserir N páginas de
  // sumário empurra todo o conteúdo posterior N posições pra frente, a
  // página FINAL de cada entrada só é conhecida aqui (page + N). Por isso a
  // ordem importa: gerar todo o conteúdo primeiro (com heading() sendo
  // chamado normalmente), e só depois chamar isto, por último, antes de finalize().
  //
  // Mecânica: jsPDF só permite ADICIONAR página no fim (addPage) ou mover
  // uma existente (movePage) — não existe "inserir no meio" direto. O método
  // `insertPage(antesDe)` do próprio jsPDF já embrulha os dois (addPage +
  // movePage) e deixa o cursor na página nova — chamado em sequência
  // (posição 2, depois 3, ...) empurra o conteúdo original inteiro pra
  // frente de uma vez, sem precisar calcular deslocamento manualmente linha
  // por linha.
  //
  // Pré-cálculo de quantas páginas o sumário ocupa: os títulos aqui são
  // sempre curtos o bastante pra não quebrar linha (títulos de seção/
  // subseção do manual, não texto livre), então a contagem de linhas por
  // página é 100% determinística — sem isso, não daria pra saber o
  // deslocamento ANTES de desenhar os números.
  inserirSumario(entries, { titulo = 'Sumário' } = {}) {
    if (!entries || entries.length === 0) return
    const pdf = this.pdf
    const rowH1 = 7.2, rowH2 = 5.6
    const topPrimeira = 20 + 12 // título "Sumário" + linha + respiro
    const topDemais = 20

    let paginas = 1
    let ySim = topPrimeira
    for (const e of entries) {
      const h = e.level === 1 ? rowH1 : rowH2
      if (ySim + h > this.maxY) { paginas++; ySim = topDemais }
      ySim += h
    }

    // Insere as N páginas em branco logo após a capa (posição 2, 3...) —
    // cada insertPage já desloca o restante do documento e foca a nova página.
    for (let i = 0; i < paginas; i++) pdf.insertPage(2 + i)

    pdf.setPage(2)
    let y = 20
    pdf.setFont(undefined, 'bold'); pdf.setFontSize(15); pdf.setTextColor(...COR_TITULO)
    pdf.text(paraPdfTexto(titulo), this.marginX, y)
    y += 3
    pdf.setDrawColor(...COR_BORDA)
    pdf.line(this.marginX, y, this.rightEdge, y)
    y += 9
    let paginaDesenho = 2

    for (const e of entries) {
      const h = e.level === 1 ? rowH1 : rowH2
      if (y + h > this.maxY) {
        paginaDesenho++
        pdf.setPage(paginaDesenho)
        y = topDemais
      }
      const paginaFinal = e.page + paginas
      const indent = e.level === 1 ? 0 : 7
      const baseline = y + (e.level === 1 ? 4.6 : 4)
      pdf.setFont(undefined, e.level === 1 ? 'bold' : 'normal')
      pdf.setFontSize(e.level === 1 ? 10.3 : 9.2)
      pdf.setTextColor(...(e.level === 1 ? COR_TITULO : COR_MUTED))
      const texto = paraPdfTexto(e.titulo)
      const textX = this.marginX + indent
      pdf.text(texto, textX, baseline)
      const numTxt = String(paginaFinal)
      const numW = pdf.getTextWidth(numTxt)
      pdf.setTextColor(...COR_MUTED)
      pdf.text(numTxt, this.rightEdge, baseline, { align: 'right' })
      // Pontilhado ligando o título ao número — só se sobrar espaço (títulos
      // longos numa coluna estreita simplesmente não ganham pontilhado).
      const textW = pdf.getTextWidth(texto)
      const dotsX0 = textX + textW + 2
      const dotsX1 = this.rightEdge - numW - 3
      if (dotsX1 > dotsX0) {
        pdf.setFont(undefined, 'normal'); pdf.setFontSize(9); pdf.setTextColor(...COR_BORDA)
        const dotW = pdf.getTextWidth('.')
        const nDots = Math.max(0, Math.floor((dotsX1 - dotsX0) / (dotW * 1.8)))
        if (nDots > 0) pdf.text('.'.repeat(nDots), dotsX0, baseline)
      }
      // Link clicável cobrindo a linha inteira (não só o texto) — pula pra
      // página de destino.
      pdf.link(this.marginX, y, this.rightEdge - this.marginX, h, { pageNumber: paginaFinal })
      y += h
    }

    // Devolve o cursor pra última página real do documento (a última página
    // de conteúdo, agora deslocada +paginas posições) — finalize()/save()
    // não dependem disso (finalize itera 1..total sozinho), mas deixa o
    // estado do jsPDF coerente caso algo mais seja desenhado depois.
    pdf.setPage(pdf.internal.getNumberOfPages())
  }

  // Bloco de assinatura (Fase 8, Etapa F) — uma linha por nome + "Data: ___/
  // ___/___" logo abaixo, desenhado onde o cursor estiver (chamador decide
  // quando: normalmente por último, antes de finalize()). Sem nomes, não
  // desenha nada (nunca um bloco vazio "Assinaturas" sem ninguém pra assinar).
  blocoAssinatura(nomes) {
    if (!nomes || nomes.length === 0) return
    this.heading('Assinaturas', this.numerarSecoes ? 1 : 2)
    const larguraLinha = 70
    const gapX = 12
    const porLinha = Math.max(1, Math.floor((this.rightEdge - this.marginX + gapX) / (larguraLinha + gapX)))
    const alturaBloco = 22
    nomes.forEach((nome, i) => {
      const col = i % porLinha
      const linha = Math.floor(i / porLinha)
      if (col === 0) this.ensureSpace(alturaBloco)
      const x = this.marginX + col * (larguraLinha + gapX)
      const y = this.y + linha * alturaBloco
      this.pdf.setDrawColor(...COR_TEXTO)
      this.pdf.line(x, y + 14, x + larguraLinha, y + 14)
      this.pdf.setFont(undefined, 'normal'); this.pdf.setFontSize(9)
      this.pdf.setTextColor(...COR_TEXTO)
      this.pdf.text(paraPdfTexto(nome), x, y + 18, { maxWidth: larguraLinha })
      this.pdf.setFontSize(7.5); this.pdf.setTextColor(...COR_MUTED)
      this.pdf.text('Data: ___/___/______', x, y + 22)
    })
    const linhas = Math.ceil(nomes.length / porLinha)
    this.y += linhas * alturaBloco + 4
  }

  // Segunda passada: numeração de página (só sabemos o total no final) +
  // rodapé de texto simples em todas as páginas — sem nenhuma imagem.
  finalize(rodapeTexto) {
    const total = this.pdf.internal.getNumberOfPages()
    for (let p = 1; p <= total; p++) {
      this.pdf.setPage(p)
      this.pdf.setDrawColor(...COR_BORDA)
      this.pdf.line(this.marginX, this.pgH - 12, this.rightEdge, this.pgH - 12)
      this.pdf.setFont(undefined, 'normal'); this.pdf.setFontSize(7.5); this.pdf.setTextColor(150, 150, 150)
      this.pdf.text(paraPdfTexto(`${rodapeTexto} · pág. ${p}/${total}`), this.rightEdge, this.pgH - 8, { align: 'right' })
    }
  }

  save(filename) {
    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')
    this.pdf.save(`${filename}-${dateStr}.pdf`)
  }
}

function normalizeSegments(segments) {
  return (Array.isArray(segments) ? segments : [{ text: String(segments) }]).filter(s => s && s.text)
}
function segmentsHaveText(segments) {
  const arr = Array.isArray(segments) ? segments : [{ text: String(segments) }]
  return arr.some(s => s?.text && s.text.trim())
}

// ── Logo da fazenda pra capa dos PDFs de texto real (Manual + 3 Relatórios,
// Fase 9) ────────────────────────────────────────────────────────────────
// Recorte circular (mesma técnica de pdf.js::carregarImgCircular, usada pelo
// gerador antigo de captura de tela) — mas em JPEG comprimido, não PNG: o
// logo é a única imagem "grande" que esses PDFs de texto real carregam, e
// PNG sem perdas inflaria o arquivo à toa numa foto de fazenda (a foto tem
// ruído/gradiente — não é ícone/arte plana, onde PNG venceria). Fundo branco
// preenchido ANTES do recorte porque JPEG não tem canal alfa: sem isso, a
// área fora do círculo saía preta em vez de transparente/branca. tamanhoMax
// evita subir a resolução do upload original (normalmente bem maior que o
// que cabe na capa) sem necessidade.
// Nunca rejeita a Promise: sem foto_url, ou se a imagem falhar ao carregar
// (URL quebrada, CORS), resolve null — a capa segue sem logo, sem travar a
// geração do PDF.
export function carregarLogoFazenda(url, tamanhoMax = 240) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const tamOriginal = Math.min(img.naturalWidth, img.naturalHeight)
        const tam = Math.min(tamOriginal, tamanhoMax)
        const sx = (img.naturalWidth - tamOriginal) / 2
        const sy = (img.naturalHeight - tamOriginal) / 2
        const c = document.createElement('canvas')
        c.width = tam; c.height = tam
        const ctx = c.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, tam, tam)
        ctx.save()
        ctx.beginPath()
        ctx.arc(tam / 2, tam / 2, tam / 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(img, sx, sy, tamOriginal, tamOriginal, 0, 0, tam, tam)
        ctx.restore()
        resolve(c.toDataURL('image/jpeg', 0.82))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
