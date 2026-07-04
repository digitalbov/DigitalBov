import * as XLSX from 'xlsx'

// Colunas da planilha modelo (ordem e nomes exatos)
export const COLUNAS = [
  'brinco', 'sexo', 'data_nascimento', 'proprietario',
  'raca', 'pelagem', 'pai', 'mae_brinco', 'lote',
  'situacao', 'sit_reprodutiva'
]

// Baixa o modelo pronto (formatado manualmente, com título, cores e
// dropdowns de validação) que fica em public/. A lib xlsx (community)
// perde estilos ao escrever com XLSX.writeFile, então não geramos mais
// o arquivo em código — apenas servimos o .xlsx já pronto.
export function baixarModeloAnimais() {
  const link = document.createElement('a')
  link.href = '/DigitalBov-cadastro-em-lote.xlsx'
  link.download = 'DigitalBov-cadastro-em-lote.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Lê o arquivo e retorna as linhas da aba "Animais".
// Lê por POSIÇÃO da coluna (não pelo texto do cabeçalho), remapeando para as
// chaves técnicas de COLUNAS — assim o cabeçalho pode ter rótulos amigáveis
// sem quebrar a leitura, desde que a ordem das colunas siga o modelo em
// public/DigitalBov-cadastro-em-lote.xlsx.
// Layout do modelo: linha 1 = título, linha 2 = subtítulo, linha 3 = cabeçalho,
// linha 4 em diante = dados. Ou seja, pulamos as 3 primeiras linhas (índices 0-2).
export async function lerPlanilhaAnimais(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const aba = wb.Sheets['Animais'] || wb.Sheets[wb.SheetNames[0]]
  const linhasArr = XLSX.utils.sheet_to_json(aba, { header: 1, defval: '' })
  const linhas = linhasArr.slice(3).map(row => {
    const obj = {}
    COLUNAS.forEach((chave, i) => { obj[chave] = row[i] ?? '' })
    return obj
  })
  return linhas
}

// Valida e transforma as linhas em payloads prontos para inserir.
// proprietarios e lotes são arrays [{id, nome}] para mapear nome->id.
// Retorna { validos: [payloads], erros: [{linha, motivo}] }
export function validarLinhas(linhas, proprietarios, lotes) {
  const validos = []
  const erros = []
  const propPorNome = {}
  proprietarios.forEach(p => { propPorNome[(p.nome||'').trim().toLowerCase()] = p.id })
  const lotePorNome = {}
  lotes.forEach(l => { lotePorNome[(l.nome||'').trim().toLowerCase()] = l.id })

  linhas.forEach((linha, i) => {
    const nLinha = i + 4 // +4: título+subtítulo+cabeçalho ocupam as linhas 1-3, dados começam na linha 4
    const brinco = String(linha.brinco || '').trim()
    const sexo = String(linha.sexo || '').trim().toUpperCase()
    const dataNasc = String(linha.data_nascimento || '').trim()
    const propNome = String(linha.proprietario || '').trim()

    // pular linhas totalmente vazias
    if (!brinco && !sexo && !dataNasc && !propNome) return

    if (!brinco) { erros.push({ linha: nLinha, motivo: 'brinco vazio' }); return }
    if (sexo !== 'M' && sexo !== 'F') { erros.push({ linha: nLinha, motivo: 'sexo deve ser M ou F' }); return }
    if (!dataNasc) { erros.push({ linha: nLinha, motivo: 'data_nascimento vazia' }); return }
    // valida formato de data simples AAAA-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNasc)) { erros.push({ linha: nLinha, motivo: 'data deve ser AAAA-MM-DD' }); return }
    if (!propNome) { erros.push({ linha: nLinha, motivo: 'proprietario vazio' }); return }

    const propId = propPorNome[propNome.toLowerCase()]
    if (!propId) { erros.push({ linha: nLinha, motivo: `proprietário "${propNome}" não encontrado` }); return }

    const loteNome = String(linha.lote || '').trim()
    let loteId = null
    if (loteNome) {
      loteId = lotePorNome[loteNome.toLowerCase()]
      if (!loteId) { erros.push({ linha: nLinha, motivo: `lote "${loteNome}" não encontrado` }); return }
    }

    const situacao = String(linha.situacao || 'ativo').trim().toLowerCase()
    if (!['ativo','vendido','morto'].includes(situacao)) { erros.push({ linha: nLinha, motivo: 'situacao inválida' }); return }

    let sitRep = String(linha.sit_reprodutiva || '').trim().toLowerCase()
    if (sexo === 'F') {
      if (!sitRep) sitRep = 'vazia'
      if (!['prenha','vazia','nao_se_aplica'].includes(sitRep)) { erros.push({ linha: nLinha, motivo: 'sit_reprodutiva inválida' }); return }
    } else {
      sitRep = 'nao_se_aplica'
    }

    validos.push({
      brinco, sexo, data_nascimento: dataNasc,
      raca: String(linha.raca || '').trim() || 'Angus',
      pelagem: String(linha.pelagem || '').trim() || null,
      pai: String(linha.pai || '').trim() || null,
      mae_brinco: String(linha.mae_brinco || '').trim() || null,
      proprietario_id: propId,
      lote_id: loteId,
      situacao,
      sit_reprodutiva: sitRep,
    })
  })

  return { validos, erros }
}
