import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calcCategoria } from '../lib/helpers'
import { toast } from '../components/UI'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo } from '../lib/CicloContext'

// ── Helpers ───────────────────────────────────────────────────────

// Busca segura e escopada: retorna [] se a tabela não existir ou houver erro.
// Sempre filtra por conta_id; filtra também por fazenda_id, exceto quando
// { semFazenda: true } (tabela não tem essa coluna) ou { porId: fazendaId }
// (a própria tabela "fazendas": queremos só a linha da fazenda atual, não
// todas as fazendas da conta).
const safeQ = async (table, contaId, fazendaId, opts = {}) => {
  let q = supabase.from(table).select('*')
  if (contaId) q = q.eq('conta_id', contaId)
  if (opts.porId) {
    q = q.eq('id', fazendaId)
  } else if (!opts.semFazenda && fazendaId) {
    q = q.eq('fazenda_id', fazendaId)
  }
  const { data, error } = await q
  if (error) {
    console.warn(`[Backup] tabela "${table}":`, error.message)
    return []
  }
  return data || []
}

// Dispara download de um Blob no browser
const baixar = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

// Define larguras de colunas Excel
const wch = (...ws) => ws.map(w => ({ wch: w }))

// Formata timestamp para exibição
const tsAgora = () => new Date().toLocaleString('pt-BR')
const dateStr  = () => new Date().toISOString().split('T')[0]

// ── Card de backup ────────────────────────────────────────────────
function BackupCard({ icon, title, desc, bullet, stat, onClick, loading, lastTs, accent }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: 30, flexShrink: 0, lineHeight: 1 }}>{icon}</div>
        <div>
          <div className="card-title" style={{ marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: '.77rem', color: '#6B7280' }}>{desc}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14, flex: 1 }}>
        {bullet.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 4, fontSize: '.74rem', color: '#6B7280' }}>
            <span style={{ color: accent, flexShrink: 0, fontWeight: 700 }}>✓</span>{b}
          </div>
        ))}
      </div>

      {stat && (
        <div style={{ fontSize: '.74rem', color: '#9CA3AF', marginBottom: 12 }}>
          <i className="ti ti-database" style={{ fontSize: 11, marginRight: 4 }} />{stat}
        </div>
      )}

      <button
        className="btn btn-primary btn-sm"
        onClick={onClick}
        disabled={loading}
        style={{ width: '100%', background: accent, borderColor: accent, justifyContent: 'center' }}
      >
        {loading
          ? 'Gerando...'
          : <><i className="ti ti-download" /> Baixar {title}</>
        }
      </button>

      {lastTs && (
        <div style={{ fontSize: '.68rem', color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
          <i className="ti ti-check" style={{ fontSize: 11 }} /> Gerado em: {lastTs}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Backup() {
  const { contaAtual }   = useConta()
  const { fazendaAtual } = useFazenda()
  const { cicloAtual }   = useCiclo()
  const contaId    = contaAtual?.id || null
  const fazendaId  = fazendaAtual?.id || null

  const [counts,      setCounts]      = useState({ animais: 0, lancamentos: 0, pesagens: 0 })
  const [loadingJSON, setLoadingJSON] = useState(false)
  const [loadingAnim, setLoadingAnim] = useState(false)
  const [loadingFin,  setLoadingFin]  = useState(false)
  const [tsJSON,      setTsJSON]      = useState('')
  const [tsAnim,      setTsAnim]      = useState('')
  const [tsFin,       setTsFin]       = useState('')

  useEffect(() => {
    if (!contaId || !fazendaId) { setCounts({ animais: 0, lancamentos: 0, pesagens: 0 }); return }
    Promise.all([
      supabase.from('animais').select('*', { count: 'exact', head: true }).eq('conta_id', contaId).eq('fazenda_id', fazendaId),
      supabase.from('lancamentos_financeiros').select('*', { count: 'exact', head: true }).eq('conta_id', contaId).eq('fazenda_id', fazendaId),
      supabase.from('pesagens').select('*', { count: 'exact', head: true }).eq('conta_id', contaId).eq('fazenda_id', fazendaId),
    ]).then(([rA, rL, rP]) =>
      setCounts({ animais: rA.count || 0, lancamentos: rL.count || 0, pesagens: rP.count || 0 })
    )
  }, [contaId, fazendaId])

  // ── Backup JSON ─────────────────────────────────────────────────
  const gerarJSON = async () => {
    if (!contaId || !fazendaId) { toast('Aguarde a fazenda carregar e tente novamente.', 'error'); return }
    setLoadingJSON(true)
    try {
      const [
        proprietarios, fazendas, piquetes, lotes,
        animais, lotes_inseminacao, inseminacoes, partos, abortos,
        pesagens, procedimentos_sanitarios,
        estoque_itens, estoque_movimentacoes,
        lancamentos_financeiros, transacoes_animais,
        ciclos_financeiros, categorias_preco, metas
      ] = await Promise.all([
        safeQ('proprietarios', contaId, fazendaId),
        // "fazendas" não tem coluna fazenda_id (é a própria fazenda) — filtra
        // pelo id da fazenda atual, para exportar só a linha dela.
        safeQ('fazendas', contaId, fazendaId, { porId: true }),
        safeQ('piquetes', contaId, fazendaId),
        safeQ('lotes', contaId, fazendaId),
        safeQ('animais', contaId, fazendaId),
        safeQ('lotes_inseminacao', contaId, fazendaId),
        safeQ('inseminacoes', contaId, fazendaId),
        safeQ('partos', contaId, fazendaId),
        safeQ('abortos', contaId, fazendaId),
        safeQ('pesagens', contaId, fazendaId),
        safeQ('procedimentos_sanitarios', contaId, fazendaId),
        safeQ('estoque_itens', contaId, fazendaId),
        safeQ('estoque_movimentacoes', contaId, fazendaId),
        safeQ('lancamentos_financeiros', contaId, fazendaId),
        safeQ('transacoes_animais', contaId, fazendaId),
        safeQ('ciclos_financeiros', contaId, fazendaId),
        safeQ('categorias_preco', contaId, fazendaId),
        safeQ('metas', contaId, fazendaId),
      ])

      const payload = {
        data_backup: new Date().toISOString(),
        versao:      '1.0',
        sistema:     'DigitalBov',
        totais: {
          animais:            animais.length,
          lancamentos:        lancamentos_financeiros.length,
          pesagens:           pesagens.length,
          procedimentos:      procedimentos_sanitarios.length,
          estoque_itens:      estoque_itens.length,
        },
        dados: {
          proprietarios, fazendas, piquetes, lotes,
          animais, lotes_inseminacao, inseminacoes, partos, abortos,
          pesagens, procedimentos_sanitarios,
          estoque_itens, estoque_movimentacoes,
          lancamentos_financeiros, transacoes_animais,
          ciclos_financeiros, categorias_preco, metas,
        }
      }

      baixar(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        `backup-ventos-varzea-${dateStr()}.json`
      )
      setTsJSON(tsAgora())
      toast(`Backup gerado! ${animais.length} animais · ${lancamentos_financeiros.length} lançamentos · ${pesagens.length} pesagens`)
    } catch (e) {
      toast('Erro ao gerar backup: ' + e.message, 'error')
    }
    setLoadingJSON(false)
  }

  // ── Exportar animais Excel ───────────────────────────────────────
  // xlsx é lazy (import dinâmico): só baixa os ~140kB gzip quando o usuário
  // de fato clica em exportar, não em toda visita à tela de Backup.
  const exportarAnimais = async () => {
    if (!contaId || !fazendaId) { toast('Aguarde a fazenda carregar e tente novamente.', 'error'); return }
    setLoadingAnim(true)
    try {
      const XLSX = await import('xlsx')
      const { data: animais } = await supabase
        .from('animais')
        .select('*, proprietario:proprietarios(nome), lote:lotes(nome)')
        .eq('conta_id', contaId)
        .eq('fazenda_id', fazendaId)
        .order('brinco')

      const rows = (animais || []).map(a => ({
        'Brinco':           a.brinco,
        'Sexo':             a.sexo === 'F' ? 'Fêmea' : 'Macho',
        'Nascimento':       a.data_nascimento || '',
        'Categoria':        calcCategoria(a.data_nascimento, a.sexo),
        'Raça':             a.raca || '',
        'Pelagem':          a.pelagem || '',
        'Pai':              a.pai || '',
        'Mãe (brinco)':    a.mae_brinco || '',
        'Proprietário':     a.proprietario?.nome || '',
        'Lote':             a.lote?.nome || '',
        'Situação':         a.situacao || '',
        'Sit. Reprodutiva': a.sit_reprodutiva || '',
        'Observações':      a.observacoes || '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = wch(9, 8, 13, 14, 10, 10, 18, 9, 22, 14, 10, 16, 35)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Animais')
      XLSX.writeFile(wb, `animais-ventos-varzea-${dateStr()}.xlsx`)

      setTsAnim(tsAgora())
      toast(`${rows.length} animais exportados para Excel!`)
    } catch (e) {
      toast('Erro ao exportar: ' + e.message, 'error')
    }
    setLoadingAnim(false)
  }

  // ── Exportar financeiro Excel ────────────────────────────────────
  const exportarFinanceiro = async () => {
    if (!contaId || !fazendaId) { toast('Aguarde a fazenda carregar e tente novamente.', 'error'); return }
    setLoadingFin(true)
    try {
      const XLSX = await import('xlsx')
      // Ciclo atual POR DATA (CicloContext), já escopado à fazenda atual —
      // em vez do antigo .eq('atual', true) sem escopo de fazenda/conta.
      const ciclo = cicloAtual

      if (!ciclo) {
        toast('Nenhum ciclo financeiro atual (por data) encontrado para esta fazenda.', 'error')
        setLoadingFin(false)
        return
      }

      const { data: lancs } = await supabase
        .from('lancamentos_financeiros')
        .select('*')
        .eq('conta_id', contaId)
        .eq('fazenda_id', fazendaId)
        .eq('ciclo_id', ciclo.id)
        .order('data', { ascending: true })

      const rows = (lancs || []).map(l => ({
        'Data':       l.data || '',
        'Tipo':       l.tipo || '',
        'Grupo':      l.grupo || '',
        'Descrição':  l.descricao || '',
        'Valor (R$)': parseFloat(l.valor || 0),
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = wch(13, 10, 18, 35, 14)
      const wb = XLSX.utils.book_new()
      // Excel sheet name: máx 31 chars
      const sheetName = `Ciclo ${ciclo.nome}`.substring(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)

      const slug = ciclo.nome.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      XLSX.writeFile(wb, `financeiro-${slug}-${dateStr()}.xlsx`)

      setTsFin(tsAgora())
      toast(`${rows.length} lançamentos do ciclo "${ciclo.nome}" exportados!`)
    } catch (e) {
      toast('Erro ao exportar: ' + e.message, 'error')
    }
    setLoadingFin(false)
  }

  return (
    <div>
      {/* Banner de recomendação */}
      <div style={{
        background: '#E8F0FC', border: '.5px solid #A5C8F5',
        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        display: 'flex', gap: 12, alignItems: 'flex-start'
      }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#2B6CD9', marginBottom: 4 }}>
            Boas práticas de backup
          </div>
          <div style={{ fontSize: '.80rem', color: '#1E55B0', lineHeight: 1.65 }}>
            Recomendamos baixar o <strong>Backup Completo</strong> pelo menos uma vez por mês e guardar em local seguro — Google Drive, e-mail ou pen drive.
            O arquivo <strong>.json</strong> contém <em>todos os dados do sistema</em> e pode ser usado para restauração em caso de necessidade.
          </div>
        </div>
      </div>

      {/* Cards de exportação */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14, marginBottom: 24 }}>
        <BackupCard
          icon="🗄️"
          title="Backup Completo (JSON)"
          desc="Exporta todos os dados do sistema em um único arquivo estruturado e restaurável."
          bullet={[
            'Animais, proprietários, lotes e fazendas',
            'Reprodutivo: inseminações e partos',
            'Pesagens e sanidade animal',
            'Estoque e movimentações',
            'Financeiro completo e ciclos',
            'Metas e configurações',
          ]}
          stat={
            counts.animais > 0
              ? `~${counts.animais} animais · ~${counts.lancamentos} lançamentos · ~${counts.pesagens} pesagens`
              : undefined
          }
          onClick={gerarJSON}
          loading={loadingJSON}
          lastTs={tsJSON}
          accent="#2B6CD9"
        />

        <BackupCard
          icon="🐄"
          title="Exportar Animais (Excel)"
          desc="Lista completa do rebanho em planilha .xlsx, incluindo animais inativos."
          bullet={[
            'Todos os animais (ativos, vendidos e mortos)',
            'Categoria calculada automaticamente',
            'Genealogia: pai e mãe cadastrados',
            'Proprietário, lote e situação reprodutiva',
          ]}
          stat={counts.animais > 0 ? `${counts.animais} animais no cadastro` : undefined}
          onClick={exportarAnimais}
          loading={loadingAnim}
          lastTs={tsAnim}
          accent="#0C447C"
        />

        <BackupCard
          icon="💰"
          title="Exportar Financeiro (Excel)"
          desc="Lançamentos do ciclo financeiro atual em planilha .xlsx para análise."
          bullet={[
            'Todos os lançamentos do ciclo atual',
            'Receitas e despesas separadas por tipo',
            'Agrupamento por categoria de despesa',
            'Ordenado por data',
          ]}
          stat={counts.lancamentos > 0 ? `${counts.lancamentos} lançamentos no ciclo atual` : undefined}
          onClick={exportarFinanceiro}
          loading={loadingFin}
          lastTs={tsFin}
          accent="#633806"
        />
      </div>

      {/* Aviso sobre restauração */}
      <div style={{
        padding: '14px 18px', background: '#F9FAFB',
        borderRadius: 12, border: '.5px solid #E5E7EB'
      }}>
        <div style={{ fontWeight: 600, fontSize: '.83rem', color: '#374151', marginBottom: 6 }}>
          <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
          Sobre os formatos de exportação
        </div>
        <div style={{ fontSize: '.76rem', color: '#6B7280', lineHeight: 1.7 }}>
          <strong>.json (Backup Completo):</strong> Contém todos os dados em formato técnico, ideal para restauração do sistema. Guarde com segurança.<br />
          <strong>.xlsx (Excel):</strong> Ideal para análise, impressão e compartilhamento com parceiros ou contadores. Não pode ser reimportado automaticamente no sistema.
        </div>
      </div>
    </div>
  )
}
