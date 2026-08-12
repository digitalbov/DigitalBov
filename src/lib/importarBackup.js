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
// pai_animal_id (auto-referência, migration_touro_vinculo_id.sql): mesmo
// princípio de lancamento_origem_id (auto-referência de lancamentos_
// financeiros) — o mapa de ids é gerado ANTES de qualquer insert
// (gerarMapaIds), então remapear funciona; mas o INSERT em si só é seguro
// se o "pai" (linha referenciada) já existir na tabela quando o "filho" for
// inserido. Só um touro cadastrado (is_touro=true) pode ser pai_animal_id
// — nunca outro bezerro — então basta os touros entrarem SEMPRE primeiro no
// insert de animais (ver ordenação em linhasOriginaisParaTabela, abaixo) pra
// nunca haver ordem errada, sem precisar de um segundo passe de UPDATE.
const FKS_POR_TABELA = {
  animais:                  { proprietario_id: 'proprietarios', lote_id: 'lotes', pai_animal_id: 'animais', pai_externo_id: 'touros_externos' },
  lotes_inseminacao:        { ciclo_id: 'ciclos_financeiros', estacao_monta_id: 'estacoes_monta', touro_animal_id: 'animais', touro_externo_id: 'touros_externos' },
  lote_touros:              { lote_id: 'lotes_inseminacao', touro_animal_id: 'animais', touro_externo_id: 'touros_externos' },
  inseminacoes:             { lote_inseminacao_id: 'lotes_inseminacao', animal_id: 'animais' },
  partos:                   { lote_inseminacao_id: 'lotes_inseminacao', mae_id: 'animais', bezerro_id: 'animais', ciclo_id: 'ciclos_financeiros' },
  abortos:                  { animal_id: 'animais', lote_inseminacao_id: 'lotes_inseminacao', ciclo_id: 'ciclos_financeiros' },
  estacoes_monta:           { ciclo_id: 'ciclos_financeiros' },
  lancamentos_financeiros:  { ciclo_id: 'ciclos_financeiros', lancamento_origem_id: 'lancamentos_financeiros' },
  lancamento_rateios:       { lancamento_id: 'lancamentos_financeiros', proprietario_id: 'proprietarios' },
  transacoes_animais:       { lancamento_id: 'lancamentos_financeiros', ciclo_id: 'ciclos_financeiros' },
  transacao_animais_itens:  { transacao_id: 'transacoes_animais', animal_id: 'animais' },
  pesagens:                 { animal_id: 'animais', transacao_id: 'transacoes_animais' },
  // gerado_de_id (auto-referência, migration_sanidade_agendamento_cancelado_
  // d15.sql): agendamento gerado pela "próxima aplicação" de outro
  // procedimento — mesmo princípio de pai_animal_id acima, mas aqui a cadeia
  // pode ter profundidade arbitrária (concluir → gera outro → concluir →
  // gera outro...), então ordenar por uma flag booleana não basta. Resolvido
  // ordenando por criado_em ANTES do insert em chunks (ver linhasOriginais
  // abaixo): o "pai" sempre existe cronologicamente antes do "filho" que ele
  // gerou, então essa ordem garante o pai já inserido pra qualquer
  // profundidade, sem precisar de múltiplos passes.
  procedimentos_sanitarios: { gerado_de_id: 'procedimentos_sanitarios' },
  sanidade_animais:         { procedimento_id: 'procedimentos_sanitarios', animal_id: 'animais' },
  estoque_movimentacoes:    { item_id: 'estoque_itens', procedimento_id: 'procedimentos_sanitarios' },
  planejamento_acoes:       { planejamento_id: 'planejamentos' },
  feira_edicoes:            { feira_id: 'feiras' },
  feira_participacoes:      { edicao_id: 'feira_edicoes', animal_id: 'animais' },
}

// Ordem de FK, camada a camada (ver diagnóstico) — "fazendas" fica de fora
// daqui de propósito: não é um insert genérico, é a chamada de
// criar_fazenda() tratada à parte em importarBackup(). lancamentos_financeiros
// também é especial (auto-referência lancamento_origem_id) — tratado em
// inserirLancamentos(), não pelo caminho genérico.
const ORDEM_GENERICA = [
  'proprietarios', 'piquetes', 'lotes', 'ciclos_financeiros', 'categorias_preco', 'estacoes_monta',
  'touros_externos',
  'feiras',
  'feira_edicoes',
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
  'feira_participacoes',
  'estoque_itens', 'estoque_movimentacoes',
  'metas', 'planejamentos', 'planejamento_acoes', 'simulacoes_transacoes',
]

// Ponto exato de inserção do bloco especial de lancamentos_financeiros —
// logo depois de "abortos", antes de "lancamento_rateios" (que depende dele).
const INDICE_LANCAMENTOS = ORDEM_GENERICA.indexOf('lancamento_rateios')

function novoId() {
  return crypto.randomUUID()
}

// Todas as tabelas que passam pelo caminho genérico de insert (ORDEM_GENERICA
// + lancamentos_financeiros, tratada à parte) — usada só para pedir de uma vez
// as colunas reais de cada uma via RPC, nunca duplicada como lista de colunas.
const TODAS_TABELAS_IMPORTACAO = [...ORDEM_GENERICA, 'lancamentos_financeiros']

// Colunas REAIS de cada tabela, direto do information_schema via RPC
// colunas_tabelas_publicas (ver docs/migrations-aplicadas/colunas_tabela_publica*.sql)
// — nunca uma lista mantida à mão no código: se o schema mudar (coluna
// removida, ex: futuro DROP de lotes_inseminacao.encerrado), o resultado
// reflete isso automaticamente, sem precisar lembrar de atualizar nada aqui.
// Uma única chamada para todas as tabelas da importação, não uma por tabela.
// Se a RPC falhar (função ainda não aplicada no banco, rede, etc.), devolve
// null — o chamador interpreta null como "sem filtro disponível" e segue com
// o comportamento antigo (sem filtrar), só avisando no console.
async function buscarColunasValidas(tabelas) {
  const { data, error } = await supabase.rpc('colunas_tabelas_publicas', { p_tabelas: tabelas })
  if (error) {
    console.warn('[importarBackup] não foi possível confirmar as colunas reais das tabelas (RPC colunas_tabelas_publicas) — seguindo SEM filtro de colunas obsoletas. Se o schema já mudou desde que algum backup foi gerado, o insert pode falhar numa coluna removida:', error.message)
    return null
  }
  const mapa = {}
  for (const { tabela, coluna } of data || []) {
    if (!mapa[tabela]) mapa[tabela] = new Set()
    mapa[tabela].add(coluna)
  }
  return mapa
}

// Remove de `resto` qualquer chave que não seja mais uma coluna real da
// tabela — registra cada coluna descartada (uma vez por tabela, não uma vez
// por linha) tanto no console quanto em `descartes`, para o relatório final
// não esconder que algum dado do arquivo deixou de entrar.
function filtrarColunasValidas(tabela, resto, colunasValidas, descartes) {
  if (!colunasValidas || !colunasValidas[tabela]) return resto // sem lista — não filtra (RPC indisponível)
  const validas = colunasValidas[tabela]
  const filtrado = {}
  for (const [chave, valor] of Object.entries(resto)) {
    if (validas.has(chave)) {
      filtrado[chave] = valor
    } else if (!descartes[tabela]?.has(chave)) {
      if (!descartes[tabela]) descartes[tabela] = new Set()
      descartes[tabela].add(chave)
      console.warn(`[importarBackup] tabela "${tabela}": coluna "${chave}" existe no arquivo de backup mas não existe mais nessa tabela no banco — valor descartado nesta e em qualquer outra linha da mesma tabela.`)
    }
  }
  return filtrado
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

function remapearLinha(tabela, row, mapa, contaId, fazendaId, colunasValidas, descartes) {
  const { id, conta_id, fazenda_id, criado_em, atualizado_em, ...resto } = row
  const fks = FKS_POR_TABELA[tabela] || {}
  for (const [campo, tabelaAlvo] of Object.entries(fks)) {
    const valorAntigo = row[campo]
    resto[campo] = (valorAntigo === null || valorAntigo === undefined)
      ? null
      : (mapa[`${tabelaAlvo}:${valorAntigo}`] ?? null)
  }
  const restoFiltrado = filtrarColunasValidas(tabela, resto, colunasValidas, descartes)
  return { ...restoFiltrado, id: mapa[`${tabela}:${row.id}`], conta_id: contaId, fazenda_id: fazendaId }
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

async function inserirLancamentos(linhasOriginais, mapa, contaId, fazendaId, onChunk, colunasValidas, descartes) {
  const remapeadas = linhasOriginais.map(row => remapearLinha('lancamentos_financeiros', row, mapa, contaId, fazendaId, colunasValidas, descartes))
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

  // Colunas reais de cada tabela (ver buscarColunasValidas) — pedidas uma vez
  // só, antes do laço, pra filtrar toda linha antes do insert. `descartes`
  // acumula, por tabela, quais colunas do arquivo foram descartadas por não
  // existirem mais no banco — vira relatorio.colunasDescartadas no final.
  const colunasValidas = await buscarColunasValidas(TODAS_TABELAS_IMPORTACAO)
  relatorio.filtroColunasIndisponivel = colunasValidas === null
  const descartes = {}

  // Sequência final: ORDEM_GENERICA com o bloco especial de
  // lancamentos_financeiros injetado na posição certa.
  const sequencia = [
    ...ORDEM_GENERICA.slice(0, INDICE_LANCAMENTOS),
    '__lancamentos__',
    ...ORDEM_GENERICA.slice(INDICE_LANCAMENTOS),
  ]

  for (const passo of sequencia) {
    const tabela = passo === '__lancamentos__' ? 'lancamentos_financeiros' : passo
    // animais: touros (is_touro=true) sempre primeiro — são os únicos que
    // podem ser referenciados por pai_animal_id (auto-referência), então
    // isso garante que o "pai" já existe na tabela quando o "filho" for
    // inserido, sem precisar de um segundo passe de UPDATE (ver comentário
    // em FKS_POR_TABELA).
    // procedimentos_sanitarios: criado_em ascendente — mesmo raciocínio do
    // sort de animais acima, mas por data em vez de flag, porque a cadeia de
    // gerado_de_id pode ter profundidade arbitrária (ver FKS_POR_TABELA).
    const linhasOriginais = tabela === 'animais'
      ? [...(dados[tabela] || [])].sort((a, b) => (b.is_touro ? 1 : 0) - (a.is_touro ? 1 : 0))
      : tabela === 'procedimentos_sanitarios'
      ? [...(dados[tabela] || [])].sort((a, b) => (a.criado_em || '').localeCompare(b.criado_em || ''))
      : (dados[tabela] || [])
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
        ? await inserirLancamentos(linhasOriginais, mapa, contaId, fazendaId, onChunk, colunasValidas, descartes)
        : await inserirEmChunks(tabela, linhasOriginais.map(row => remapearLinha(tabela, row, mapa, contaId, fazendaId, colunasValidas, descartes)), onChunk)
    } catch (e) {
      resultado = { ok: 0, error: e }
    }

    relatorio.camadas.push({ tabela, esperado, importado: resultado.ok, ok: !resultado.error })

    if (resultado.error) {
      relatorio.erro = `Parou na tabela "${tabela}": ${resultado.error.message || String(resultado.error)}`
      relatorio.colunasDescartadas = Object.entries(descartes).map(([tabela, cols]) => ({ tabela, colunas: [...cols] }))
      report({ tabela, status: 'erro', esperado, importado: resultado.ok, detalhe: relatorio.erro })
      return relatorio
    }
    report({ tabela, status: 'ok', esperado, importado: resultado.ok })
  }

  relatorio.colunasDescartadas = Object.entries(descartes).map(([tabela, cols]) => ({ tabela, colunas: [...cols] }))
  relatorio.sucesso = true
  return relatorio
}
