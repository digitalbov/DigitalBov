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
      const base = { ...data, conta_id: cid() }
      if (!semFazenda) base.fazenda_id = fid()
      return supabase.from(tabela).insert(base)
    },
    raw: () => supabase.from(tabela)
  }
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
    get:      (id)    => T('animais').raw().select('*, proprietario:proprietarios(nome), lote:lotes(nome)').eq('id', id).single(),
    insert:   (data)  => T('animais').insertOne(data).select().single(),
    update:   (id, d) => T('animais').raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id).select().single(),
    delete:   (id)    => T('animais').raw().delete().eq('id', id),
    byBrinco: (b)     => T('animais').select('*, proprietario:proprietarios(id,nome), lote:lotes(id,nome)').eq('brinco', b).maybeSingle(),
    filhos:   (b)     => T('animais').select('*, proprietario:proprietarios(id,nome), lote:lotes(id,nome)').eq('mae_brinco', b).order('brinco'),
  },

  proprietarios: {
    list:    ()       => T('proprietarios').select('*').eq('ativo', true).order('nome'),
    listAll: ()       => T('proprietarios').select('*').order('nome'),
    insert:  (data)   => T('proprietarios').insertOne(data).select().single(),
    update:  (id, d)  => T('proprietarios').raw().update(d).eq('id', id).select().single(),
    delete:  (id)     => T('proprietarios').raw().delete().eq('id', id),
    hasData: (id)     => T('animais').selectRaw('id', { count: 'exact', head: true }).eq('proprietario_id', id),
  },

  fazendas: {
    list:       ()        => T('fazendas', { semFazenda: true }).select('*').eq('ativo', true).order('nome'),
    get:        (id)      => T('fazendas', { semFazenda: true }).raw().select('*').eq('id', id).single(),
    insert:     (data)    => T('fazendas', { semFazenda: true }).insertOne(data).select().single(),
    update:     (id, d)   => T('fazendas', { semFazenda: true }).raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id).select().single(),
    deactivate: (id)      => T('fazendas', { semFazenda: true }).raw().update({ ativo: false }).eq('id', id),
    hardDelete: (id)      => T('fazendas', { semFazenda: true }).raw().delete().eq('id', id),
  },

  lotes: {
    list:   ()       => T('lotes').select('*').eq('ativo', true).order('nome'),
    insert: (data)   => T('lotes').insertOne(data).select().single(),
    update: (id, d)  => T('lotes').raw().update(d).eq('id', id).select().single(),
    delete: (id)     => T('lotes').raw().delete().eq('id', id),
  },

  piquetes: {
    list:   ()       => T('piquetes').select('*, fazenda:fazendas(nome)').order('nome'),
    insert: (data)   => T('piquetes').insertOne(data).select().single(),
    update: (id, d)  => T('piquetes').raw().update(d).eq('id', id).select().single(),
    delete: (id)     => T('piquetes').raw().delete().eq('id', id),
  },

  lotesInseminacao: {
    list: (cicloId) => T('lotes_inseminacao').select(`
      *, inseminacoes(*, animal:animais(brinco,proprietario_id))
    `).eq('ciclo_id', cicloId).order('data', { ascending: false }),
    listAll: () => T('lotes_inseminacao').select(`
      *, ciclo:ciclos_financeiros(id,nome,inicio),
      inseminacoes(*, animal:animais(brinco,proprietario_id,proprietario:proprietarios(nome)))
    `).order('data', { ascending: true }),
    insert: (data)  => T('lotes_inseminacao').insertOne(data).select().single(),
    update: (id, d) => T('lotes_inseminacao').raw().update(d).eq('id', id).select().single(),
  },

  inseminacoes: {
    insert:   (data)      => T('inseminacoes').insertOne(data),
    update:   (id, d)     => T('inseminacoes').raw().update(d).eq('id', id),
    upsert:   (data)      => T('inseminacoes').raw().upsert(
      { ...data, conta_id: cid(), fazenda_id: fid() },
      { onConflict: 'lote_inseminacao_id,animal_id', ignoreDuplicates: false }
    ).select(),
    byAnimal: (animalId)  => T('inseminacoes').select('*, lote:lotes_inseminacao(numero,touro,data)').eq('animal_id', animalId).order('created_at', { ascending: true }),
  },

  partos: {
    list:      (cicloId)    => T('partos').select('*, mae:animais!mae_id(brinco,proprietario_id,proprietario:proprietarios(id,nome)), bezerro:animais!bezerro_id(brinco,sexo)').eq('ciclo_id', cicloId).order('data_parto', { ascending: false }),
    listAll:   ()           => T('partos').select('mae_id,data_parto,ciclo_id').order('data_parto', { ascending: true }),
    insert:    (data)       => T('partos').insertOne(data).select().single(),
    byMae:     (maeId)      => T('partos').select('*, bezerro:animais!bezerro_id(brinco,sexo)').eq('mae_id', maeId).order('data_parto', { ascending: true }),
    byBezerro: (bezerroId)  => T('partos').select('*, mae:animais!mae_id(brinco)').eq('bezerro_id', bezerroId).maybeSingle(),
  },

  pesagens: {
    list:    (animalId) => T('pesagens').select('*').eq('animal_id', animalId).order('data'),
    listAll: ()         => T('pesagens').select('*, animal:animais(brinco,proprietario_id)').order('data', { ascending: false }).limit(100),
    insert:  (data)     => T('pesagens').insertOne(data).select().single(),
    delete:  (id)       => T('pesagens').raw().delete().eq('id', id),
  },

  sanidade: {
    list:   ()       => T('procedimentos_sanitarios').select('*').order('data', { ascending: false }),
    insert: (data)   => T('procedimentos_sanitarios').insertOne(data).select().single(),
    delete: (id)     => T('procedimentos_sanitarios').raw().delete().eq('id', id),
  },

  estoque: {
    list:   ()       => T('estoque_itens').select('*').eq('ativo', true).order('categoria, item'),
    insert: (data)   => T('estoque_itens').insertOne(data).select().single(),
    update: (id, d)  => T('estoque_itens').raw().update(d).eq('id', id).select().single(),
    delete: (id)     => T('estoque_itens').raw().delete().eq('id', id),
  },

  movEstoque: {
    list:   ()       => T('estoque_movimentacoes').select('*, item:estoque_itens(item,unidade)').order('data', { ascending: false }).limit(50),
    insert: (data)   => T('estoque_movimentacoes').insertOne(data).select().single(),
  },

  lancamentos: {
    list:   (cicloId) => T('lancamentos_financeiros').select('*').eq('ciclo_id', cicloId).order('data', { ascending: false }),
    insert: (data)    => T('lancamentos_financeiros').insertOne(data).select().single(),
    delete: (id)      => T('lancamentos_financeiros').raw().delete().eq('id', id),
  },

  transacoes: {
    list:   (cicloId) => T('transacoes_animais').select('*').eq('ciclo_id', cicloId).order('data', { ascending: false }),
    insert: (data)    => T('transacoes_animais').insertOne(data).select().single(),
  },

  ciclos: {
    list:    ()     => T('ciclos_financeiros').select('*').order('inicio', { ascending: false }),
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
    update: (id, d) => T('categorias_preco').raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id),
  },

  metas: {
    list:   ()      => T('metas').select('*').order('indicador'),
    update: (id, d) => T('metas').raw().update(d).eq('id', id).select().single(),
  },

  planejamentos: {
    get:    ()       => T('planejamentos').select('*').eq('ativo', true).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
    insert: (data)   => T('planejamentos').insertOne(data).select().single(),
    update: (id, d)  => T('planejamentos').raw().update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id).select().single(),
  },

  planejamentoAcoes: {
    list:   (planId) => T('planejamento_acoes').select('*').eq('planejamento_id', planId).order('criado_em'),
    insert: (data)   => T('planejamento_acoes').insertOne(data).select().single(),
    update: (id, d)  => T('planejamento_acoes').raw().update(d).eq('id', id).select().single(),
    delete: (id)     => T('planejamento_acoes').raw().delete().eq('id', id),
  },

  benchmarks: {
    list:   ()           => T('benchmarks_rentabilidade').select('*').order('cenario'),
    update: (cenario, d) => T('benchmarks_rentabilidade').raw().update(d).eq('cenario', cenario),
  },
}
