// Gera public/DigitalBov-cadastro-em-lote.xlsx do ZERO, por código — nunca edite
// esse .xlsx manualmente no Excel. Qualquer mudança de coluna (novo campo,
// nova validação, texto do comentário) se faz AQUI e se aplica rodando de novo:
//
//   node scripts/gerar-modelo-cadastro-animais.mjs
//
// A ORDEM das colunas abaixo (array COLUNAS_ANIMAIS) precisa ser EXATAMENTE a
// mesma ordem de `COLUNAS` em src/lib/importacaoAnimais.js — a leitura da
// planilha lá é por POSIÇÃO da coluna, não pelo texto do cabeçalho.
//
// Réplica visual do arquivo original (gerado à mão via openpyxl em 2026):
// título/subtítulo mesclados, cabeçalhos obrigatório=roxo/opcional=azul com
// borda e comentário, 2 linhas de exemplo em itálico cinza, 50 linhas vazias
// zebradas, painel congelado após a linha de cabeçalho, listas de validação
// nas colunas de vocabulário fechado (sexo/situação/situação reprodutiva/
// classificação) — mais a aba "Instruções".
import ExcelJS from 'exceljs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEST = path.join(__dirname, '..', 'public', 'DigitalBov-cadastro-em-lote.xlsx')

// ── Paleta (mesmas cores do design system do app, ver src/styles/global.css) ─
const COR = {
  brancoTexto:  'FFFFFFFF',
  azul:         'FF2B6CD9',  // --brand-green (é o azul, o nome é legado)
  azulClaro:    'FFE8F0FC',  // --brand-green-bg
  roxo:         'FF7B2FBE',  // --brand-green-mid
  cinzaZebra:   'FFF9FAFB',  // --gray-50
  cinzaBorda:   'FFD1D5DB',  // --gray-300
  cinzaSub:     'FF6B7280',  // --gray-500
  cinzaExemplo: 'FF9CA3AF',  // --gray-400
  textoCorpo:   'FF374151',  // --gray-700
  vermelho:     'FFDC2626',
}

const BORDA_FINA = { style: 'thin', color: { argb: COR.cinzaBorda } }
const BORDA_CELULA = { top: BORDA_FINA, left: BORDA_FINA, bottom: BORDA_FINA, right: BORDA_FINA }

// ── Colunas da planilha "Animais" — mesma ordem de COLUNAS em
// src/lib/importacaoAnimais.js. `obrigatorio` só é visual aqui (cabeçalho
// roxo + comentário "Obrigatório"); a validação de fato acontece no app.
// `align`: como as 2 linhas de exemplo e as 50 linhas em branco são alinhadas.
// `validacao`: lista fixa (dropdown) — omitido quando o campo é texto livre.
const COLUNAS_ANIMAIS = [
  { chave: 'brinco',          titulo: 'Brinco *',              obrigatorio: true,  largura: 12, align: 'center', comentario: 'Identificação única do animal (texto). Obrigatório.' },
  { chave: 'sexo',             titulo: 'Sexo *',                 obrigatorio: true,  largura: 8,  align: 'center', comentario: 'M = Macho, F = Fêmea. Obrigatório.', validacao: { lista: ['M', 'F'], errorTitle: 'Sexo inválido', error: 'Use M ou F' } },
  { chave: 'data_nascimento',  titulo: 'Data Nascimento *',      obrigatorio: true,  largura: 18, align: 'center', comentario: 'Formato AAAA-MM-DD, ex: 2023-05-15. Obrigatório.' },
  { chave: 'proprietario',     titulo: 'Proprietário *',         obrigatorio: true,  largura: 24, align: 'left',   comentario: 'Nome EXATO de um proprietário já cadastrado no sistema. Obrigatório.' },
  { chave: 'raca',             titulo: 'Raça',                   obrigatorio: false, largura: 12, align: 'left',   comentario: 'Texto livre. Opcional.' },
  { chave: 'pelagem',          titulo: 'Pelagem',                obrigatorio: false, largura: 12, align: 'left',   comentario: 'Texto livre. Opcional.' },
  { chave: 'pai',              titulo: 'Pai (touro)',            obrigatorio: false, largura: 16, align: 'left',   comentario: 'Nome do touro. Opcional.' },
  { chave: 'mae_brinco',       titulo: 'Brinco da Mãe',          obrigatorio: false, largura: 14, align: 'left',   comentario: 'Brinco da mãe. Opcional.' },
  { chave: 'lote',             titulo: 'Lote',                   obrigatorio: false, largura: 16, align: 'left',   comentario: 'Nome EXATO de um lote já cadastrado. Opcional.' },
  { chave: 'situacao',         titulo: 'Situação',               obrigatorio: false, largura: 12, align: 'center', comentario: 'ativo, vendido ou morto. Padrão: ativo.', validacao: { lista: ['ativo', 'vendido', 'morto'] } },
  { chave: 'sit_reprodutiva',  titulo: 'Situação Reprodutiva',   obrigatorio: false, largura: 20, align: 'left',   comentario: 'prenha, vazia ou nao_se_aplica. Só para fêmeas.', validacao: { lista: ['prenha', 'vazia', 'nao_se_aplica'] } },
  // Fase 13 — campos novos, sempre no FIM (compatibilidade com o que já foi
  // documentado pro cliente sobre as colunas A-K continuarem no mesmo lugar).
  { chave: 'numero_registro',  titulo: 'Número do Registro',     obrigatorio: false, largura: 16, align: 'left',   comentario: 'Texto livre. Opcional.' },
  { chave: 'classificacao',    titulo: 'Classificação',          obrigatorio: false, largura: 14, align: 'center', comentario: 'PO, PA, CO ou N/A. Opcional.', validacao: { lista: ['PO', 'PA', 'CO', 'NA'] } },
  { chave: 'sisbov',           titulo: 'SISBOV',                 obrigatorio: false, largura: 16, align: 'left',   comentario: 'Somente números — padrão brasileiro tem 15 dígitos, mas formatos antigos são aceitos. Opcional.' },
]

// 2 linhas de exemplo (linha 4 = fêmea com todos os campos novos preenchidos,
// linha 5 = macho deixando os campos novos em branco, pra deixar claro que
// são opcionais) — mesmo par de exemplos do arquivo original, só estendido.
const EXEMPLOS = [
  {
    brinco: '0001', sexo: 'F', data_nascimento: '2023-05-15', proprietario: 'João da Silva',
    raca: 'Angus', pelagem: 'Preto', pai: 'Touro REM', mae_brinco: '', lote: 'Matrizes',
    situacao: 'ativo', sit_reprodutiva: 'vazia',
    numero_registro: 'PO-1234', classificacao: 'PO', sisbov: '105091012345678',
  },
  {
    brinco: '0002', sexo: 'M', data_nascimento: '2023-08-20', proprietario: 'João da Silva',
    raca: 'Angus', pelagem: 'Preto', pai: '', mae_brinco: '', lote: 'Recria',
    situacao: 'ativo', sit_reprodutiva: 'nao_se_aplica',
    numero_registro: '', classificacao: '', sisbov: '',
  },
]

const LINHA_CABECALHO = 3
const LINHAS_VAZIAS = 50 // total de linhas em branco após os exemplos, pronta pra digitar
const PRIMEIRA_LINHA_DADOS = LINHA_CABECALHO + 1
const ULTIMA_LINHA_VAZIA = LINHA_CABECALHO + EXEMPLOS.length + LINHAS_VAZIAS

function letra(i) { return String.fromCharCode(65 + i) } // 0-based -> 'A','B',...

async function gerarAbaAnimais(wb) {
  const ws = wb.addWorksheet('Animais', {
    views: [{ state: 'frozen', ySplit: LINHA_CABECALHO, topLeftCell: `A${PRIMEIRA_LINHA_DADOS}`, activePane: 'bottomLeft' }],
  })

  const nCols = COLUNAS_ANIMAIS.length
  const ultimaCol = letra(nCols - 1)

  ws.columns = COLUNAS_ANIMAIS.map(c => ({ width: c.largura }))

  // ── Título + subtítulo (linhas 1-2, mescladas) ──
  ws.mergeCells(`A1:${ultimaCol}1`)
  const titulo = ws.getCell('A1')
  titulo.value = 'DIGITALBOV  —  CADASTRO DE ANIMAIS EM LOTE'
  titulo.font = { name: 'Calibri', bold: true, size: 15, color: { argb: COR.brancoTexto } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.azul } }
  titulo.alignment = { horizontal: 'center', vertical: 'center' }
  ws.getRow(1).height = 30

  ws.mergeCells(`A2:${ultimaCol}2`)
  const subtitulo = ws.getCell('A2')
  subtitulo.value = 'Preencha uma linha por animal. Campos com * são obrigatórios. Apague as linhas de exemplo antes de importar.'
  subtitulo.font = { name: 'Calibri', italic: true, size: 9, color: { argb: COR.cinzaSub } }
  subtitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.azulClaro } }
  subtitulo.alignment = { horizontal: 'center', vertical: 'center' }
  ws.getRow(2).height = 20

  // ── Cabeçalhos (linha 3) — roxo pros obrigatórios, azul pros opcionais ──
  const headerRow = ws.getRow(LINHA_CABECALHO)
  headerRow.height = 32
  COLUNAS_ANIMAIS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.titulo
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: COR.brancoTexto } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.obrigatorio ? COR.roxo : COR.azul } }
    cell.border = BORDA_CELULA
    cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
    cell.note = c.comentario
  })

  // ── Linhas de exemplo (itálico cinza) ──
  EXEMPLOS.forEach((ex, iEx) => {
    const row = ws.getRow(LINHA_CABECALHO + 1 + iEx)
    COLUNAS_ANIMAIS.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.value = ex[c.chave] ?? ''
      cell.font = { name: 'Calibri', italic: true, size: 10, color: { argb: COR.cinzaExemplo } }
      cell.border = BORDA_CELULA
      cell.alignment = { horizontal: c.align, vertical: 'center' }
    })
  })

  // ── Linhas em branco, zebradas, prontas pra digitar ──
  for (let r = LINHA_CABECALHO + EXEMPLOS.length + 1; r <= ULTIMA_LINHA_VAZIA; r++) {
    const zebra = (r % 2 === 0)
    const row = ws.getRow(r)
    COLUNAS_ANIMAIS.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.border = BORDA_CELULA
      cell.alignment = { horizontal: c.align, vertical: 'center' }
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.cinzaZebra } }
    })
  }

  // ── Validações (dropdown) — só nas linhas em branco, igual ao original
  // (as 2 linhas de exemplo já vêm preenchidas, não precisam de dropdown) ──
  COLUNAS_ANIMAIS.forEach((c, i) => {
    if (!c.validacao) return
    const col = letra(i)
    const ref = `${col}${LINHA_CABECALHO + EXEMPLOS.length + 1}:${col}${ULTIMA_LINHA_VAZIA}`
    ws.dataValidations.add(ref, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${c.validacao.lista.join(',')}"`],
      showErrorMessage: !!(c.validacao.errorTitle || c.validacao.error),
      errorTitle: c.validacao.errorTitle,
      error: c.validacao.error,
    })
  })

  return ws
}

function linhaInstrucao(ws, r, texto, estilo) {
  const cell = ws.getCell(`A${r}`)
  if (texto) cell.value = texto
  if (estilo) Object.assign(cell, estilo)
}

function gerarAbaInstrucoes(wb) {
  const ws = wb.addWorksheet('Instruções')
  ws.getColumn(1).width = 80

  const estiloTitulo   = { font: { name: 'Calibri', bold: true, size: 15, color: { argb: COR.azul } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.azulClaro } }, alignment: { vertical: 'center' } }
  const estiloCorpo     = { font: { name: 'Calibri', size: 10, color: { argb: COR.textoCorpo } } }
  const estiloSubRoxo   = { font: { name: 'Calibri', bold: true, size: 12, color: { argb: COR.roxo } } }
  const estiloSubAzul   = { font: { name: 'Calibri', bold: true, size: 12, color: { argb: COR.azul } } }
  const estiloAviso     = { font: { name: 'Calibri', bold: true, size: 12, color: { argb: COR.vermelho } } }

  let r = 1
  ws.getRow(r).height = 28
  linhaInstrucao(ws, r++, 'DIGITALBOV — COMO PREENCHER A PLANILHA', estiloTitulo)
  linhaInstrucao(ws, r++, null, estiloCorpo)
  linhaInstrucao(ws, r++, 'Passo a passo:', estiloSubRoxo)
  linhaInstrucao(ws, r++, "1. Vá para a aba 'Animais' na parte de baixo.", estiloCorpo)
  linhaInstrucao(ws, r++, '2. Preencha uma linha por animal.', estiloCorpo)
  linhaInstrucao(ws, r++, '3. Não altere os nomes das colunas nem a ordem.', estiloCorpo)
  linhaInstrucao(ws, r++, '4. Apague as duas linhas de exemplo (cinza) antes de importar.', estiloCorpo)
  linhaInstrucao(ws, r++, '5. Salve o arquivo (.xlsx).', estiloCorpo)
  linhaInstrucao(ws, r++, "6. No sistema, clique em 'Importar planilha de cadastro em lote'.", estiloCorpo)
  linhaInstrucao(ws, r++, null, estiloCorpo)
  linhaInstrucao(ws, r++, 'Campos OBRIGATÓRIOS (marcados com * e cabeçalho roxo):', estiloSubRoxo)
  linhaInstrucao(ws, r++, '• Brinco — identificação única do animal.', estiloCorpo)
  linhaInstrucao(ws, r++, '• Sexo — M (macho) ou F (fêmea).', estiloCorpo)
  linhaInstrucao(ws, r++, '• Data Nascimento — formato AAAA-MM-DD (ex: 2023-05-15).', estiloCorpo)
  linhaInstrucao(ws, r++, '• Proprietário — nome EXATO de um proprietário já cadastrado.', estiloCorpo)
  linhaInstrucao(ws, r++, null, estiloCorpo)
  linhaInstrucao(ws, r++, 'Campos OPCIONAIS (cabeçalho azul):', estiloSubAzul)
  linhaInstrucao(ws, r++, '• Raça, Pelagem, Pai (touro), Brinco da Mãe — texto livre.', estiloCorpo)
  linhaInstrucao(ws, r++, '• Lote — nome EXATO de um lote já cadastrado.', estiloCorpo)
  linhaInstrucao(ws, r++, '• Situação — ativo, vendido ou morto (padrão: ativo).', estiloCorpo)
  linhaInstrucao(ws, r++, '• Situação Reprodutiva — prenha, vazia ou nao_se_aplica (só fêmeas).', estiloCorpo)
  linhaInstrucao(ws, r++, '• Número do Registro — texto livre.', estiloCorpo)
  linhaInstrucao(ws, r++, '• Classificação — PO, PA, CO ou N/A.', estiloCorpo)
  linhaInstrucao(ws, r++, '• SISBOV — somente números; padrão brasileiro tem 15 dígitos, mas aceita outros formatos.', estiloCorpo)
  linhaInstrucao(ws, r++, null, estiloCorpo)
  linhaInstrucao(ws, r++, 'IMPORTANTE:', estiloAviso)
  linhaInstrucao(ws, r++, 'Cadastre os proprietários e lotes no sistema ANTES de importar,', estiloCorpo)
  linhaInstrucao(ws, r++, 'para que os nomes digitados aqui sejam reconhecidos.', estiloCorpo)
  linhaInstrucao(ws, r++, 'Linhas com erro são ignoradas — o sistema mostra o motivo de cada uma.', estiloCorpo)

  return ws
}

async function main() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DigitalBov'
  wb.created = new Date()
  wb.modified = wb.created

  await gerarAbaAnimais(wb)
  gerarAbaInstrucoes(wb)

  await wb.xlsx.writeFile(DEST)
  console.log(`Gerado: ${DEST}`)
  console.log(`Colunas da aba "Animais" (${COLUNAS_ANIMAIS.length}): ${COLUNAS_ANIMAIS.map(c => c.chave).join(', ')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
