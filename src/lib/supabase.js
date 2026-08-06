import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️  Configure as variáveis de ambiente do Supabase no arquivo .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
})

// ── Fazenda atual (definido pelo FazendaContext) ───────────────────
let _fid = null
export const setCurrentFazendaId = (id) => { _fid = id }
const fid = () => _fid

// ── Conta atual ───────────────────────────────────────────────────
let _cid = null
export const setCurrentContaId = (id) => { _cid = id }
const cid = () => _cid

// Porteiro central: injeta conta_id/fazenda_id automaticamente
const T = (tabela, opts = {}) => {
  const semFazenda = opts.semFazenda === true
  return {
    select: (cols = '*') => {
      let q = supabase.from(tabela).select(cols)
      if (cid()) q = q.eq('conta_id', cid())
      if (!semFazenda && fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    selectRaw: (cols = '*', selectOpts) => {
      let q = supabase.from(tabela).select(cols, selectOpts)
      if (cid()) q = q.eq('conta_id', cid())
      if (!semFazenda && fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insertOne: (data) => {
      const base = { ...data, conta_id: data.conta_id ?? cid() }
      if (!semFazenda) base.fazenda_id = data.fazenda_id ?? fid()
      return supabase.from(tabela).insert(base)
    },
    raw: () => supabase.from(tabela)
  }
}

// Reforço de escopo em operações por id (camada extra além do RLS)
const escopo = (q, opts = {}) => {
  if (cid()) q = q.eq('conta_id', cid())
  if (opts.semFazenda !== true && fid()) q = q.eq('fazenda_id', fid())
  return q
}

// ── Auth helpers ──────────────────────────────────────────────────
export const auth = {
  signIn:            (email, pw) => supabase.auth.signInWithPassword({ email, password: pw }),
  signOut:           ()          => supabase.auth.signOut(),
  getSession:        ()          => supabase.auth.getSession(),
  onAuthStateChange: (cb)        => supabase.auth.onAuthStateChange(cb),
  getUser:           ()          => supabase.auth.getUser()
}

// ── Database helpers ──────────────────────────────────────────────
export const db = {

  animais: {
    list: (filters = {}) => {
      let q = T('animais').select(`*, proprietario:proprietarios(id,nome), lote:lotes(id,nome)`).order('brinco')
      if (filters.situacao)        q = q.eq('situacao',        filters.situacao)
      if (filters.proprietario_id) q = q.eq('proprietario_id', filters.proprietario_id)
      if (filters.sexo)            q = q.eq('sexo',            filters.sexo)
      return q
    },
    get:      (id)    => escopo(T('animais').raw().select('*, proprietario:proprietarios(nome), lote:lotes(nome)').eq('id', id)).single(),
    insert:   (data)  => T('animais').insertOne(data).select().single(),
    update:   (id, d) => escopo(T('animais').raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id)).select().single(),
    delete:   (id)    => escopo(T('animais').raw().delete().eq('id', id)),
    byBrinco: (b)     => T('animais').select('*, proprietario:proprietarios(id,nome), lote:lotes(id,nome)').eq('brinco', b).maybeSingle(),
    brincosComPrefixo: (prefixo) => T('animais').select('brinco').ilike('brinco', `${prefixo}%`),
    filhos:   (b)     => T('animais').select('*, proprietario:proprietarios(id,nome), lote:lotes(id,nome)').eq('mae_brinco', b).order('brinco'),
  },

  proprietarios: {
    list:    ()       => T('proprietarios').select('*').eq('ativo', true).order('nome'),
    listAll: ()       => T('proprietarios').select('*').order('nome'),
    insert:  (data)   => T('proprietarios').insertOne(data).select().single(),
    update:  (id, d)  => escopo(T('proprietarios').raw().update(d).eq('id', id)).select().single(),
    delete:  (id)     => escopo(T('proprietarios').raw().delete().eq('id', id)),
    hasData: (id)     => T('animais').selectRaw('id', { count: 'exact', head: true }).eq('proprietario_id', id),
  },

  fazendas: {
    list:         ()        => T('fazendas', { semFazenda: true }).select('*').eq('ativo', true).order('nome'),
    listInativas: ()        => T('fazendas', { semFazenda: true }).select('*').eq('ativo', false).order('nome'),
    get:          (id)      => escopo(T('fazendas', { semFazenda: true }).raw().select('*').eq('id', id), { semFazenda: true }).single(),
    insert:       (data)    => T('fazendas', { semFazenda: true }).insertOne(data).select().single(),
    update:       (id, d)   => escopo(T('fazendas', { semFazenda: true }).raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id), { semFazenda: true }).select().single(),
    deactivate:   (id)      => escopo(T('fazendas', { semFazenda: true }).raw().update({ ativo: false }).eq('id', id), { semFazenda: true }),
    reactivate:   (id)      => escopo(T('fazendas', { semFazenda: true }).raw().update({ ativo: true }).eq('id', id), { semFazenda: true }),
    hardDelete:   (id)      => supabase.rpc('excluir_fazenda', { p_fazenda_id: id }),
  },

  lotes: {
    list:   ()       => T('lotes').select('*').eq('ativo', true).order('nome'),
    insert: (data)   => T('lotes').insertOne(data).select().single(),
    update: (id, d)  => escopo(T('lotes').raw().update(d).eq('id', id)).select().single(),
    delete: (id)     => escopo(T('lotes').raw().delete().eq('id', id)),
  },

  piquetes: {
    list:   ()       => T('piquetes').select('*, fazenda:fazendas(nome)').order('nome'),
    insert: (data)   => T('piquetes').insertOne(data).select().single(),
    update: (id, d)  => escopo(T('piquetes').raw().update(d).eq('id', id)).select().single(),
    delete: (id)     => escopo(T('piquetes').raw().delete().eq('id', id)),
  },

  lotesInseminacao: {
    // lote_touros: touros ADICIONAIS de um lote de monta natural com mais de um
    // touro (o 1º touro continua em lotes_inseminacao.touro, sem mudança — ver
    // resolverPaiDerivado em helpers.js). Vazio/ausente para IA e monta natural
    // de 1 touro só, que continuam usando só o campo touro de sempre.
    list: (cicloId) => T('lotes_inseminacao').select(`
      *, inseminacoes(*, animal:animais(brinco,proprietario_id,sit_reprodutiva,proprietario:proprietarios(nome))),
      partos(id,bezerro_id,mae_id,data_parto,natimorto,mae:animais!mae_id(brinco,proprietario_id),bezerro:animais!bezerro_id(id,brinco,sexo,pai,situacao,data_desmame,pesagens(id,data,tipo,peso_kg))),
      abortos(id,animal_id,data,causa,observacoes,animal:animais(proprietario_id)),
      estacao:estacoes_monta(id,nome,inicio,fim),
      lote_touros(id,nome)
    `).eq('ciclo_id', cicloId).order('data', { ascending: false }),
    listAll: () => T('lotes_inseminacao').select(`
      *, ciclo:ciclos_financeiros(id,nome,inicio,fim),
      inseminacoes(*, animal:animais(brinco,proprietario_id,proprietario:proprietarios(nome))),
      partos(id,bezerro_id,mae_id,data_parto,natimorto,mae:animais!mae_id(proprietario_id),bezerro:animais!bezerro_id(situacao,data_desmame,pesagens(data,tipo,peso_kg))),
      abortos(id,animal_id,data,causa,animal:animais(proprietario_id)),
      estacao:estacoes_monta(id,nome,inicio,fim),
      lote_touros(id,nome)
    `).order('data', { ascending: true }),
    insert: (data)  => T('lotes_inseminacao').insertOne(data).select().single(),
    update: (id, d) => escopo(T('lotes_inseminacao').raw().update(d).eq('id', id)).select().single(),
    delete: (id)    => escopo(T('lotes_inseminacao').raw().delete().eq('id', id)),
    // Versão leve: dados básicos do lote + inseminações (com brinco do animal) —
    // usada em telas que não precisam do funil completo do Reprodutivo, sem os
    // embeds pesados de pesagens/estação (Dashboard, Rebanho, Metas, Calendario,
    // Relatorios, contextoIA). partos(mae_id)/abortos(animal_id) só trazem o id
    // do animal (não o funil inteiro) — usados pelo Calendario pra não sugerir
    // "previsão de parto" de uma vaca que já pariu ou abortou nesse lote. Sem
    // cicloId, traz de todos os ciclos.
    listInseminacoesResumo: (cicloId) => {
      let q = T('lotes_inseminacao').select(`
        ciclo_id, numero, touro, data,
        inseminacoes(animal_id, diagnostico, animal:animais(brinco,proprietario_id)),
        partos(mae_id, bezerro_id), abortos(animal_id)
      `)
      if (cicloId) q = q.eq('ciclo_id', cicloId)
      return q.order('data', { ascending: false })
    },
    // Item 5 (Financeiro.jsx — Situação reprodutiva na venda): só o
    // necessário pra atribuir cada diagnóstico/parto/aborto ao lote (e, por
    // ele, à estação) em que aconteceu, e pra classificar o desfecho
    // (desfechoReprodutivo, helpers.js) — sem embed de bezerro/pesagens (não
    // usado por este filtro — "com cria ao pé" usa todosPartos, sem escopo de
    // estação, ver db.partos.listAll). `data` do lote é a data da MONTA (não
    // a do diagnóstico), usada pra calcular o prazo de perda gestacional
    // presumida E pra achar a tentativa mais recente da guarda 'em_repasse'
    // (desfechoReprodutivo NÃO usa mais `encerrado` — nenhum caminho do app
    // grava essa coluna como true, então era um critério inerte na prática;
    // ver comentário lá). `partos(mae_id,data_parto)` — data_parto também é
    // lida por desfechoReprodutivo (resultado 'pariu'). Histórico completo,
    // sem escopo de ciclo: a última estação de monta pode ser de qualquer
    // ciclo. Só lotes COM estação (estacao_monta_id) — lote sem estação nunca
    // pode ser "a última estação".
    listParaDescarte: () => T('lotes_inseminacao')
      .select('id, data, estacao_monta_id, inseminacoes(animal_id,diagnostico,data_diagnostico), partos(mae_id,data_parto), abortos(animal_id,data)')
      .not('estacao_monta_id', 'is', null),
  },

  loteTouros: {
    // Touros ADICIONAIS de um lote de monta natural (2º em diante) — o 1º touro
    // fica em lotes_inseminacao.touro (ver comentário acima). ON DELETE CASCADE
    // na FK cuida da limpeza sozinho quando o lote é excluído.
    listPorLote: (loteId) => T('lote_touros').select('*').eq('lote_id', loteId).order('criado_em'),
    insert:      (data)   => T('lote_touros').insertOne(data).select().single(),
    delete:      (id)     => escopo(T('lote_touros').raw().delete().eq('id', id)),
  },

  estacoesMonta: {
    list:    (cicloId) => T('estacoes_monta').select('*').eq('ciclo_id', cicloId).order('inicio', { ascending: false }),
    listAll: ()         => T('estacoes_monta').select('*, ciclo:ciclos_financeiros(id,nome)').order('inicio', { ascending: false }),
    insert:  (data)     => T('estacoes_monta').insertOne(data).select().single(),
    update:  (id, d)    => escopo(T('estacoes_monta').raw().update(d).eq('id', id)).select().single(),
    delete:  (id)       => escopo(T('estacoes_monta').raw().delete().eq('id', id)),
  },

  abortos: {
    list:     (cicloId)   => T('abortos').select('*, animal:animais(brinco), lote:lotes_inseminacao(numero,touro)').eq('ciclo_id', cicloId).order('data', { ascending: false }),
    // lote.estacao_monta_id: usado por Animais.jsx (ficha) pra saber a que
    // ESTAÇÃO este aborto pertence — a "Falhada"/desfecho consolidado (ver
    // desfechoReprodutivo, helpers.js) é por estação, não por lote.
    byAnimal: (animalId)  => T('abortos').select('*, lote:lotes_inseminacao(numero,touro,estacao_monta_id)').eq('animal_id', animalId).order('data', { ascending: false }),
    insert:   (data)      => T('abortos').insertOne(data).select().single(),
    update:   (id, d)     => escopo(T('abortos').raw().update(d).eq('id', id)).select().single(),
    delete:   (id)        => escopo(T('abortos').raw().delete().eq('id', id)),
  },

  inseminacoes: {
    insert:       (data)      => T('inseminacoes').insertOne(data),
    update:       (id, d)     => escopo(T('inseminacoes').raw().update(d).eq('id', id)),
    upsert:       (data)      => T('inseminacoes').raw().upsert(
      { ...data, conta_id: cid(), fazenda_id: fid() },
      { onConflict: 'lote_inseminacao_id,animal_id', ignoreDuplicates: false }
    ).select(),
    delete:       (id)        => escopo(T('inseminacoes').raw().delete().eq('id', id)),
    deleteVarios: (ids)       => escopo(T('inseminacoes').raw().delete().in('id', ids)),
    // lote.estacao_monta_id: mesmo motivo do abortos.byAnimal acima.
    byAnimal:     (animalId)  => T('inseminacoes').select('*, lote:lotes_inseminacao(numero,touro,data,estacao_monta_id)').eq('animal_id', animalId).order('criado_em', { ascending: true }),
  },

  partos: {
    list:      (cicloId)    => T('partos').select('*, mae:animais!mae_id(brinco,proprietario_id,proprietario:proprietarios(id,nome)), bezerro:animais!bezerro_id(brinco,sexo)').eq('ciclo_id', cicloId).order('data_parto', { ascending: false }),
    // bezerro.data_desmame: usado por statusReprodutivoExibicao (helpers.js) pra
    // saber se o último parto da vaca já foi desmamado ("Com cria ao pé" na tela).
    // natimorto/bezerro.situacao: mesma função usa pra NÃO mostrar "Com cria ao pé"
    // quando o bezerro nasceu morto (Fase 10 — etapa B; sem isso, um natimorto
    // nunca tem data_desmame preenchida e cairia como "Com cria ao pé" pra sempre).
    // bezerro_id: usado pelo cohort de GMD Terneiros (Metas.jsx/Rebanho.jsx) pra
    // ancorar na safra da monta (via lote_inseminacao_id) em vez do nascimento.
    // lote:tipo — usado por Metas.jsx pra separar intervalo_partos por modo
    // (IA/Natural/Consolidado, Fase 2 da monta natural) sem mudar o resto do select.
    listAll:   ()           => T('partos').select('bezerro_id,mae_id,data_parto,ciclo_id,lote_inseminacao_id,natimorto,mae:animais!mae_id(proprietario_id),bezerro:animais!bezerro_id(data_desmame,situacao),lote:lotes_inseminacao(tipo)').order('data_parto', { ascending: true }),
    insert:    (data)       => T('partos').insertOne(data).select().single(),
    // bezerro: id/situacao/data_desmame/pesagens — usado por
    // statusReprodutivoDetalhado (Animais.jsx, ficha do animal) além dos
    // campos já usados (brinco/sexo pra timeline).
    // lote.estacao_monta_id: usado por Animais.jsx (ficha) pra saber se um
    // parto pertence à ESTAÇÃO avaliada em desfechoReprodutivo (helpers.js) —
    // mesmo motivo do embed em inseminacoes.byAnimal/abortos.byAnimal.
    byMae:     (maeId)      => T('partos').select('*, bezerro:animais!bezerro_id(id,brinco,sexo,situacao,data_desmame,pesagens(id,data,tipo,peso_kg)), lote:lotes_inseminacao(estacao_monta_id)').eq('mae_id', maeId).order('data_parto', { ascending: true }),
    // lote: usado por Animais.jsx pra resolver o clique em "pai" quando o valor
    // é "Monta natural — Lote N" (paternidade indefinida) — leva pro detalhe do
    // lote em vez de tentar achar um animal com esse nome (ver PAI_MONTA_NATURAL_PREFIX).
    byBezerro: (bezerroId)  => T('partos').select('*, mae:animais!mae_id(brinco), lote:lotes_inseminacao(id,ciclo_id,numero,tipo)').eq('bezerro_id', bezerroId).maybeSingle(),
    update:    (id, d)      => escopo(T('partos').raw().update(d).eq('id', id)).select().single(),
    delete:    (id)         => escopo(T('partos').raw().delete().eq('id', id)),
  },

  pesagens: {
    list:          (animalId) => T('pesagens').select('*').eq('animal_id', animalId).order('data'),
    // Uma query só para vários animais (em vez de 1 query por animal em loop).
    listPorAnimais: (animalIds) => {
      if (!animalIds?.length) return Promise.resolve({ data: [], error: null })
      return T('pesagens').select('*').in('animal_id', animalIds).order('data')
    },
    // Sem limite baixo: Metas.jsx e Pesagens.jsx calculam GMD/médias sobre este
    // retorno, então um corte silencioso aqui distorce os cálculos. 10000 é uma
    // salvaguarda contra retorno ilimitado, não um corte funcional esperado.
    listAll:       ()         => T('pesagens').select('*, animal:animais(brinco,proprietario_id)').order('data', { ascending: false }).limit(10000),
    insert:        (data)     => T('pesagens').insertOne(data).select().single(),
    update:        (id, d)    => escopo(T('pesagens').raw().update(d).eq('id', id)).select().single(),
    delete:        (id)       => escopo(T('pesagens').raw().delete().eq('id', id)),
    countByAnimal: (animalId) => supabase.from('pesagens').select('id', { count:'exact', head:true }).eq('animal_id', animalId),
    // 1 linha por animal (a mais recente) -- não o histórico inteiro. Usado
    // pela lista "Por Animal" (potencialmente milhares de animais ativos),
    // ver migration_pesagens_ultima_por_animal.sql.
    ultimaPorAnimal: (animalIds) => {
      if (!animalIds?.length) return Promise.resolve({ data: [], error: null })
      return supabase.rpc('pesagens_ultima_por_animal', { p_animal_ids: animalIds })
    },
  },

  sanidade: {
    // Ordenado por criado_em desc (mesmo critério de db.lancamentos.list) — o
    // procedimento mais recente aparece primeiro, mesmo com data retroativa.
    list:   ()       => T('procedimentos_sanitarios').select('*').order('criado_em', { ascending: false }).order('id', { ascending: false }),
    insert: (data)   => T('procedimentos_sanitarios').insertOne(data).select().single(),
    update: (id, d)  => escopo(T('procedimentos_sanitarios').raw().update(d).eq('id', id)).select().single(),
    delete: (id)     => escopo(T('procedimentos_sanitarios').raw().delete().eq('id', id)),
  },

  sanidadeAnimais: {
    listPorProcedimento: (procId)   => T('sanidade_animais').select('*, animal:animais(id,brinco)').eq('procedimento_id', procId),
    listPorAnimal:       (animalId) => supabase.from('sanidade_animais').select('*, procedimento:procedimentos_sanitarios(*)').eq('animal_id', animalId),
    inserirVarios: async (vinculos) => {
      if (!vinculos?.length) return { error: null }
      return supabase.from('sanidade_animais').insert(vinculos)
    },
    // Usado por Sanidade.jsx::excluir — apaga os vínculos antes de apagar o
    // procedimento em si (não depende de cascade do banco, que não confirmamos
    // que existe pra esta tabela — ver diagnóstico do Bloco D6).
    deletePorProcedimento: (procId) => escopo(T('sanidade_animais').raw().delete().eq('procedimento_id', procId)),
  },

  estoque: {
    list:   ()       => T('estoque_itens').select('*').eq('ativo', true).order('categoria, item'),
    insert: (data)   => T('estoque_itens').insertOne(data).select().single(),
    update: (id, d)  => escopo(T('estoque_itens').raw().update(d).eq('id', id)).select().single(),
    delete: (id)     => escopo(T('estoque_itens').raw().delete().eq('id', id)),
  },

  movEstoque: {
    // Ordenado por criado_em desc (mesmo critério de db.lancamentos.list) — a
    // movimentação mais recente aparece primeiro, mesmo com data retroativa.
    list:   ()       => T('estoque_movimentacoes').select('*, item:estoque_itens(item,unidade)').order('criado_em', { ascending: false }).order('id', { ascending: false }).limit(500),
    insert: (data)   => T('estoque_movimentacoes').insertOne(data).select().single(),
    // Exclusão/reversão (saída devolve ao estoque, entrada remove) é feita em
    // 2 passos no client (ajustar estoque_itens.quantidade + apagar a linha),
    // igual salvarMov já faz pra criar — ver reverterMov em Estoque.jsx. Não
    // existe trigger no banco pra este módulo (tudo client-side de propósito).
    delete: (id)     => escopo(T('estoque_movimentacoes').raw().delete().eq('id', id)),
    // Bloco D6 — baixa automática vinculada a um procedimento sanitário via
    // procedimento_id (ver migration_sanidade_estoque_d6_1.sql). listPorProcedimento
    // é leitura fresca (não confia em cache local) usada por Sanidade.jsx::excluir
    // pra reverter as baixas antes de apagar o procedimento. listComProcedimento
    // traz TODAS de uma vez — usada no load() de Sanidade.jsx pra montar o mapa
    // "itens baixados por procedimento" da lista inteira, sem N+1.
    listPorProcedimento: (procId) => T('estoque_movimentacoes').select('*, item:estoque_itens(item,unidade)').eq('procedimento_id', procId),
    listComProcedimento: ()       => T('estoque_movimentacoes').select('id,item_id,quantidade,procedimento_id,item:estoque_itens(item,unidade)').not('procedimento_id', 'is', null),
    // Bloco D10 — vínculo com lancamento_financeiro (despesa->entrada,
    // receita->saída). listPorLancamento é leitura fresca, usada por
    // Financeiro.jsx::excluirLanc pra reverter a movimentação antes de apagar
    // o lançamento — mesmo padrão de listPorProcedimento/Sanidade.jsx.
    listPorLancamento: (lancId) => T('estoque_movimentacoes').select('*, item:estoque_itens(item,unidade)').eq('lancamento_id', lancId),
  },

  lancamentos: {
    // Ordenado por CRIADO_EM desc (não pela data do lançamento) — o lançamento
    // mais recente aparece primeiro, mesmo que tenha sido lançado hoje com
    // data retroativa. Desempate por id: lançamentos criados na MESMA
    // transação (ex: registrar_venda_animais gerando venda + comissão/imposto
    // num só INSERT) recebem o mesmo criado_em (NOW() é fixo dentro de uma
    // transação no Postgres) — sem um segundo critério a ordem desses empates
    // mudaria a cada carregamento. id não reflete ordem de criação (é um UUID
    // aleatório), só garante que o empate sempre resolve pro mesmo lado.
    list:   (cicloId) => T('lancamentos_financeiros').select('*, rateios:lancamento_rateios(proprietario_id, valor, percentual, proprietario:proprietarios(nome))').eq('ciclo_id', cicloId).order('criado_em', { ascending: false }).order('id', { ascending: false }),
    insert: (data)    => T('lancamentos_financeiros').insertOne(data).select().single(),
    delete: (id)      => escopo(T('lancamentos_financeiros').raw().delete().eq('id', id)),
    // Grupos já usados em qualquer ciclo (não só o selecionado) — usado pra
    // descobrir grupos "personalizados" digitados pelo usuário além da lista
    // fixa (GRUPOS_REC/GRUPOS_DES), sem precisar de uma tabela própria.
    listGrupos: ()    => T('lancamentos_financeiros').select('grupo,tipo'),
    // Todos os lançamentos, de qualquer ciclo — usado por Metas.jsx pra somar
    // despesas por DATA (não pelo ciclo_id gravado no lançamento), já que a
    // despesa de Inseminação pertence ao período de monta em que caiu a data,
    // que pode divergir do ciclo_id salvo. Sem embed de rateios (não precisa
    // aqui) — só os campos usados na soma/agrupamento.
    listAll: ()       => T('lancamentos_financeiros').select('id,ciclo_id,data,tipo,grupo,valor').order('data', { ascending: false }).limit(5000),
  },

  lancamentoRateios: {
    list:        (lancamentoId) => T('lancamento_rateios').select('*, proprietario:proprietarios(id,nome)').eq('lancamento_id', lancamentoId),
    inserirVarios: async (rateios) => {
      if (!rateios?.length) return { error: null }
      return supabase.from('lancamento_rateios').insert(rateios)
    },
  },

  transacoes: {
    // Ordenado por criado_em desc (mesmo critério de db.lancamentos.list) — a
    // transação mais recente aparece primeiro, mesmo com data retroativa.
    list:   (cicloId) => T('transacoes_animais').select('*').eq('ciclo_id', cicloId).order('criado_em', { ascending: false }).order('id', { ascending: false }),
    // Só vendas, de qualquer ciclo — usado no gráfico de preço de venda por kg
    // ao longo do tempo (Metas.jsx), que é histórico e não deve ficar preso ao
    // ciclo selecionado. Só os campos usados no gráfico.
    listVendas: () => T('transacoes_animais').select('data,categoria,preco_kg,quantidade').eq('tipo', 'V').order('data', { ascending: true }),
    // Venda real (Bloco D/D2): cria o lançamento de receita + 1 transação por
    // categoria + baixa dos animais, tudo numa RPC atômica (registrar_venda_animais).
    registrarVenda: (p) => supabase.rpc('registrar_venda_animais', {
      p_conta_id:    p.conta_id,
      p_fazenda_id:  p.fazenda_id,
      p_ciclo_id:    p.ciclo_id,
      p_data:        p.data,
      p_valor_total: p.valor_total,
      p_descricao:   p.descricao,
      p_contraparte: p.contraparte,
      p_comissao:    p.comissao,
      p_imposto:     p.imposto,
      p_frete:       p.frete,
      p_detalhes:    p.detalhes,
      p_animal_ids:  p.animal_ids,
    }),
    // Compra real (Bloco D/D3): cria o lançamento de despesa + 1 transação por
    // categoria + cadastra os animais em lote (brinco provisório) + rateio,
    // tudo numa RPC atômica (registrar_compra_animais).
    registrarCompra: (p) => supabase.rpc('registrar_compra_animais', {
      p_conta_id:    p.conta_id,
      p_fazenda_id:  p.fazenda_id,
      p_ciclo_id:    p.ciclo_id,
      p_data:        p.data,
      p_valor_total: p.valor_total,
      p_descricao:   p.descricao,
      p_contraparte: p.contraparte,
      p_comissao:    p.comissao,
      p_imposto:     p.imposto,
      p_frete:       p.frete,
      p_detalhes:    p.detalhes,
    }),
  },

  transacaoAnimaisItens: {
    // Consulta (Bloco D/D2.3): animais individuais de uma transação (venda e,
    // a partir do D3, compra também).
    listPorTransacao: (transacaoId) => T('transacao_animais_itens')
      .select('*, animal:animais(brinco), proprietario:proprietarios(nome)')
      .eq('transacao_id', transacaoId)
      .order('categoria_venda'),
    // Data de ENTRADA no rebanho de animais COMPRADOS (uma query só pra todos
    // os animais da conta/fazenda de uma vez — nunca N+1). Junta com
    // transacoes_animais via o FK transacao_id e filtra tipo='C' (compra) no
    // próprio join (!inner), então só vem uma linha por animal comprado.
    // Animal nascido na fazenda nunca aparece aqui (nunca tem transação de
    // compra) — ver ehMatriz/data_entrada em helpers.js.
    listDataEntradaCompras: () => T('transacao_animais_itens')
      .select('animal_id, transacoes_animais!inner(data,tipo)')
      .eq('transacoes_animais.tipo', 'C'),
    // Receita real de vendas (Metas.jsx — cards "Receita Real de Terneiros ♂♀").
    // Sem filtro de categoria_venda de propósito: a âncora é por SAFRA DE
    // NASCIMENTO (bezerroIdsSafra, calculado em Metas.jsx), então um terneiro
    // vendido bem depois — já reclassificado como Novilho/Novilha, ou vendido
    // sob categoria com override — ainda precisa entrar na conta. Sem escopo
    // de ciclo (mesmo motivo): a venda pode cair num ciclo bem depois do
    // nascimento.
    listVendasAnimais: () => T('transacao_animais_itens')
      .select('animal_id, valor, transacoes_animais!inner(tipo)')
      .eq('transacoes_animais.tipo', 'V'),
    // Item 6 (Reprodutivo.jsx) — usado por bezerroTemHistorico pra bloquear
    // "desfazer nascimento" num bezerro que já entrou em alguma transação
    // (venda, na prática — um recém-nascido nunca tem compra própria).
    byAnimal: (animalId) => T('transacao_animais_itens').select('id').eq('animal_id', animalId).limit(1),
  },

  simulacoes: {
    // Simulações (Bloco D/D3): nunca criam lançamento, baixa de animal ou
    // rateio — é só um registro de consulta em simulacoes_transacoes.
    // NÃO filtra por ciclo_id: simulação é um cenário hipotético, muitas vezes
    // pra uma data que ainda não cai em nenhum ciclo cadastrado (ciclo_id fica
    // NULL) ou num ciclo diferente do que está selecionado nas outras abas da
    // tela — filtrar por ciclo escondia simulações recém-criadas em silêncio.
    list:   () => T('simulacoes_transacoes').select('*').order('data', { ascending: false }),
    insert: (data) => T('simulacoes_transacoes').insertOne(data).select().single(),
    delete: (id)   => escopo(T('simulacoes_transacoes').raw().delete().eq('id', id)),
  },

  ciclos: {
    list:    ()     => T('ciclos_financeiros').select('*').order('inicio', { ascending: false }),
    listByFazenda: (fazendaId) => {
      let q = supabase.from('ciclos_financeiros').select('*').eq('fazenda_id', fazendaId).order('inicio', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      return q
    },
    current: ()     => T('ciclos_financeiros').select('*').eq('atual', true).maybeSingle(),
    // Usado pela criação automática de ciclo (CicloContext) pra reduzir a janela de
    // corrida: reconsulta pelo nome (chave natural, ex: '2025/26') logo antes de
    // inserir, em vez de confiar só na lista já carregada em memória.
    byNome:  (nome) => T('ciclos_financeiros').select('*').eq('nome', nome).maybeSingle(),
    insert:  (data) => T('ciclos_financeiros').insertOne(data).select().single(),
    deactivateAll: () => {
      let q = T('ciclos_financeiros').raw().update({ atual: false }).eq('atual', true)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    // Bloco D11 — soma receitas-despesas de TODOS os ciclos anteriores (mesma
    // fazenda), calculada no banco a cada chamada — nunca armazenada, nunca
    // cacheada. Ver migration_saldo_anterior_ciclo_d11_1.sql pro porquê de
    // filtrar por data (não por ciclo_id, que é nullable) e por que só usa
    // lancamento_rateios (proprietario_id direto em lancamentos_financeiros
    // é coluna legada, nunca escrita/lida por este app).
    saldoAnterior: (cicloId, proprietarioId = null) =>
      supabase.rpc('saldo_anterior_ciclo', { p_ciclo_id: cicloId, p_proprietario_id: proprietarioId }),
  },

  categoriasPreco: {
    list:   ()      => T('categorias_preco').select('*').order('categoria'),
    update: (id, d) => escopo(T('categorias_preco').raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id)),
  },

  metas: {
    list:   ()      => T('metas').select('*').order('indicador'),
    insert: (data)  => T('metas').insertOne(data).select().single(),
    update: (id, d) => escopo(T('metas').raw().update(d).eq('id', id)).select().single(),
  },

  planejamentos: {
    get:    ()       => T('planejamentos').select('*').eq('ativo', true).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
    insert: (data)   => T('planejamentos').insertOne(data).select().single(),
    update: (id, d)  => escopo(T('planejamentos').raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id)).select().single(),
  },

  planejamentoAcoes: {
    list:   (planId) => T('planejamento_acoes').select('*').eq('planejamento_id', planId).order('criado_em'),
    insert: (data)   => T('planejamento_acoes').insertOne(data).select().single(),
    update: (id, d)  => escopo(T('planejamento_acoes').raw().update(d).eq('id', id)).select().single(),
    delete: (id)     => escopo(T('planejamento_acoes').raw().delete().eq('id', id)),
  },

  benchmarks: {
    list:   ()           => T('benchmarks_rentabilidade').select('*').order('cenario'),
    update: (cenario, d) => escopo(T('benchmarks_rentabilidade').raw().update(d).eq('cenario', cenario)),
  },

  contaMembros: {
    removerMembro: (contaId, usuarioId) => supabase.rpc('remover_membro', { p_conta_id: contaId, p_usuario_id: usuarioId }),
  },

  usuarioPermissoes: {
    listPorUsuarioFazenda: (contaId, usuarioId, fazendaId) =>
      supabase.from('usuario_permissoes').select('*')
        .eq('conta_id', contaId).eq('usuario_id', usuarioId).eq('fazenda_id', fazendaId),
    upsertVarios: async (perms) => {
      if (!perms?.length) return { error: null }
      return supabase.from('usuario_permissoes')
        .upsert(perms, { onConflict: 'conta_id,usuario_id,fazenda_id,modulo' })
    },
  },

  usuarioFazendas: {
    listPorUsuario: (usuarioId) =>
      supabase.from('usuario_fazendas').select('fazenda_id').eq('usuario_id', usuarioId),
    definir: (contaId, usuarioId, fazendaId, vincular) =>
      supabase.rpc('definir_fazenda_usuario', {
        p_conta_id: contaId, p_usuario_id: usuarioId, p_fazenda_id: fazendaId, p_vincular: vincular
      }),
  },

  // ── Módulo Veterinário — tudo semFazenda:true (dado é da CONTA, não da
  // fazenda; ver veterinario_schema.sql). Mesmo padrão de db.fazendas, único
  // outro consumidor de T(tabela, {semFazenda:true}) hoje.
  //
  // NÃO coberto pelo backup/restauração de fazenda (exportarBackup.js,
  // importarBackup.js, restaurar_backup_fazenda.sql): esses três mecanismos
  // operam por FAZENDA, e este módulo é por CONTA — mesma categoria de
  // usuarios/usuario_permissoes/contas, que já ficam fora hoje. Lacuna
  // conhecida e documentada (ver Backup.jsx e o manual), não um esquecimento.
  veterinario: {
    config: {
      get: () => T('veterinario_config', { semFazenda: true }).select('*').maybeSingle(),
      // upsert (não insertOne comum): 1 linha por conta, conta_id UNIQUE —
      // salvar de novo deve atualizar, nunca duplicar.
      upsert: (data) => supabase.from('veterinario_config')
        .upsert({ ...data, conta_id: data.conta_id ?? cid() }, { onConflict: 'conta_id' })
        .select().single(),
    },

    categorias: {
      list:   ()      => T('veterinario_categorias', { semFazenda: true }).select('*').order('nome'),
      insert: (data)  => T('veterinario_categorias', { semFazenda: true }).insertOne(data).select().single(),
      update: (id, d) => escopo(T('veterinario_categorias', { semFazenda: true }).raw().update(d).eq('id', id), { semFazenda: true }).select().single(),
      delete: (id)    => escopo(T('veterinario_categorias', { semFazenda: true }).raw().delete().eq('id', id), { semFazenda: true }),
    },

    clientes: {
      list:   ()      => T('veterinario_clientes', { semFazenda: true }).select('*').order('nome'),
      insert: (data)  => T('veterinario_clientes', { semFazenda: true }).insertOne(data).select().single(),
      update: (id, d) => escopo(T('veterinario_clientes', { semFazenda: true }).raw().update(d).eq('id', id), { semFazenda: true }).select().single(),
      delete: (id)    => escopo(T('veterinario_clientes', { semFazenda: true }).raw().delete().eq('id', id), { semFazenda: true }),
      // Sincronização inicial fazenda -> cliente (ver Veterinario.jsx, aba
      // Clientes): insere só as fazendas que ainda não têm cliente
      // correspondente — nunca atualiza as já existentes (nome fica estável
      // até o usuário clicar em "sincronizar nome" explicitamente).
      insertVarios: async (rows) => {
        if (!rows?.length) return { error: null }
        return supabase.from('veterinario_clientes').insert(rows)
      },
    },

    ciclos: {
      list:          ()      => T('veterinario_ciclos', { semFazenda: true }).select('*').order('inicio', { ascending: false }),
      current:       ()      => T('veterinario_ciclos', { semFazenda: true }).select('*').eq('atual', true).maybeSingle(),
      insert:        (data)  => T('veterinario_ciclos', { semFazenda: true }).insertOne(data).select().single(),
      update:        (id, d) => escopo(T('veterinario_ciclos', { semFazenda: true }).raw().update(d).eq('id', id), { semFazenda: true }).select().single(),
      deactivateAll: ()      => {
        let q = T('veterinario_ciclos', { semFazenda: true }).raw().update({ atual: false }).eq('atual', true)
        if (cid()) q = q.eq('conta_id', cid())
        return q
      },
    },

    lancamentos: {
      // listAll (sem filtro de ciclo) — usado pro saldo transportado: soma
      // TODOS os ciclos de uma vez, na leitura, nunca grava snapshot nenhum
      // (ver Veterinario.jsx::saldoAteOCiclo).
      listAll: () => T('veterinario_lancamentos', { semFazenda: true })
        .select('*, cliente:veterinario_clientes(id,nome), categoria:veterinario_categorias(id,nome)')
        .order('data', { ascending: false }),
      insert: (data)  => T('veterinario_lancamentos', { semFazenda: true }).insertOne(data).select().single(),
      update: (id, d) => escopo(T('veterinario_lancamentos', { semFazenda: true }).raw().update(d).eq('id', id), { semFazenda: true }).select().single(),
      delete: (id)    => escopo(T('veterinario_lancamentos', { semFazenda: true }).raw().delete().eq('id', id), { semFazenda: true }),
    },

    // Histórico de atestados emitidos (Item 10) — só list/insert: reemitir é
    // reler uma linha existente (com os animais já embutidos) e gerar o PDF
    // de novo (veterinarioPdf.js), nunca update (documento já emitido não
    // muda retroativamente). N animais por atestado (ver
    // veterinario_atestados_multi.sql) — animais embutidos via embed do
    // PostgREST, sem N+1.
    atestados: {
      list: () => T('veterinario_atestados', { semFazenda: true })
        .select('*, animais:veterinario_atestado_animais(*)')
        .order('criado_em', { ascending: false }),
      insert: (data) => T('veterinario_atestados', { semFazenda: true }).insertOne(data).select().single(),
      // Bulk insert dos animais de UM atestado — mesmo padrão de
      // lancamentoRateios.inserirVarios/clientes.insertVarios (raw, cada
      // linha já vem com conta_id/atestado_id prontos do chamador).
      insertAnimais: async (rows) => {
        if (!rows?.length) return { error: null }
        return supabase.from('veterinario_atestado_animais').insert(rows)
      },
      // Só uso interno: compensação se insertAnimais falhar DEPOIS do
      // atestado já ter sido criado (ver Veterinario.jsx::emitir) — sem
      // isso, um erro no segundo insert deixaria um atestado órfão, sem
      // nenhum animal (exatamente o que a verificação da migração checava).
      // Nunca exposto como "excluir atestado" pro usuário — histórico
      // continua append-only.
      delete: (id) => escopo(T('veterinario_atestados', { semFazenda: true }).raw().delete().eq('id', id), { semFazenda: true }),
    },
  },
}
