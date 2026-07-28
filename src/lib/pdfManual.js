import html2canvas from 'html2canvas'
import { PdfWriter } from './pdfWriter'

// ── PDF do Manual com TEXTO REAL ────────────────────────────────────────────
// Antes: html2canvas tirava um "print" da página inteira (uma div de ~25.000px
// de altura, escala 2x) e cada fatia virava uma imagem PNG por página — daí um
// manual de puro texto sair com 250MB e sem nenhuma palavra selecionável. Agora
// o DOM de cada seção é percorrido e o texto vira texto de verdade no PDF
// (jsPDF nativo — ver pdfWriter.js), pequeno e pesquisável. Só os widgets de
// demonstração interativos (os `Demo*` de cada seção, marcados com o atributo
// `data-pdf-shot` na raiz) continuam sendo capturados como imagem — são
// pequenos (uma caixa isolada, não a página toda), então o custo em tamanho e
// memória do navegador é desprezível perto do ganho de ter o resto em texto.
//
// O vocabulário de tags reconhecido cobre tudo que as ~18 SecaoXxx.jsx usam
// hoje (h4/h5 = subtítulos, p = parágrafo, ul/ol>li = listas, .card-title =
// título da seção, .alert = <AlertBox>, .badge = <Badge> inline). Qualquer
// coisa fora desse vocabulário (não deveria haver, ver auditoria feita antes
// de escrever isto) simplesmente não aparece no PDF — falha "apagada", nunca
// quebra a geração.
const CORES_BADGE = {
  purple: [124, 47, 190], red: [121, 31, 31], green: [39, 80, 10],
  amber: [186, 117, 23], gray: [107, 114, 128],
}

function corDoBadge(el) {
  const cls = [...el.classList].find(c => c.startsWith('badge-'))
  const key = cls ? cls.replace('badge-', '') : 'gray'
  return CORES_BADGE[key] || CORES_BADGE.gray
}

// Percorre o conteúdo INLINE de um <p>/<li> (texto + <strong>/<em>/<Badge>
// misturados), preservando negrito/itálico por trecho — é o que permite um
// parágrafo com "**texto em negrito** no meio" sair corretamente formatado
// mesmo com jsPDF não tendo rich-text nativo (a `PdfWriter._wrap` desenha
// segmento por segmento).
function extrairInline(el) {
  const segments = []
  const visit = (node, style) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) segments.push({ text: child.textContent, ...style })
        return
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const tag = child.tagName.toLowerCase()
      if (tag === 'i') return // ícone (webfont), sem texto útil
      if (tag === 'br') { segments.push({ text: '\n' }); return }
      if (tag === 'strong' || tag === 'b') { visit(child, { ...style, bold: true }); return }
      if (tag === 'em') { visit(child, { ...style, italic: true }); return }
      if (tag === 'span' && child.classList.contains('badge')) {
        segments.push({ text: child.textContent.trim(), bold: true, cor: corDoBadge(child) })
        segments.push({ text: ' ' })
        return
      }
      visit(child, style)
    })
  }
  visit(el, {})
  return segments
}

async function capturarShot(el) {
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
  return { dataURL: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }
}

export async function gerarPDFManualTexto(contentRef, filename, fazenda = '') {
  const root = contentRef?.current
  if (!root) return

  const writer = new PdfWriter({
    titulo: 'Manual do Sistema',
    fazenda,
    subtitulo: `Guia completo de uso do DigitalBov · gerado em ${new Date().toLocaleDateString('pt-BR')}`,
  })

  const secoes = root.querySelectorAll(':scope > section')
  for (const secao of secoes) {
    const nos = secao.querySelectorAll('.card-title, h2, h3, h4, h5, p, li, .alert, [data-pdf-shot]')
    const contadorOl = new Map()
    for (const el of nos) {
      if (el.matches('.card-title')) {
        writer.heading(el.textContent.trim(), 1)
      } else if (el.matches('h2, h3')) {
        writer.heading(el.textContent.trim(), 2)
      } else if (el.matches('h4, h5')) {
        writer.heading(el.textContent.trim(), el.tagName.toLowerCase() === 'h4' ? 2 : 3)
      } else if (el.matches('p')) {
        writer.paragraph(extrairInline(el))
      } else if (el.matches('li')) {
        const pai = el.parentElement
        const ordenada = pai?.tagName.toLowerCase() === 'ol'
        let marcador = '•'
        if (ordenada) {
          const n = (contadorOl.get(pai) || 0) + 1
          contadorOl.set(pai, n)
          marcador = `${n}.`
        }
        writer.bullet(extrairInline(el), { marcador })
      } else if (el.matches('.alert')) {
        const tipo = [...el.classList].find(c => c.startsWith('alert-'))?.replace('alert-', '') || 'green'
        const title = el.querySelector('.alert-title')?.textContent?.trim() || ''
        const body = el.querySelector('.alert-body')?.textContent?.trim() || ''
        writer.alertBox(tipo, title, body)
      } else if (el.hasAttribute('data-pdf-shot')) {
        const shot = await capturarShot(el)
        writer.image(shot.dataURL, shot.w, shot.h)
      }
    }
    writer.espaco(2)
  }

  writer.finalize('DigitalBov — Manual do Sistema')
  writer.save(filename)
}
