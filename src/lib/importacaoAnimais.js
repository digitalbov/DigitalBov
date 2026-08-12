// xlsx é uma lib pesada (~140kB gzip) usada só quando o usuário de fato
// importa uma planilha — por isso é carregada sob demanda (import dinâmico)
// dentro de lerPlanilhaAnimais, em vez de estática no topo do arquivo (o que
// forçaria o download em toda visita à tela de Animais).

import { resolverTouroDigitado } from './helpers'

// Colunas da planilha modelo (ordem e nomes exatos). numero_registro/
// classificacao/sisbov (Fase 13) foram adicionadas no FIM de propósito —
// templates antigos (sem essas 3 colunas) continuam funcionando, só vêm com
// esses campos vazios (todos opcionais).
export const COLUNAS = [
  'brinco', 'sexo', 'data_nascimento', 'proprietario',
  'raca', 'pelagem', 'pai', 'mae_brinco', 'lote',
  'situacao', 'sit_reprodutiva',
  'numero_registro', 'classificacao', 'sisbov',
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
  const XLSX = await import('xlsx')
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
// tourosCadastrados/tourosExternos (Item 5) resolvem "pai" pra
// pai_animal_id/pai_externo_id — só quando o texto bate com um cadastro OU
// externo JÁ EXISTENTE (mesma resolverTouroDigitado do formulário manual).
// Proposital NÃO chamar findOrCreate aqui: uma planilha de centenas de linhas
// com erro de digitação no nome do touro criaria touros_externos de lixo em
// massa, sem ninguém revisar cada um antes — diferente do cadastro manual
// (uma linha por vez, o usuário vê a confirmação ao vivo antes de salvar).
// Quem não bate com nada existente fica só como texto, igual sempre foi.
// mae_brinco->mae_id fica de propósito FORA daqui — vira uma segunda passada
// em Animais.jsx::confirmarImportacao, depois que TODAS as linhas já foram
// inseridas (mesmo princípio das camadas de lancamentos_financeiros na
// restauração de backup): a mãe pode estar na MESMA planilha, ainda sem id
// nenhum no momento desta validação.
// Retorna { validos: [payloads], erros: [{linha, motivo}], paiResolvidos, paiTexto }
export function validarLinhas(linhas, proprietarios, lotes, tourosCadastrados = [], tourosExternos = []) {
  const validos = []
  const erros = []
  let paiResolvidos = 0, paiTexto = 0
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

    // Classificação (Fase 13) — opcional; se preenchida, precisa ser um dos
    // códigos válidos (não bloqueia a linha inteira por um valor vazio).
    const classifRaw = String(linha.classificacao || '').trim().toUpperCase()
    if (classifRaw && !['PO','PA','CO','NA'].includes(classifRaw)) {
      erros.push({ linha: nLinha, motivo: 'classificacao deve ser PO, PA, CO ou N/A' }); return
    }

    // Resolve o pai contra cadastro/externo já EXISTENTE — pura, sem rede
    // (nunca cria touros_externos aqui, ver comentário no topo da função).
    const paiTxt = String(linha.pai || '').trim() || null
    let paiAnimalId = null, paiExternoId = null
    if (paiTxt) {
      const r = resolverTouroDigitado(paiTxt, tourosCadastrados, tourosExternos)
      if (r?.tipo === 'cadastro') { paiAnimalId = r.touro.id; paiResolvidos++ }
      else if (r?.tipo === 'externo_exato') { paiExternoId = r.touro.id; paiResolvidos++ }
      else { paiTexto++ }
    }

    validos.push({
      brinco, sexo, data_nascimento: dataNasc,
      raca: String(linha.raca || '').trim() || 'Angus',
      pelagem: String(linha.pelagem || '').trim() || null,
      pai: paiTxt,
      pai_animal_id: paiAnimalId,
      pai_externo_id: paiExternoId,
      mae_brinco: String(linha.mae_brinco || '').trim() || null,
      proprietario_id: propId,
      lote_id: loteId,
      situacao,
      sit_reprodutiva: sitRep,
      numero_registro: String(linha.numero_registro || '').trim() || null,
      classificacao: classifRaw || null,
      // SISBOV: só dígitos — planilha pode trazer formatação/espaços por engano.
      // Sem validação de tamanho aqui (mesma regra do cadastro manual: avisa,
      // nunca bloqueia — e numa importação em lote nem daria pra avisar por linha).
      sisbov: String(linha.sisbov || '').replace(/\D/g, '') || null,
    })
  })

  return { validos, erros, paiResolvidos, paiTexto }
}
