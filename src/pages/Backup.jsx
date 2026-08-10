import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { calcCategoria, nomePai } from '../lib/helpers'
import { toast } from '../components/UI'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo } from '../lib/CicloContext'
import { usePermissoes } from '../lib/PermissoesContext'
import RestaurarBackup from '../components/RestaurarBackup'
import { gerarBackupPayload, baixarBlob as baixar } from '../lib/exportarBackup'

// ── Helpers ───────────────────────────────────────────────────────

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
  const { ehAdmin }      = usePermissoes()
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
  // Cobertura completa (Bloco D10): todas as 25 tabelas que guardam dado de
  // FAZENDA (mapeadas lendo T()/supabase.js inteiro, não só o que já estava
  // aqui) — as 17 originais + as 8 que faltavam (rateios, detalhe de compra/
  // venda por animal, vínculo sanidade↔animal, touros extras da monta
  // natural, estações de monta, planejamento e simulações). De propósito NÃO
  // inclui: benchmarks_rentabilidade (referência global, não é dado desta
  // fazenda — tabela está VAZIA hoje, conferido ao vivo em 2026-08-09, então
  // não há nada a perder numa restauração NESTE MOMENTO; mas `excluir_fazenda`
  // já apaga essa tabela com WHERE fazenda_id = p_fazenda_id, o que sugere
  // escopo por fazenda — se um dia passar a ser populada por fazenda, essa
  // exclusão do backup precisa ser revisada, não só assumida como ainda
  // correta) nem contas/conta_membros/usuario_permissoes/usuario_fazendas
  // (dado de CONTA/usuário, não de fazenda — vazaria gente de fora do escopo
  // de um backup de fazenda). Todas filtradas por conta_id + fazenda_id como
  // as demais — as 4 mais novas (lancamento_rateios, lote_touros,
  // estacoes_monta, sanidade_animais) não têm CREATE TABLE rastreado nos
  // migration_*.sql deste repo (foram criadas direto no Supabase), mas T()
  // em supabase.js já as usa com .eq('conta_id',...)/.eq('fazenda_id',...)
  // sem erro em produção — confirma que a coluna existe em todas.
  const gerarJSON = async () => {
    if (!contaId || !fazendaId) { toast('Aguarde a fazenda carregar e tente novamente.', 'error'); return }
    setLoadingJSON(true)
    try {
      // gerarBackupPayload (lib/exportarBackup.js) — mesma função usada pelo
      // "backup de segurança" oferecido antes de uma restauração total, pra
      // nunca divergir em quais tabelas/colunas entram no arquivo.
      const payload = await gerarBackupPayload({
        contaId, fazendaId, contaNome: contaAtual?.nome, fazendaNome: fazendaAtual?.nome,
      })

      baixar(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        `backup-ventos-varzea-${dateStr()}.json`
      )
      setTsJSON(tsAgora())
      toast(`Backup gerado! ${payload.dados.animais.length} animais · ${payload.dados.lancamentos_financeiros.length} lançamentos · ${payload.dados.pesagens.length} pesagens`)
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
        .select('*, proprietario:proprietarios(nome), lote:lotes(nome), pai_animal:animais!pai_animal_id(id,brinco,nome), pai_externo:touros_externos(id,nome)')
        .eq('conta_id', contaId)
        .eq('fazenda_id', fazendaId)
        .order('brinco')

      const rows = (animais || []).map(a => ({
        'Brinco':           a.brinco,
        'SISBOV':           a.sisbov || '',
        'Sexo':             a.sexo === 'F' ? 'Fêmea' : 'Macho',
        'Nascimento':       a.data_nascimento || '',
        'Categoria':        calcCategoria(a.data_nascimento, a.sexo),
        'Nº Registro':      a.numero_registro || '',
        'Classificação':    a.classificacao || '',
        'Raça':             a.raca || '',
        'Pelagem':          a.pelagem || '',
        // "Nome (Brinco)" quando o pai é um touro cadastrado — um dos 4
        // pontos genealógicos/documentais aprovados (Tarefa B.4): nome
        // sozinho pode ser ambíguo (animais.nome não tem UNIQUE).
        'Pai':              a.pai ? nomePai(a, { comBrinco: true }) : '',
        'Mãe (brinco)':    a.mae_brinco || '',
        'Proprietário':     a.proprietario?.nome || '',
        'Lote':             a.lote?.nome || '',
        'Situação':         a.situacao || '',
        'Sit. Reprodutiva': a.sit_reprodutiva || '',
        'Observações':      a.observacoes || '',
      }))

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = wch(9, 16, 8, 13, 14, 14, 16, 10, 10, 18, 9, 22, 14, 10, 16, 35)
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
            'Animais, proprietários, lotes e fazenda',
            'Reprodutivo: estações, lotes (com touros da monta natural), inseminações e partos',
            'Pesagens e sanidade (com o vínculo de cada procedimento aos animais)',
            'Estoque e movimentações',
            'Financeiro completo, com rateios, detalhe de compra/venda por animal e ciclos',
            'Metas, planejamento e simulações',
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

      {/* Restaurar backup — Fase 0 (só validação, ver RestaurarBackup.jsx).
          Só dono/admin: restauração mexe potencialmente com a fazenda
          inteira, mesmo nível de acesso do botão "Nova fazenda" em
          Propriedade. */}
      {ehAdmin && (
        <div style={{ marginTop: 20 }}>
          <RestaurarBackup />
        </div>
      )}
    </div>
  )
}
