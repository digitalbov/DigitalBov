import { supabase } from './supabase'

// ── Fase 1 da restauração: IMPORTAÇÃO PARA FAZENDA NOVA ─────────────────────
// Regras inegociáveis (ver diagnóstico/plano acordado):
// - Nunca sobrescreve nem apaga nada existente — só INSERT, sempre numa
//   fazenda nova criada agora, na conta ATUAL do usuário (nunca a do arquivo).
// - IDs do arquivo são descartados: todo id é gerado de novo aqui, e toda
//   referência interna é remapeada via um mapa {tabela:idAntigo -> idNovo}.
// - conta_id/fazenda_id de toda linha viram os do DESTINO, nunca os do
//   arquivo — nunca copiados de payload.dados.
// - criado_em/atualizado_em nunca são copiados do arquivo — ficam de fora do
//   insert e o banco preenche sozinho (DEFAULT now()), mesmo princípio já
//   documentado em hoje.js pra esses dois campos.
// - Se uma tabela falhar, PARA — não tenta desfazer o que já entrou (a
//   trigger de reversão de venda dispararia com efeito colateral real em
//   cima de dado que acabou de ser inserido pela própria importação).

const CHUNK = 500

// [campo FK] -> tabela alvo dentro do PRÓPRIO arquivo (mesmo mapa usado na
// checagem de órfãs da Fase 0 — ver RestaurarBackup.jsx REFERENCIAS).
// ciclo_id em abortos/partos/transacoes_animais/estacoes_monta: achado tarde
// (confirmado no schema real, não em arquivo do repo — ver queries com
// .eq('ciclo_id',...) nessas 4 tabelas em supabase.js) — as 4 têm coluna
// ciclo_id própria, além das outras FKs já mapeadas.
const FKS_POR_TABELA = {
  animais:                  { proprietario_id: 'proprietarios', lote_id: 'lotes' },
  lotes_inseminacao:        { ciclo_id: 'ciclos_financeiros', estacao_monta_id: 'estacoes_monta' },
  lote_touros:              { lote_id: 'lotes_inseminacao' },
  inseminacoes:             { lote_inseminacao_id: 'lotes_inseminacao', animal_id: 'animais' },
  partos:                   { lote_inseminacao_id: 'lotes_inseminacao', mae_id: 'animais', bezerro_id: 'animais', ciclo_id: 'ciclos_financeiros' },
  abortos:                  { animal_id: 'animais', lote_inseminacao_id: 'lotes_inseminacao', ciclo_id: 'ciclos_financeiros' },
  estacoes_monta:           { ciclo_id: 'ciclos_financeiros' },
  lancamentos_financeiros:  { ciclo_id: 'ciclos_financeiros', lancamento_origem_id: 'lancamentos_financeiros' },
  lancamento_rateios:       { lancamento_id: 'lancamentos_financeiros', proprietario_id: 'proprietarios' },
  transacoes_animais:       { lancamento_id: 'lancamentos_financeiros', ciclo_id: 'ciclos_financeiros' },
  transacao_animais_itens:  { transacao_id: 'transacoes_animais', animal_id: 'animais' },
  pesagens:                 { animal_id: 'animais', transacao_id: 'transacoes_animais' },
  sanidade_animais:         { procedimento_id: 'procedimentos_sanitarios', animal_id: 'animais' },
  estoque_movimentacoes:    { item_id: 'estoque_itens', procedimento_id: 'procedimentos_sanitarios' },
  planejamento_acoes:       { planejamento_id: 'planejamentos' },
}

// Ordem de FK, camada a camada (ver diagnóstico) — "fazendas" fica de fora
// daqui de propósito: não é um insert genérico, é a chamada de
// criar_fazenda() tratada à parte em importarBackup(). lancamentos_financeiros
// também é especial (auto-referência lancamento_origem_id) — tratado em
// inserirLancamentos(), não pelo caminho genérico.
const ORDEM_GENERICA = [
  'proprietarios', 'piquetes', 'lotes', 'ciclos_financeiros', 'categorias_preco', 'estacoes_monta',
  'animais',
  'lotes_inseminacao',
  'lote_touros', 'inseminacoes',
  'partos',
  'abortos',
  // lancamentos_financeiros entra aqui na sequência real (ver LISTA_COMPLETA)
  'lancamento_rateios',
  'transacoes_animais', 'transacao_animais_itens',
  'pesagens',
  'procedimentos_sanitarios', 'sanidade_animais',
  'estoque_itens', 'estoque_movimentacoes',
  'metas', 'planejamentos', 'planejamento_acoes', 'simulacoes_transacoes',
]

// Ponto exato de inserção do bloco especial de lancamentos_financeiros —
// logo depois de "abortos", antes de "lancamento_rateios" (que depende dele).
const INDICE_LANCAMENTOS = ORDEM_GENERICA.indexOf('lancamento_rateios')

function novoId() {
  return crypto.randomUUID()
}

// Gera de uma vez, ANTES de qualquer insert, o id novo de TODA linha de TODA
// tabela — inclusive a auto-referência de lancamentos_financeiros já sai
// resolvida sem precisar de round-trip nenhum: o novo id do "pai" já existe
// no mapa no momento de montar a linha do "filho".
function gerarMapaIds(dados) {
  const mapa = {}
  for (const tabela of Object.keys(dados)) {
    for (const row of dados[tabela] || []) {
      if (row?.id) mapa[`${tabela}:${row.id}`] = novoId()
    }
  }
  return mapa
}

function remapearLinha(tabela, row, mapa, contaId, fazendaId) {
  const { id, conta_id, fazenda_id, criado_em, atualizado_em, ...resto } = row
  const fks = FKS_POR_TABELA[tabela] || {}
  for (const [campo, tabelaAlvo] of Object.entries(fks)) {
    const valorAntigo = row[campo]
    resto[campo] = (valorAntigo === null || valorAntigo === undefined)
      ? null
      : (mapa[`${tabelaAlvo}:${valorAntigo}`] ?? null)
  }
  return { ...resto, id: mapa[`${tabela}:${row.id}`], conta_id: contaId, fazenda_id: fazendaId }
}

async function inserirEmChunks(tabela, linhas, onChunk) {
  let ok = 0
  for (let i = 0; i < linhas.length; i += CHUNK) {
    const parte = linhas.slice(i, i + CHUNK)
    const { error } = await supabase.from(tabela).insert(parte)
    if (error) return { ok, error, falhouNaLinha: i }
    ok += parte.length
    onChunk?.(ok, linhas.length)
  }
  return { ok, error: null }
}

async function inserirLancamentos(linhasOriginais, mapa, contaId, fazendaId, onChunk) {
  const remapeadas = linhasOriginais.map(row => remapearLinha('lancamentos_financeiros', row, mapa, contaId, fazendaId))
  // Pai antes do filho: lançamentos sem origem primeiro, os que dependem de
  // outro (comissão/imposto/frete, via lancamento_origem_id) depois — senão o
  // banco recusa o filho por apontar pra um id que ainda não existe na tabela.
  const semOrigem = remapeadas.filter(r => !r.lancamento_origem_id)
  const comOrigem = remapeadas.filter(r => r.lancamento_origem_id)
  const passe1 = await inserirEmChunks('lancamentos_financeiros', semOrigem, (imp, tot) => onChunk(imp, semOrigem.length + comOrigem.length))
  if (passe1.error) return passe1
  const passe2 = await inserirEmChunks('lancamentos_financeiros', comOrigem, (imp, tot) => onChunk(passe1.ok + imp, semOrigem.length + comOrigem.length))
  return { ok: passe1.ok + passe2.ok, error: passe2.error, falhouNaLinha: passe2.falhouNaLinha }
}

// onProgress({ tabela, status: 'rodando'|'ok'|'erro', esperado, importado, detalhe }) a cada avanço.
export async function importarBackup(payload, { contaId, nomeFazenda }, onProgress) {
  const dados = payload.dados
  const relatorio = { camadas: [], fazendaCriada: null, sucesso: false, erro: null }
  const report = (ev) => onProgress?.(ev)

  report({ tabela: '__fazenda__', status: 'rodando' })
  let fazendaNova, errFazenda
  try {
    const r = await supabase.rpc('criar_fazenda', {
      p_conta_id: contaId,
      p_nome: nomeFazenda,
      p_localizacao: payload.fazenda?.localizacao || null,
    })
    fazendaNova = r.data
    errFazenda = r.error
  } catch (e) {
    errFazenda = e
  }
  if (errFazenda || !fazendaNova?.id) {
    relatorio.erro = `Não foi possível criar a fazenda: ${errFazenda?.message || 'sem retorno da RPC criar_fazenda'}`
    report({ tabela: '__fazenda__', status: 'erro', detalhe: relatorio.erro })
    return relatorio
  }
  const fazendaId = fazendaNova.id
  relatorio.fazendaCriada = { id: fazendaId, nome: nomeFazenda }
  report({ tabela: '__fazenda__', status: 'ok' })

  // trg_fazenda_seed (AFTER INSERT em fazendas, confirmado no banco — não
  // veio de arquivo do repo) já povoa categorias_preco, ciclos_financeiros e
  // metas da fazenda nova com valores padrão. Isso colide com o que o backup
  // vai inserir logo mais nessas 3 tabelas (mesmo nome de categoria, mesmo
  // período de ciclo, mesmo indicador de meta — provável violação de UNIQUE
  // se não limpar antes). Apaga o seed ANTES de qualquer outro insert — nada
  // mais na fazenda nova pode estar referenciando essas linhas ainda, porque
  // esta é a primeiríssima coisa que roda depois da fazenda ser criada.
  report({ tabela: '__seed__', status: 'rodando' })
  for (const tabelaSeed of ['categorias_preco', 'ciclos_financeiros', 'metas']) {
    const { error: errSeed } = await supabase.from(tabelaSeed).delete().eq('fazenda_id', fazendaId).eq('conta_id', contaId)
    if (errSeed) {
      relatorio.erro = `Não foi possível limpar os dados padrão (${tabelaSeed}) da fazenda nova: ${errSeed.message}`
      report({ tabela: '__seed__', status: 'erro', detalhe: relatorio.erro })
      return relatorio
    }
  }
  report({ tabela: '__seed__', status: 'ok' })

  const mapa = gerarMapaIds(dados)

  // Sequência final: ORDEM_GENERICA com o bloco especial de
  // lancamentos_financeiros injetado na posição certa.
  const sequencia = [
    ...ORDEM_GENERICA.slice(0, INDICE_LANCAMENTOS),
    '__lancamentos__',
    ...ORDEM_GENERICA.slice(INDICE_LANCAMENTOS),
  ]

  for (const passo of sequencia) {
    const tabela = passo === '__lancamentos__' ? 'lancamentos_financeiros' : passo
    const linhasOriginais = dados[tabela] || []
    const esperado = linhasOriginais.length
    report({ tabela, status: 'rodando', esperado, importado: 0 })

    if (esperado === 0) {
      relatorio.camadas.push({ tabela, esperado: 0, importado: 0, ok: true })
      report({ tabela, status: 'ok', esperado: 0, importado: 0 })
      continue
    }

    const onChunk = (importado, total) => report({ tabela, status: 'rodando', esperado: total, importado })

    let resultado
    try {
      resultado = passo === '__lancamentos__'
        ? await inserirLancamentos(linhasOriginais, mapa, contaId, fazendaId, onChunk)
        : await inserirEmChunks(tabela, linhasOriginais.map(row => remapearLinha(tabela, row, mapa, contaId, fazendaId)), onChunk)
    } catch (e) {
      resultado = { ok: 0, error: e }
    }

    relatorio.camadas.push({ tabela, esperado, importado: resultado.ok, ok: !resultado.error })

    if (resultado.error) {
      relatorio.erro = `Parou na tabela "${tabela}": ${resultado.error.message || String(resultado.error)}`
      report({ tabela, status: 'erro', esperado, importado: resultado.ok, detalhe: relatorio.erro })
      return relatorio
    }
    report({ tabela, status: 'ok', esperado, importado: resultado.ok })
  }

  relatorio.sucesso = true
  return relatorio
}
