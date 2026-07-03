import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { registrarGreatVibes } from './greatvibes-font'

const carregarImg = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    resolve({ dataURL: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight })
  }
  img.onerror = reject
  img.src = src
})

// cache das imagens para não recarregar toda vez
let _imgs = null
const getImgs = async () => {
  if (_imgs) return _imgs
  const [headerNovo, headerHoriz, marca] = await Promise.all([
    carregarImg('/pdf-header-novo.png'),
    carregarImg('/pdf-header.png'),
    carregarImg('/pdf-marca.png'),
  ])
  _imgs = { headerNovo, headerHoriz, marca }
  return _imgs
}

export async function gerarPDFComMolduras(elemento, filename, titulo = '', fazenda = '') {
  if (!elemento) return
  const { headerNovo, headerHoriz, marca } = await getImgs()
  const canvas = await html2canvas(elemento, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })

  const pdf  = new jsPDF('p', 'mm', 'a4')
  registrarGreatVibes(pdf)
  const pgW  = pdf.internal.pageSize.getWidth()   // 210
  const pgH  = pdf.internal.pageSize.getHeight()  // 297

  const margem     = 12
  const headerH    = 20
  const footerH    = 14
  const contentTop = margem + headerH + (titulo ? 18 : 6)
  const contentBot = pgH - footerH - margem
  const contentH   = contentBot - contentTop
  const contentW   = pgW - margem * 2

  const desenharMolduras = (numPag, totalPag) => {
    // cabeçalho: logo nova à esquerda, altura fixa
    const chH = headerH
    const chW = (headerNovo.w * chH) / headerNovo.h
    pdf.addImage(headerNovo.dataURL, 'PNG', margem, margem, chW, chH)

    // nome da fazenda centralizado na página
    if (fazenda) {
      pdf.setFont('GreatVibes', 'normal')
      pdf.setFontSize(30); pdf.setTextColor(35,35,35)
      pdf.text(fazenda, pgW/2, margem + headerH/2 + 4, { align: 'center' })
      pdf.setFont('helvetica', 'normal')
    }

    // título da seção
    if (titulo) {
      pdf.setFont(undefined, 'bold')
      pdf.setFontSize(16); pdf.setTextColor(20,20,20)
      pdf.text(titulo, pgW/2, margem + headerH + 7, { align: 'center' })
      pdf.setFont(undefined, 'normal')
    }

    // rodapé: logo pequena à esquerda + texto à direita
    const fW = 42
    const fH = (headerHoriz.h * fW) / headerHoriz.w
    pdf.addImage(headerHoriz.dataURL, 'PNG', margem, pgH - margem - fH, fW, fH)
    pdf.setFontSize(8); pdf.setTextColor(120,120,120)
    const dataStr = new Date().toLocaleDateString('pt-BR')
    pdf.text(`DigitalBov · ${dataStr} · Página ${numPag}/${totalPag}`, pgW - margem, pgH - margem - 2, { align: 'right' })
  }

  const desenharMarca = () => {
    const mW = 95
    const mH = (marca.h * mW) / marca.w
    if (pdf.GState) {
      pdf.setGState(pdf.GState({ opacity: 0.08 }))
      pdf.addImage(marca.dataURL, 'PNG', (pgW - mW)/2, (pgH - mH)/2, mW, mH)
      pdf.setGState(pdf.GState({ opacity: 1 }))
    }
  }

  const imgFullH = (canvas.height * contentW) / canvas.width
  const totalPag = Math.max(1, Math.ceil(imgFullH / contentH))

  for (let p = 0; p < totalPag; p++) {
    if (p > 0) pdf.addPage()
    desenharMolduras(p + 1, totalPag)
    const sy = (p * contentH) * (canvas.width / contentW)
    const sh = Math.min(contentH * (canvas.width / contentW), canvas.height - sy)
    if (sh <= 0) continue
    const slice = document.createElement('canvas')
    slice.width = canvas.width; slice.height = sh
    slice.getContext('2d').drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
    const sliceH = (sh * contentW) / canvas.width
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margem, contentTop, contentW, sliceH)
    desenharMarca()
  }

  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')
  pdf.save(`${filename}-${dateStr}.pdf`)
}
