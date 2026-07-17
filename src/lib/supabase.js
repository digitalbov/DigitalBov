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
    list: (cicloId) => T('lotes_inseminacao').select(`
      *, inseminacoes(*, animal:animais(brinco,proprietario_id,sit_reprodutiva,proprietario:proprietarios(nome))),
      partos(id,bezerro_id,mae_id,data_parto,mae:animais!mae_id(proprietario_id),bezerro:animais!bezerro_id(situacao,data_desmame,pesagens(data,tipo,peso_kg))),
      abortos(id,animal_id,data,causa,animal:animais(proprietario_id)),
      estacao:estacoes_monta(id,nome,inicio,fim)
    `).eq('ciclo_id', cicloId).order('data', { ascending: false }),
    listAll: () => T('lotes_inseminacao').select(`
      *, ciclo:ciclos_financeiros(id,nome,inicio,fim),
      inseminacoes(*, animal:animais(brinco,proprietario_id,proprietario:proprietarios(nome))),
      partos(id,bezerro_id,mae_id,data_parto,mae:animais!mae_id(proprietario_id),bezerro:animais!bezerro_id(situacao,data_desmame,pesagens(data,tipo,peso_kg))),
      abortos(id,animal_id,data,causa,animal:animais(proprietario_id)),
      estacao:estacoes_monta(id,nome,inicio,fim)
    `).order('data', { ascending: true }),
    insert: (data)  => T('lotes_inseminacao').insertOne(data).select().single(),
    update: (id, d) => escopo(T('lotes_inseminacao').raw().update(d).eq('id', id)).select().single(),
    delete: (id)    => escopo(T('lotes_inseminacao').raw().delete().eq('id', id)),
    // Versão leve: dados básicos do lote + inseminações (com brinco do animal) —
    // usada em telas que não precisam do funil completo do Reprodutivo, sem os
    // embeds pesados de partos/pesagens/abortos/estação (Dashboard, Rebanho,
    // Metas, Calendario, Relatorios, contextoIA). Sem cicloId, traz de todos os ciclos.
    listInseminacoesResumo: (cicloId) => {
      let q = T('lotes_inseminacao').select(`
        ciclo_id, numero, touro, data,
        inseminacoes(animal_id, diagnostico, animal:animais(brinco,proprietario_id))
      `)
      if (cicloId) q = q.eq('ciclo_id', cicloId)
      return q.order('data', { ascending: false })
    },
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
    byAnimal: (animalId)  => T('abortos').select('*, lote:lotes_inseminacao(numero,touro)').eq('animal_id', animalId).order('data', { ascending: false }),
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
    byAnimal:     (animalId)  => T('inseminacoes').select('*, lote:lotes_inseminacao(numero,touro,data)').eq('animal_id', animalId).order('criado_em', { ascending: true }),
  },

  partos: {
    list:      (cicloId)    => T('partos').select('*, mae:animais!mae_id(brinco,proprietario_id,proprietario:proprietarios(id,nome)), bezerro:animais!bezerro_id(brinco,sexo)').eq('ciclo_id', cicloId).order('data_parto', { ascending: false }),
    listAll:   ()           => T('partos').select('mae_id,data_parto,ciclo_id,lote_inseminacao_id,mae:animais!mae_id(proprietario_id)').order('data_parto', { ascending: true }),
    insert:    (data)       => T('partos').insertOne(data).select().single(),
    byMae:     (maeId)      => T('partos').select('*, bezerro:animais!bezerro_id(brinco,sexo)').eq('mae_id', maeId).order('data_parto', { ascending: true }),
    byBezerro: (bezerroId)  => T('partos').select('*, mae:animais!mae_id(brinco)').eq('bezerro_id', bezerroId).maybeSingle(),
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
    delete:        (id)       => escopo(T('pesagens').raw().delete().eq('id', id)),
    countByAnimal: (animalId) => supabase.from('pesagens').select('id', { count:'exact', head:true }).eq('animal_id', animalId),
  },

  sanidade: {
    list:   ()       => T('procedimentos_sanitarios').select('*').order('data', { ascending: false }),
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
  },

  estoque: {
    list:   ()       => T('estoque_itens').select('*').eq('ativo', true).order('categoria, item'),
    insert: (data)   => T('estoque_itens').insertOne(data).select().single(),
    update: (id, d)  => escopo(T('estoque_itens').raw().update(d).eq('id', id)).select().single(),
    delete: (id)     => escopo(T('estoque_itens').raw().delete().eq('id', id)),
  },

  movEstoque: {
    list:   ()       => T('estoque_movimentacoes').select('*, item:estoque_itens(item,unidade)').order('data', { ascending: false }).limit(500),
    insert: (data)   => T('estoque_movimentacoes').insertOne(data).select().single(),
  },

  lancamentos: {
    list:   (cicloId) => T('lancamentos_financeiros').select('*, rateios:lancamento_rateios(proprietario_id, valor, percentual, proprietario:proprietarios(nome))').eq('ciclo_id', cicloId).order('data', { ascending: false }),
    insert: (data)    => T('lancamentos_financeiros').insertOne(data).select().single(),
    delete: (id)      => escopo(T('lancamentos_financeiros').raw().delete().eq('id', id)),
  },

  lancamentoRateios: {
    list:        (lancamentoId) => T('lancamento_rateios').select('*, proprietario:proprietarios(id,nome)').eq('lancamento_id', lancamentoId),
    inserirVarios: async (rateios) => {
      if (!rateios?.length) return { error: null }
      return supabase.from('lancamento_rateios').insert(rateios)
    },
    deletePorLancamento: (lancamentoId) => supabase.from('lancamento_rateios').delete().eq('lancamento_id', lancamentoId),
  },

  transacoes: {
    list:   (cicloId) => T('transacoes_animais').select('*').eq('ciclo_id', cicloId).order('data', { ascending: false }),
    insert: (data)    => T('transacoes_animais').insertOne(data).select().single(),
  },

  ciclos: {
    list:    ()     => T('ciclos_financeiros').select('*').order('inicio', { ascending: false }),
    listByFazenda: (fazendaId) => {
      let q = supabase.from('ciclos_financeiros').select('*').eq('fazenda_id', fazendaId).order('inicio', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      return q
    },
    current: ()     => T('ciclos_financeiros').select('*').eq('atual', true).maybeSingle(),
    insert:  (data) => T('ciclos_financeiros').insertOne(data).select().single(),
    deactivateAll: () => {
      let q = T('ciclos_financeiros').raw().update({ atual: false }).eq('atual', true)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
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
}
