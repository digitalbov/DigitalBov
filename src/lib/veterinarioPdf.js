import { PdfWriter } from './pdfWriter'
import { fmtData, fmtMoeda } from './helpers'
import { TIPOS_ATESTADO, CAMPOS_DOCUMENTO_POR_TIPO, CAMPOS_ANIMAL_POR_TIPO, SEMPRE_TABELA, TEXTO_ATESTADO, formatarValorCampo, descricaoPorAnimal } from './veterinarioAtestados'

// ── PDFs do módulo Veterinário — 3 documentos, todos em cima do MESMO motor
// (PdfWriter, estilo:'carta') usado pelo Manual/Relatórios — nenhum caminho
// paralelo de geração. Logo em proporção original (ver pdfWriter.js::
// carregarLogoFazenda(url, tam, {circular:false})), nunca recortada em
// círculo — decisão explícita, diferente da capa de relatório.
const AZUL     = [30, 85, 176]
const VERMELHO = [121, 31, 31]

function rodapeContato(telefone, email) {
  return [telefone, email].filter(Boolean).join('  ·  ') || ' '
}

// ── 1) Prestação de contas ───────────────────────────────────────────────
// itens: [{ data, descricao, categoria, tipo:'R'|'D', valor }], já
// ORDENADOS por data pelo chamador (Veterinario.jsx) — apropriados e
// manuais chegam aqui MISTURADOS na mesma lista, sem nenhum campo que
// diferencie a origem, de propósito: a formatação tem que sair idêntica.
export function gerarPDFPrestacaoContas({ veterinario, cliente, itens, total, filename }) {
  const writer = new PdfWriter({
    titulo: 'Prestação de Contas',
    estilo: 'carta',
  })
  writer.cabecalhoCarta({
    logoDataURL: veterinario.logoDataURL,
    nome: veterinario.nome,
    slogan: veterinario.slogan,
    titulo: 'PRESTAÇÃO DE CONTAS',
  })

  writer.heading('Cliente', 2)
  writer.linha('Nome', cliente.nome || '—')
  writer.linha('Telefone', cliente.telefone || '—')
  writer.espaco(2)

  writer.heading('Lançamentos', 2)
  writer.table(
    [
      { label: 'Data' },
      { label: 'Descrição' },
      { label: 'Categoria' },
      { label: 'Valor', align: 'right' },
    ],
    itens.map(it => [
      fmtData(it.data),
      it.descricao || '—',
      it.categoria || '—',
      {
        text: (it.tipo === 'D' ? '- ' : '') + fmtMoeda(Math.abs(it.valor)),
        cor: it.tipo === 'D' ? VERMELHO : undefined,
      },
    ]),
    { larguras: [0.14, 0.42, 0.24, 0.20] },
  )

  writer.espaco(2)
  writer.linha('TOTAL', fmtMoeda(total), { corValor: total < 0 ? VERMELHO : AZUL })

  const temDadosBancarios = veterinario.banco || veterinario.agencia || veterinario.conta_bancaria || veterinario.pix
  if (temDadosBancarios) {
    writer.espaco(3)
    writer.heading('Dados bancários', 2)
    if (veterinario.banco)          writer.linha('Banco', veterinario.banco)
    if (veterinario.agencia)        writer.linha('Agência', veterinario.agencia)
    if (veterinario.conta_bancaria) writer.linha('Conta', veterinario.conta_bancaria)
    if (veterinario.pix)            writer.linha('PIX', veterinario.pix)
  }

  writer.assinatura(veterinario.nome, veterinario.crv)
  writer.finalize(rodapeContato(veterinario.telefone, veterinario.email))
  writer.save(filename)
}

// ── 2) Atestados — 1 função genérica pros 4 tipos (prenhez/brucelose/
// andrologico/vacinacao_brucelose) e pra qualquer tipo futuro. NADA aqui
// sabe o nome de um tipo específico — tudo vem de veterinarioAtestados.js
// (TIPOS_ATESTADO/CAMPOS_.../TEXTO_ATESTADO/SEMPRE_TABELA). Um 5º tipo não
// toca este arquivo, só o de config.
//
// dados: {
//   veterinario: {nome,slogan,logoDataURL,telefone,email},
//   documento: {data_evento,local_evento,proprietario_nome,veterinario_nome,
//               veterinario_crv, ...campos específicos do tipo},
//   animais: [{brinco,descricao_animal, ...campos específicos do tipo}],
//   filename,
// }
// documento.veterinario_nome/veterinario_crv são os digitados no MODAL no
// momento da emissão (podem divergir do cadastro atual) — a assinatura usa
// esses, não veterinario.nome/crv do cadastro, mesmo princípio do item 2 do
// plano: documento emitido não muda retroativamente.
export function gerarPDFAtestado(tipo, { veterinario, documento, animais, filename }) {
  const meta = TIPOS_ATESTADO.find(t => t.valor === tipo)
  if (!meta) throw new Error(`gerarPDFAtestado: tipo desconhecido "${tipo}"`)
  const tituloDoc = meta.label.toUpperCase()

  const writer = new PdfWriter({ titulo: meta.label, estilo: 'carta' })
  writer.cabecalhoCarta({
    logoDataURL: veterinario?.logoDataURL,
    nome: veterinario?.nome,
    slogan: veterinario?.slogan,
    titulo: tituloDoc,
  })
  writer.espaco(4)

  const singular = animais.length === 1
  const textos = TEXTO_ATESTADO[tipo]
  const texto = singular ? textos.singular(documento, animais[0]) : textos.plural(documento)
  writer.paragraph([{ text: texto }])

  // Descrição do documento (descricaoNivel:'documento') — uma linha solta,
  // sem heading, logo após o texto. Único lugar que sabe desenhar
  // `documento.descricao`; camposDoc abaixo nunca inclui esse campo (é
  // tratado à parte, controlado só por descricaoPorAnimal).
  const mostraDescricaoAnimal = descricaoPorAnimal(tipo)
  if (!mostraDescricaoAnimal && documento.descricao) {
    writer.espaco(2)
    writer.linha('Descrição dos animais', documento.descricao)
  }

  const camposDoc = CAMPOS_DOCUMENTO_POR_TIPO[tipo] || []
  if (camposDoc.length > 0) {
    writer.espaco(2)
    // Heading só com 2+ campos — 1 campo só já é legível sozinho, um
    // título em cima ficaria pesado.
    if (camposDoc.length > 1) writer.heading(meta.labelCamposDocumento || 'Dados do documento', 2)
    camposDoc.forEach(c => writer.linha(c.label, formatarValorCampo(c, documento[c.chave])))
  }

  const mostrarTabela = !singular || SEMPRE_TABELA.has(tipo)
  if (mostrarTabela) {
    writer.espaco(3)
    const camposAnimal = CAMPOS_ANIMAL_POR_TIPO[tipo] || []
    const headers = [{ label: 'Brinco' }]
    if (mostraDescricaoAnimal) headers.push({ label: 'Descrição' })
    headers.push(...camposAnimal.map(c => ({ label: c.label, align: c.tipo === 'number' ? 'right' : undefined })))
    writer.table(
      headers,
      animais.map(a => {
        const row = [a.brinco || '—']
        if (mostraDescricaoAnimal) row.push(a.descricao_animal || '—')
        row.push(...camposAnimal.map(c => formatarValorCampo(c, a[c.chave])))
        return row
      }),
    )
  }

  writer.assinatura(documento.veterinario_nome, documento.veterinario_crv)
  writer.finalize(rodapeContato(veterinario?.telefone, veterinario?.email))
  writer.save(filename)
}
