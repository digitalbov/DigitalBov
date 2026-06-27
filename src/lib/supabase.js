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
      let q = supabase.from('animais').select(`
        *, proprietario:proprietarios(id,nome), lote:lotes(id,nome)
      `).order('brinco')
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      if (filters.situacao)        q = q.eq('situacao',       filters.situacao)
      if (filters.proprietario_id) q = q.eq('proprietario_id',filters.proprietario_id)
      if (filters.sexo)            q = q.eq('sexo',           filters.sexo)
      return q
    },
    get:      (id)    => supabase.from('animais').select('*, proprietario:proprietarios(nome), lote:lotes(nome)').eq('id', id).single(),
    insert:   (data)  => supabase.from('animais').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    update:   (id, d) => supabase.from('animais').update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id).select().single(),
    delete:   (id)    => supabase.from('animais').delete().eq('id', id),
    byBrinco: (b) => {
      let q = supabase.from('animais').select('*, proprietario:proprietarios(id,nome), lote:lotes(id,nome)').eq('brinco', b)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q.maybeSingle()
    },
    filhos: (b) => {
      let q = supabase.from('animais').select('*, proprietario:proprietarios(id,nome), lote:lotes(id,nome)').eq('mae_brinco', b)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q.order('brinco')
    }
  },

  proprietarios: {
    list: () => {
      let q = supabase.from('proprietarios').select('*').eq('ativo', true).order('nome')
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    listAll: () => {
      let q = supabase.from('proprietarios').select('*').order('nome')
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert:  (data)   => supabase.from('proprietarios').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    update:  (id, d)  => supabase.from('proprietarios').update(d).eq('id', id).select().single(),
    delete:  (id)     => supabase.from('proprietarios').delete().eq('id', id),
    hasData: (id) => {
      let q = supabase.from('animais').select('id', { count: 'exact', head: true }).eq('proprietario_id', id)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    }
  },

  fazendas: {
    list:       ()        => supabase.from('fazendas').select('*').eq('ativo', true).order('nome'),
    get:        (id)      => supabase.from('fazendas').select('*').eq('id', id).single(),
    insert:     (data)    => supabase.from('fazendas').insert(data).select().single(),
    update:     (id, d)   => supabase.from('fazendas').update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id).select().single(),
    deactivate: (id)      => supabase.from('fazendas').update({ ativo: false }).eq('id', id),
    hardDelete: (id)      => supabase.from('fazendas').delete().eq('id', id),
  },

  lotes: {
    list:   () => {
      let q = supabase.from('lotes').select('*').eq('ativo', true).order('nome')
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data)   => supabase.from('lotes').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    update: (id, d)  => supabase.from('lotes').update(d).eq('id', id).select().single(),
    delete: (id)     => supabase.from('lotes').delete().eq('id', id),
  },

  piquetes: {
    list:   () => {
      let q = supabase.from('piquetes').select('*, fazenda:fazendas(nome)').order('nome')
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data)   => supabase.from('piquetes').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    update: (id, d)  => supabase.from('piquetes').update(d).eq('id', id).select().single(),
    delete: (id)     => supabase.from('piquetes').delete().eq('id', id),
  },

  lotesInseminacao: {
    list: (cicloId) => {
      let q = supabase.from('lotes_inseminacao').select(`
        *, inseminacoes(*, animal:animais(brinco,proprietario_id))
      `).eq('ciclo_id', cicloId).order('data', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    listAll: () => {
      let q = supabase.from('lotes_inseminacao').select(`
        *, ciclo:ciclos_financeiros(id,nome,inicio),
        inseminacoes(*, animal:animais(brinco,proprietario_id,proprietario:proprietarios(nome)))
      `).order('data', { ascending: true })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data)   => supabase.from('lotes_inseminacao').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    update: (id, d)  => supabase.from('lotes_inseminacao').update(d).eq('id', id).select().single()
  },

  inseminacoes: {
    insert:  (data)       => supabase.from('inseminacoes').insert({ ...data, conta_id: cid() }),
    update:  (id, d)      => supabase.from('inseminacoes').update(d).eq('id', id),
    upsert:  (data)       => supabase.from('inseminacoes').upsert(data, { onConflict: 'lote_inseminacao_id,animal_id', ignoreDuplicates: false }).select(),
    byAnimal:(animalId)   => supabase.from('inseminacoes').select('*, lote:lotes_inseminacao(numero,touro,data)').eq('animal_id', animalId).order('created_at', { ascending: true })
  },

  partos: {
    list: (cicloId) => {
      let q = supabase.from('partos').select('*, mae:animais!mae_id(brinco,proprietario_id,proprietario:proprietarios(id,nome)), bezerro:animais!bezerro_id(brinco,sexo)').eq('ciclo_id', cicloId).order('data_parto', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    listAll: () => {
      let q = supabase.from('partos').select('mae_id,data_parto,ciclo_id').order('data_parto', { ascending: true })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert:    (data)      => supabase.from('partos').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    byMae:     (maeId)     => supabase.from('partos').select('*, bezerro:animais!bezerro_id(brinco,sexo)').eq('mae_id', maeId).order('data_parto', { ascending: true }),
    byBezerro: (bezerroId) => supabase.from('partos').select('*, mae:animais!mae_id(brinco)').eq('bezerro_id', bezerroId).maybeSingle()
  },

  pesagens: {
    list:    (animalId) => supabase.from('pesagens').select('*').eq('animal_id', animalId).order('data'),
    listAll: () => {
      let q = supabase.from('pesagens').select('*, animal:animais(brinco,proprietario_id)').order('data', { ascending: false }).limit(100)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert:  (data) => supabase.from('pesagens').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    delete:  (id)   => supabase.from('pesagens').delete().eq('id', id)
  },

  sanidade: {
    list: () => {
      let q = supabase.from('procedimentos_sanitarios').select('*').order('data', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data) => supabase.from('procedimentos_sanitarios').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    delete: (id)   => supabase.from('procedimentos_sanitarios').delete().eq('id', id)
  },

  estoque: {
    list: () => {
      let q = supabase.from('estoque_itens').select('*').eq('ativo', true).order('categoria, item')
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data)  => supabase.from('estoque_itens').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    update: (id, d) => supabase.from('estoque_itens').update(d).eq('id', id).select().single(),
    delete: (id)    => supabase.from('estoque_itens').delete().eq('id', id)
  },

  movEstoque: {
    list: () => {
      let q = supabase.from('estoque_movimentacoes').select('*, item:estoque_itens(item,unidade)').order('data', { ascending: false }).limit(50)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data) => supabase.from('estoque_movimentacoes').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single()
  },

  lancamentos: {
    list: (cicloId) => {
      let q = supabase.from('lancamentos_financeiros').select('*').eq('ciclo_id', cicloId).order('data', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data) => supabase.from('lancamentos_financeiros').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    delete: (id)   => supabase.from('lancamentos_financeiros').delete().eq('id', id)
  },

  transacoes: {
    list: (cicloId) => {
      let q = supabase.from('transacoes_animais').select('*').eq('ciclo_id', cicloId).order('data', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    insert: (data) => supabase.from('transacoes_animais').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single()
  },

  ciclos: {
    list: () => {
      let q = supabase.from('ciclos_financeiros').select('*').order('inicio', { ascending: false })
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    },
    current: () => {
      let q = supabase.from('ciclos_financeiros').select('*').eq('atual', true)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q.maybeSingle()
    },
    insert:        (data) => supabase.from('ciclos_financeiros').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    deactivateAll: ()     => {
      let q = supabase.from('ciclos_financeiros').update({ atual: false }).eq('atual', true)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q
    }
  },

  categoriasPreco: {
    list:   ()      => supabase.from('categorias_preco').select('*').order('categoria'),
    update: (id, d) => supabase.from('categorias_preco').update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id)
  },

  metas: {
    list:   ()      => supabase.from('metas').select('*').order('indicador'),
    update: (id, d) => supabase.from('metas').update(d).eq('id', id).select().single()
  },

  planejamentos: {
    get: () => {
      let q = supabase.from('planejamentos').select('*').eq('ativo', true).order('criado_em', { ascending: false }).limit(1)
      if (cid()) q = q.eq('conta_id', cid())
      if (fid()) q = q.eq('fazenda_id', fid())
      return q.maybeSingle()
    },
    insert: (data) => supabase.from('planejamentos').insert({ ...data, conta_id: cid(), fazenda_id: fid() }).select().single(),
    update: (id, d) => supabase.from('planejamentos').update({ ...d, atualizado_em: new Date().toISOString() }).eq('id', id).select().single(),
  },

  planejamentoAcoes: {
    list:   (planId) => supabase.from('planejamento_acoes').select('*').eq('planejamento_id', planId).order('criado_em'),
    insert: (data)   => supabase.from('planejamento_acoes').insert({ ...data, conta_id: cid() }).select().single(),
    update: (id, d)  => supabase.from('planejamento_acoes').update(d).eq('id', id).select().single(),
    delete: (id)     => supabase.from('planejamento_acoes').delete().eq('id', id),
  },

  benchmarks: {
    list:   ()          => supabase.from('benchmarks_rentabilidade').select('*').order('cenario'),
    update: (cenario, d) => supabase.from('benchmarks_rentabilidade').update(d).eq('cenario', cenario),
  }
}
