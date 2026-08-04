import { useRef, useState } from 'react'
import { AlertBox, Badge, Field, toast, Confirm } from './UI'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { usePermissoes } from '../lib/PermissoesContext'
import { importarBackup } from '../lib/importarBackup'
import { gerarBackupPayload, baixarBackupJSON } from '../lib/exportarBackup'
import { useSubmitGuard } from '../lib/useSubmitGuard'
import { supabase } from '../lib/supabase'

// ── Fase 0 da restauração: VALIDA o arquivo no navegador — nenhuma chamada a
// supabase/banco acontece em validarArquivo()/onEscolherArquivo(). Fase 1
// (mais abaixo, iniciarImportacao) é quem de fato grava dados, só depois do
// arquivo passar 100% na validação e do usuário confirmar explicitamente.

const LABEL_TABELA = {
  __fazenda__: 'Fazenda',
  __seed__: 'Limpando categorias/ciclo/metas padrão da fazenda nova',
  proprietarios: 'Proprietários', piquetes: 'Piquetes', lotes: 'Lotes', ciclos_financeiros: 'Ciclos financeiros',
  categorias_preco: 'Categorias de preço', estacoes_monta: 'Estações de monta',
  animais: 'Animais', lotes_inseminacao: 'Lotes de inseminação/monta',
  lote_touros: 'Touros da monta natural', inseminacoes: 'Inseminações',
  partos: 'Partos', abortos: 'Abortos',
  lancamentos_financeiros: 'Lançamentos financeiros', lancamento_rateios: 'Rateios por proprietário',
  transacoes_animais: 'Transações de animais', transacao_animais_itens: 'Itens de compra/venda',
  pesagens: 'Pesagens', procedimentos_sanitarios: 'Procedimentos sanitários',
  sanidade_animais: 'Vínculo sanidade ↔ animal', estoque_itens: 'Itens de estoque',
  estoque_movimentacoes: 'Movimentações de estoque', metas: 'Metas',
  planejamentos: 'Planejamentos', planejamento_acoes: 'Ações de planejamento',
  simulacoes_transacoes: 'Simulações',
}

// Formato aceito — qualquer outro valor (ou ausente) é rejeitado antes de
// tentar ler a estrutura, porque um arquivo de versão diferente pode nem ter
// as mesmas tabelas/campos.
const FORMATO_RECONHECIDO = '2'

const TABELAS_ESPERADAS = [
  'proprietarios', 'fazendas', 'piquetes', 'lotes', 'animais', 'lotes_inseminacao',
  'inseminacoes', 'partos', 'abortos', 'pesagens', 'procedimentos_sanitarios',
  'estoque_itens', 'estoque_movimentacoes', 'lancamentos_financeiros',
  'transacoes_animais', 'ciclos_financeiros', 'categorias_preco', 'metas',
  'lancamento_rateios', 'transacao_animais_itens', 'sanidade_animais',
  'lote_touros', 'estacoes_monta', 'planejamentos', 'planejamento_acoes',
  'simulacoes_transacoes',
]

// [tabela de origem, campo FK, tabela alvo, é opcional/nullable]. Cobre toda
// referência interna que conhecemos do schema (ver Bloco D11 do manual /
// diagnóstico de restauração) — usada só para achar ÓRFÃOS dentro do próprio
// arquivo, nunca consulta o banco.
const REFERENCIAS = [
  ['animais', 'proprietario_id', 'proprietarios', true],
  ['animais', 'lote_id', 'lotes', true],
  ['lotes_inseminacao', 'ciclo_id', 'ciclos_financeiros', true],
  ['lotes_inseminacao', 'estacao_monta_id', 'estacoes_monta', true],
  ['lote_touros', 'lote_id', 'lotes_inseminacao', false],
  ['inseminacoes', 'lote_inseminacao_id', 'lotes_inseminacao', true],
  ['inseminacoes', 'animal_id', 'animais', true],
  ['partos', 'lote_inseminacao_id', 'lotes_inseminacao', true],
  ['partos', 'mae_id', 'animais', true],
  ['partos', 'bezerro_id', 'animais', true],
  ['partos', 'ciclo_id', 'ciclos_financeiros', true],
  ['abortos', 'animal_id', 'animais', true],
  ['abortos', 'ciclo_id', 'ciclos_financeiros', true],
  ['estacoes_monta', 'ciclo_id', 'ciclos_financeiros', true],
  ['pesagens', 'animal_id', 'animais', true],
  ['pesagens', 'transacao_id', 'transacoes_animais', true],
  ['sanidade_animais', 'procedimento_id', 'procedimentos_sanitarios', false],
  ['sanidade_animais', 'animal_id', 'animais', false],
  ['estoque_movimentacoes', 'item_id', 'estoque_itens', true],
  ['estoque_movimentacoes', 'procedimento_id', 'procedimentos_sanitarios', true],
  ['lancamentos_financeiros', 'ciclo_id', 'ciclos_financeiros', true],
  ['lancamentos_financeiros', 'lancamento_origem_id', 'lancamentos_financeiros', true],
  ['lancamento_rateios', 'lancamento_id', 'lancamentos_financeiros', false],
  ['lancamento_rateios', 'proprietario_id', 'proprietarios', true],
  ['transacoes_animais', 'lancamento_id', 'lancamentos_financeiros', true],
  ['transacoes_animais', 'ciclo_id', 'ciclos_financeiros', true],
  ['transacao_animais_itens', 'transacao_id', 'transacoes_animais', false],
  ['transacao_animais_itens', 'animal_id', 'animais', true],
  ['planejamento_acoes', 'planejamento_id', 'planejamentos', false],
]

function validarArquivo(payload) {
  const erros = []       // impede prosseguir
  const avisos = []      // informativo, não impede
  const orfas = []       // { tabela, campo, id_registro, valor_orfao, tabela_alvo }
  const divergencias = [] // { tabela, contagens, real }

  // 1. Formato reconhecido
  const versao = payload?.formato_versao
  if (versao !== FORMATO_RECONHECIDO) {
    erros.push(
      versao
        ? `Formato de backup não reconhecido: versão "${versao}". Este validador só entende a versão "${FORMATO_RECONHECIDO}".`
        : 'Este arquivo não tem "formato_versao" — é um backup antigo (anterior ao cabeçalho de metadados) ou não é um backup do DigitalBov. Gere um backup novo antes de tentar restaurar.'
    )
    return { integro: false, erros, avisos, orfas, divergencias, meta: null }
  }

  // 2. Estrutura mínima
  if (!payload.dados || typeof payload.dados !== 'object') {
    erros.push('O arquivo não tem a seção "dados" esperada — está corrompido ou incompleto.')
    return { integro: false, erros, avisos, orfas, divergencias, meta: null }
  }
  if (!payload.contagens || typeof payload.contagens !== 'object') {
    erros.push('O arquivo não tem a seção "contagens" esperada — está corrompido ou incompleto.')
    return { integro: false, erros, avisos, orfas, divergencias, meta: null }
  }

  // 3. Tabelas esperadas presentes (falta = erro; sobra = aviso, pode ser uma versão mais nova)
  const tabelasNoArquivo = Object.keys(payload.dados)
  const faltando = TABELAS_ESPERADAS.filter(t => !tabelasNoArquivo.includes(t))
  const extras   = tabelasNoArquivo.filter(t => !TABELAS_ESPERADAS.includes(t))
  if (faltando.length > 0) {
    erros.push(`Faltam tabelas no arquivo: ${faltando.join(', ')}.`)
  }
  if (extras.length > 0) {
    avisos.push(`O arquivo tem tabelas que este validador não conhece: ${extras.join(', ')} (ignoradas na checagem).`)
  }

  // 4. contagens vs dados real
  for (const t of tabelasNoArquivo) {
    const real = Array.isArray(payload.dados[t]) ? payload.dados[t].length : null
    const declarado = payload.contagens[t]
    if (real === null) {
      erros.push(`A tabela "${t}" não é uma lista válida no arquivo.`)
      continue
    }
    if (typeof declarado !== 'number') {
      avisos.push(`Não há contagem declarada para "${t}" — não dá para conferir essa tabela.`)
      continue
    }
    if (declarado !== real) {
      divergencias.push({ tabela: t, contagens: declarado, real })
    }
  }
  if (divergencias.length > 0) {
    erros.push(`${divergencias.length} tabela(s) com contagem divergente do que está de fato no arquivo — sinal de arquivo adulterado ou truncado.`)
  }

  // 5. Integridade referencial interna
  for (const [tabela, campo, alvo, opcional] of REFERENCIAS) {
    const linhas = payload.dados[tabela]
    const linhasAlvo = payload.dados[alvo]
    if (!Array.isArray(linhas) || !Array.isArray(linhasAlvo)) continue // já reportado acima
    const idsAlvo = new Set(linhasAlvo.map(r => r.id))
    linhas.forEach(row => {
      const valor = row[campo]
      if (valor === null || valor === undefined) {
        if (!opcional) orfas.push({ tabela, campo, id_registro: row.id, valor_orfao: '(vazio)', tabela_alvo: alvo, motivo: 'campo obrigatório vazio' })
        return
      }
      if (!idsAlvo.has(valor)) {
        orfas.push({ tabela, campo, id_registro: row.id, valor_orfao: valor, tabela_alvo: alvo, motivo: 'não encontrado' })
      }
    })
  }
  if (orfas.length > 0) {
    erros.push(`${orfas.length} referência(s) interna(s) quebrada(s) encontrada(s) — o arquivo aponta para registros que não existem nele mesmo.`)
  }

  const dados = payload.dados
  const meta = {
    conta: payload.conta?.nome || payload.conta?.id || '—',
    fazenda: payload.fazenda?.nome || payload.fazenda?.id || '—',
    data_backup: payload.data_backup || null,
    resumo: `Este backup contém ${dados.animais?.length ?? 0} animais, ${dados.lancamentos_financeiros?.length ?? 0} lançamentos financeiros e ${dados.pesagens?.length ?? 0} pesagens, gerado em ${payload.data_backup ? new Date(payload.data_backup).toLocaleString('pt-BR') : 'data desconhecida'} a partir da fazenda "${payload.fazenda?.nome || '—'}".`,
  }

  return { integro: erros.length === 0, erros, avisos, orfas, divergencias, meta, tabelasNoArquivo }
}

export default function RestaurarBackup() {
  const inputRef = useRef(null)
  const { contaAtual } = useConta()
  const { fazendaAtual } = useFazenda()
  const { ehAdmin } = usePermissoes()

  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado]   = useState(null)
  const [payload, setPayload]       = useState(null) // arquivo bruto validado — só isto alimenta a Fase 1
  const [nomeArquivo, setNomeArquivo] = useState('')

  // ── Fase 1 — importação para fazenda NOVA ────────────────────────
  const [nomeFazendaNovo, setNomeFazendaNovo] = useState('')
  const [importando, setImportando]           = useState(false)
  const [progresso, setProgresso]             = useState([]) // [{tabela, status, esperado, importado}]
  const [relatorioFinal, setRelatorioFinal]   = useState(null)
  // Confirmação via <Confirm> do app em vez de window.confirm() nativo
  // (padronização — ação de maior risco desta tela, texto diz exatamente o
  // que vai ser criado/gravado antes do clique final).
  const [confirmImportar, setConfirmImportar] = useState(null) // { nAnimais, nLancs }

  // ── Restauração TOTAL sobre a fazenda ATUAL (segundo modo — mesmo
  // validarArquivo/payload da importação acima, nada de parser paralelo) ──
  const guardRestaurar = useSubmitGuard()
  const [nomeConfirmacao, setNomeConfirmacao] = useState('')
  const [baixandoSeguranca, setBaixandoSeguranca] = useState(false)
  const [backupSegurancaOk, setBackupSegurancaOk] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [resultadoRestauracao, setResultadoRestauracao] = useState(null) // { sucesso, erro }

  const onEscolherArquivo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo depois
    if (!file) return
    setNomeArquivo(file.name)
    setResultado(null)
    setPayload(null)
    setRelatorioFinal(null)
    setProgresso([])
    setNomeConfirmacao('')
    setBackupSegurancaOk(false)
    setResultadoRestauracao(null)
    setAnalisando(true)

    const reader = new FileReader()
    reader.onload = (ev) => {
      let p
      try {
        p = JSON.parse(ev.target.result)
      } catch {
        setResultado({ integro: false, erros: ['O arquivo não é um JSON válido.'], avisos: [], orfas: [], divergencias: [], meta: null })
        setAnalisando(false)
        return
      }
      const r = validarArquivo(p)
      setResultado(r)
      if (r.integro) {
        setPayload(p)
        setNomeFazendaNovo(`${p.fazenda?.nome || 'Fazenda'} (restaurado)`)
      }
      setAnalisando(false)
    }
    reader.onerror = () => {
      setResultado({ integro: false, erros: ['Não foi possível ler o arquivo.'], avisos: [], orfas: [], divergencias: [], meta: null })
      setAnalisando(false)
    }
    reader.readAsText(file)
  }

  const aoProgredir = (ev) => {
    setProgresso(prev => {
      const idx = prev.findIndex(p => p.tabela === ev.tabela)
      if (idx === -1) return [...prev, ev]
      const novo = [...prev]
      novo[idx] = { ...novo[idx], ...ev }
      return novo
    })
  }

  const iniciarImportacao = () => {
    if (!ehAdmin || !payload) return
    if (!nomeFazendaNovo.trim()) { toast('Informe o nome da fazenda nova.', 'error'); return }
    if (!contaAtual?.id) { toast('Conta não identificada — recarregue a página.', 'error'); return }
    const nAnimais = payload.dados?.animais?.length ?? 0
    const nLancs   = payload.dados?.lancamentos_financeiros?.length ?? 0
    setConfirmImportar({ nAnimais, nLancs })
  }

  const executarImportacao = async () => {
    setConfirmImportar(null)
    setImportando(true)
    setRelatorioFinal(null)
    setProgresso([])
    const relatorio = await importarBackup(payload, { contaId: contaAtual.id, nomeFazenda: nomeFazendaNovo.trim() }, aoProgredir)
    setRelatorioFinal(relatorio)
    setImportando(false)
  }

  // O backup do arquivo carregado é de exatamente esta fazenda/conta? A
  // função no banco já barra qualquer divergência antes de apagar algo, mas
  // checar aqui também evita uma chamada fadada a falhar e explica o motivo
  // sem precisar rodar nada.
  const backupBateComFazendaAtual = !!payload && !!fazendaAtual &&
    payload.fazenda?.id === fazendaAtual.id && payload.conta?.id === contaAtual?.id

  // Baixa um backup do estado ATUAL da fazenda-alvo (mesma gerarBackupPayload
  // usada em Backup.jsx — nunca uma segunda cópia da lógica de exportação)
  // antes de liberar a restauração — é a rede de segurança do usuário caso
  // ele mude de ideia depois.
  const baixarBackupDeSeguranca = async () => {
    if (!contaAtual?.id || !fazendaAtual?.id) return
    setBaixandoSeguranca(true)
    try {
      const atual = await gerarBackupPayload({
        contaId: contaAtual.id, fazendaId: fazendaAtual.id,
        contaNome: contaAtual.nome, fazendaNome: fazendaAtual.nome,
      })
      baixarBackupJSON(atual, `backup-seguranca-${fazendaAtual.nome.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`)
      setBackupSegurancaOk(true)
      toast('Backup de segurança do estado atual baixado.')
    } catch (e) {
      toast('Erro ao gerar o backup de segurança: ' + e.message, 'error')
    }
    setBaixandoSeguranca(false)
  }

  // guardRestaurar (useSubmitGuard) trava reentrância — duplo clique aqui
  // chamaria a RPC destrutiva duas vezes em paralelo, o que é exatamente o
  // cenário que a função no banco não protege sozinha (ela é atômica POR
  // CHAMADA, não contra chamadas simultâneas).
  const executarRestauracaoTotal = () => guardRestaurar(async () => {
    if (!ehAdmin || !payload || !fazendaAtual?.id) return
    if (!backupBateComFazendaAtual) { toast('Este backup não é desta fazenda/conta — restauração bloqueada.', 'error'); return }
    if (!backupSegurancaOk) { toast('Baixe o backup de segurança do estado atual antes de restaurar.', 'error'); return }
    if (nomeConfirmacao.trim() !== fazendaAtual.nome) { toast('Digite o nome da fazenda exatamente como mostrado para confirmar.', 'error'); return }
    setRestaurando(true)
    setResultadoRestauracao(null)
    const { data, error } = await supabase.rpc('restaurar_backup_fazenda', { p_fazenda_id: fazendaAtual.id, p_backup: payload })
    setRestaurando(false)
    if (error) {
      setResultadoRestauracao({ sucesso: false, erro: error.message })
      return
    }
    setResultadoRestauracao({ sucesso: true, ...data })
  })

  return (
    <div className="card" style={{ borderTop: '3px solid #7B2FBE' }}>
      <div className="card-title"><i className="ti ti-database-import" /> Restaurar backup (validação)</div>

      <AlertBox type="green" icon="ti-shield-check"
        title="Nada é gravado nesta etapa"
        body="Esta tela só lê e analisa o arquivo dentro do seu navegador — nenhuma informação é enviada ao banco de dados ou alterada no sistema aqui. É só um raio-x do arquivo antes de qualquer restauração de verdade." />

      <div style={{ marginTop: 14, marginBottom: 14 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={analisando || importando}>
          <i className="ti ti-file-upload" /> {analisando ? 'Analisando...' : 'Escolher arquivo .json'}
        </button>
        <input ref={inputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onEscolherArquivo} />
        {nomeArquivo && <span style={{ marginLeft: 10, fontSize: '.78rem', color: '#6B7280' }}>{nomeArquivo}</span>}
      </div>

      {resultado && (
        <div>
          {!resultado.integro && (
            <AlertBox type="red" icon="ti-alert-triangle"
              title="Este arquivo não pode ser usado"
              body={`Encontrado(s) ${resultado.erros.length} problema(s) — veja a lista abaixo. Nenhum botão de restauração aparece enquanto isso não for corrigido (normalmente significa gerar um backup novo).`} />
          )}

          {resultado.meta && (
            <div style={{ background: '#F9FAFB', border: '.5px solid #E5E7EB', borderRadius: 10, padding: '12px 14px', margin: '12px 0', fontSize: '.85rem', color: '#374151', lineHeight: 1.7 }}>
              {resultado.meta.resumo}<br />
              <span style={{ color: '#9CA3AF', fontSize: '.78rem' }}>
                Conta de origem: {resultado.meta.conta} · Fazenda de origem: {resultado.meta.fazenda}
              </span>
            </div>
          )}

          {resultado.erros.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: '.83rem', color: '#791F1F', marginBottom: 6 }}>Problemas encontrados</div>
              <ul style={{ fontSize: '.82rem', color: '#791F1F', lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
                {resultado.erros.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {resultado.divergencias?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: '.83rem', color: '#791F1F', marginBottom: 6 }}>Contagem declarada × real</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Tabela</th><th style={{ textAlign: 'right' }}>Declarado</th><th style={{ textAlign: 'right' }}>Encontrado</th></tr></thead>
                  <tbody>
                    {resultado.divergencias.map((d, i) => (
                      <tr key={i}><td>{d.tabela}</td><td style={{ textAlign: 'right' }}>{d.contagens}</td><td style={{ textAlign: 'right', color: '#791F1F', fontWeight: 600 }}>{d.real}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {resultado.orfas?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: '.83rem', color: '#791F1F', marginBottom: 6 }}>
                Referências quebradas ({resultado.orfas.length})
              </div>
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Tabela</th><th>Campo</th><th>Registro (id)</th><th>Aponta para</th><th>Valor</th></tr></thead>
                  <tbody>
                    {resultado.orfas.slice(0, 100).map((o, i) => (
                      <tr key={i}>
                        <td>{o.tabela}</td><td>{o.campo}</td>
                        <td style={{ fontSize: '.72rem', color: '#9CA3AF' }}>{o.id_registro}</td>
                        <td>{o.tabela_alvo}</td>
                        <td style={{ fontSize: '.72rem' }}>{String(o.valor_orfao)} ({o.motivo})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {resultado.orfas.length > 100 && (
                <div style={{ fontSize: '.72rem', color: '#9CA3AF', marginTop: 4 }}>Mostrando as primeiras 100 de {resultado.orfas.length}.</div>
              )}
            </div>
          )}

          {resultado.avisos?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {resultado.avisos.map((a, i) => (
                <AlertBox key={i} type="amber" icon="ti-info-circle" body={a} />
              ))}
            </div>
          )}

          {resultado.integro && (
            <div>
              <AlertBox type="green" icon="ti-circle-check"
                title="Arquivo íntegro"
                body="Passou em todas as checagens: formato reconhecido, contagens batem, nenhuma referência quebrada." />

              {!importando && !relatorioFinal && (
                <div style={{ marginTop: 12 }}>
                  <AlertBox type="amber" icon="ti-plus"
                    title="A importação cria uma FAZENDA NOVA — nunca sobrescreve nada"
                    body='Nada existente é apagado ou alterado. Todo o conteúdo do arquivo entra numa fazenda vazia criada agora, na sua conta atual — com IDs novos para tudo. A única exceção: a fazenda nova já nasce com categorias de preço, ciclo atual e metas padrão do sistema — esses 3 conjuntos padrão são removidos antes de entrar os do arquivo (senão duplicaria), mas isso acontece SÓ nessa fazenda recém-criada, vazia, antes de qualquer outro dado entrar nela. Se algo der errado no meio do caminho, a fazenda criada até aquele ponto fica disponível pra você excluir manualmente e tentar de novo (nada é desfeito automaticamente).' />
                  <div style={{ maxWidth: 420, marginTop: 10 }}>
                    <Field label="Nome da fazenda nova" required>
                      <input value={nomeFazendaNovo} onChange={e => setNomeFazendaNovo(e.target.value)} />
                    </Field>
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={iniciarImportacao}>
                    <i className="ti ti-database-import" /> Importar para fazenda nova
                  </button>
                </div>
              )}

              {(importando || relatorioFinal) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: '.83rem', color: '#374151', marginBottom: 8 }}>
                    {importando ? 'Importando...' : relatorioFinal.sucesso ? 'Importação concluída' : 'Importação parou'}
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
                    <table>
                      <thead><tr><th></th><th>Etapa</th><th style={{ textAlign: 'right' }}>Esperado</th><th style={{ textAlign: 'right' }}>Importado</th></tr></thead>
                      <tbody>
                        {progresso.map((p, i) => (
                          <tr key={i}>
                            <td>{p.status === 'ok' ? '✅' : p.status === 'erro' ? '❌' : '⏳'}</td>
                            <td>{LABEL_TABELA[p.tabela] || p.tabela}</td>
                            <td style={{ textAlign: 'right' }}>{p.esperado ?? '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: p.status === 'erro' ? 700 : 400, color: p.status === 'erro' ? '#791F1F' : undefined }}>
                              {p.importado ?? 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {relatorioFinal && !relatorioFinal.sucesso && (
                    <AlertBox type="red" icon="ti-alert-triangle" title="Parou antes de terminar" body={
                      relatorioFinal.fazendaCriada
                        ? `${relatorioFinal.erro} A fazenda "${relatorioFinal.fazendaCriada.nome}" já foi criada com os dados que entraram até aqui — nada foi desfeito automaticamente. Vá em Propriedade, exclua essa fazenda manualmente e tente a importação de novo.`
                        : `${relatorioFinal.erro} Nenhuma fazenda chegou a ser criada.`
                    } />
                  )}

                  {relatorioFinal?.sucesso && (
                    <AlertBox type="green" icon="ti-circle-check" title="Tudo importado"
                      body={`Fazenda "${relatorioFinal.fazendaCriada?.nome}" criada com todos os dados do arquivo. Confira a coluna "Importado" acima — deve bater exatamente com "Esperado" em cada linha.`} />
                  )}
                </div>
              )}

              {/* Restauração TOTAL sobre a fazenda ATUAL — segundo modo, ao
                  lado do de fazenda nova acima, reaproveitando o MESMO
                  payload/validarArquivo (nada de parser paralelo). Some
                  quando já está restaurando/concluído acima só pra não
                  confundir com dois blocos de progresso na tela ao mesmo
                  tempo — mas os dois modos continuam independentes. */}
              {!importando && !relatorioFinal && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '.5px solid #E5E7EB' }}>
                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#791F1F', marginBottom: 8 }}>
                    <i className="ti ti-replace" /> Restaurar TUDO sobre a fazenda atual{fazendaAtual?.nome ? ` (${fazendaAtual.nome})` : ''}
                  </div>

                  {!backupBateComFazendaAtual ? (
                    <AlertBox type="amber" icon="ti-info-circle"
                      title="Este backup não é desta fazenda"
                      body={`Este arquivo é da fazenda "${payload.fazenda?.nome || '—'}". Para restaurar TUDO sobre a fazenda atual, troque para "${payload.fazenda?.nome || 'a fazenda de origem'}" no seletor do topo e volte aqui — ou use "Importar para fazenda nova" acima.`} />
                  ) : (restaurando || resultadoRestauracao) ? (
                    <div>
                      {restaurando && (
                        <AlertBox type="amber" icon="ti-loader" title="Restaurando — não feche esta aba"
                          body="Apagando e regravando os dados da fazenda numa única operação atômica no banco. Não deve demorar mais que alguns segundos." />
                      )}
                      {resultadoRestauracao && !resultadoRestauracao.sucesso && (
                        <AlertBox type="red" icon="ti-alert-triangle" title="Restauração abortada — nada foi alterado"
                          body={`O banco recusou a operação antes de apagar qualquer coisa: ${resultadoRestauracao.erro}`} />
                      )}
                      {resultadoRestauracao?.sucesso && (
                        <div>
                          <AlertBox type="green" icon="ti-circle-check" title="Restauração concluída"
                            body={`A fazenda "${fazendaAtual.nome}" foi completamente substituída pelo conteúdo do arquivo. Recarregue a página para ver os dados atualizados em todas as telas.`} />
                          <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>
                            <i className="ti ti-refresh" /> Recarregar página
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <AlertBox type="red" icon="ti-alert-triangle"
                        title="Isto é IRREVERSÍVEL"
                        body={`TODO o conteúdo atual da fazenda "${fazendaAtual?.nome}" (animais, financeiro, reprodutivo, estoque, sanidade — tudo) será apagado e substituído pelo que está neste arquivo. Não há como desfazer depois de confirmado.`} />
                      <AlertBox type="amber" icon="ti-photo"
                        body="A foto da fazenda não faz parte do backup — se a foto for trocada depois deste arquivo, restaurar não traz a foto antiga de volta." />

                      <div style={{ marginTop: 10 }}>
                        <button className="btn btn-secondary btn-sm" onClick={baixarBackupDeSeguranca} disabled={baixandoSeguranca}>
                          <i className="ti ti-download" /> {baixandoSeguranca ? 'Gerando...' : backupSegurancaOk ? 'Backup de segurança baixado ✓' : 'Baixar backup de segurança do estado atual'}
                        </button>
                      </div>

                      <div style={{ maxWidth: 420, marginTop: 12 }}>
                        <Field label={`Digite "${fazendaAtual?.nome}" para confirmar`} required>
                          <input value={nomeConfirmacao} onChange={e => setNomeConfirmacao(e.target.value)} disabled={!backupSegurancaOk} />
                        </Field>
                      </div>

                      <button className="btn btn-sm" style={{ marginTop: 10, background: '#791F1F', color: 'white' }}
                        onClick={executarRestauracaoTotal}
                        disabled={!backupSegurancaOk || nomeConfirmacao.trim() !== fazendaAtual?.nome}>
                        <i className="ti ti-alert-triangle" /> Apagar tudo e restaurar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <Confirm
        open={!!confirmImportar}
        onClose={() => setConfirmImportar(null)}
        onConfirm={executarImportacao}
        title="Importar backup para fazenda nova"
        message={confirmImportar && `Isto vai CRIAR uma fazenda nova chamada "${nomeFazendaNovo.trim()}" nesta conta e gravar nela ${confirmImportar.nAnimais} animais, ${confirmImportar.nLancs} lançamentos financeiros e o restante dos dados do arquivo. Nenhuma fazenda existente é alterada. Confirmar?`}
        danger
      />
    </div>
  )
}
