import { useRef, useState } from 'react'
import { AlertBox, Field, toast } from './UI'
import { useConta } from '../lib/ContaContext'
import { usePermissoes } from '../lib/PermissoesContext'
import { gerarBackupVeterinarioPayload } from '../lib/exportarBackupVeterinario'
import { baixarBackupJSON } from '../lib/exportarBackup'
import { useSubmitGuard } from '../lib/useSubmitGuard'
import { supabase } from '../lib/supabase'

// Espelha RestaurarBackup.jsx (fazenda), mas só com UM modo: restaurar sobre
// a CONTA atual. Não existe "importar para conta nova" aqui — diferente de
// fazenda (onde criar uma fazenda vazia pra testar/duplicar faz sentido),
// uma conta é o tenant inteiro do usuário; não há "conta nova" pra importar
// dentro da mesma sessão. Mesmo padrão de 2 fases: Fase 0 só lê/valida o
// arquivo no navegador, Fase 1 (RPC) é quem grava e é destrutiva.

const FORMATO_RECONHECIDO = '1'
const TIPO_ESPERADO = 'veterinario_conta'

const LABEL_TABELA = {
  veterinario_config: 'Configuração', veterinario_categorias: 'Categorias financeiras',
  veterinario_clientes: 'Clientes', veterinario_ciclos: 'Ciclos financeiros',
  veterinario_lancamentos: 'Lançamentos financeiros', veterinario_atestados: 'Atestados',
  veterinario_atestado_animais: 'Animais dos atestados',
}

const TABELAS_ESPERADAS = [
  'veterinario_config', 'veterinario_categorias', 'veterinario_clientes',
  'veterinario_ciclos', 'veterinario_lancamentos', 'veterinario_atestados',
  'veterinario_atestado_animais',
]

// [tabela, campo, tabela_alvo, opcional]. veterinario_clientes.fazenda_id
// de propósito NÃO entra aqui: é um link opcional pra fazenda de ORIGEM, e
// a tabela fazendas nem existe neste arquivo (este backup é só do módulo
// Veterinário) — não dá pra validar contra algo que não está no arquivo, e
// não deveria estar (mesmo raciocínio de conta_id/fazenda_id como escopo de
// tenant em RestaurarBackup.jsx, não uma referência de conteúdo).
const REFERENCIAS = [
  ['veterinario_lancamentos', 'ciclo_id', 'veterinario_ciclos', false],
  ['veterinario_lancamentos', 'cliente_id', 'veterinario_clientes', true],
  ['veterinario_lancamentos', 'categoria_id', 'veterinario_categorias', true],
  ['veterinario_atestado_animais', 'atestado_id', 'veterinario_atestados', false],
]

function validarArquivoVeterinario(payload) {
  const erros = []
  const avisos = []
  const orfas = []
  const divergencias = []

  const tipo = payload?.tipo
  if (tipo !== TIPO_ESPERADO) {
    erros.push(
      tipo
        ? `Este arquivo é um backup do tipo "${tipo}" — esta tela só aceita backups do módulo Veterinário ("${TIPO_ESPERADO}").`
        : 'Este arquivo não tem "tipo" — não é um backup do módulo Veterinário do DigitalBov (pode ser um Backup Completo de fazenda, que é outro arquivo).'
    )
    return { integro: false, erros, avisos, orfas, divergencias, meta: null }
  }

  const versao = payload?.formato_versao
  if (versao !== FORMATO_RECONHECIDO) {
    erros.push(`Formato de backup não reconhecido: "${versao || '(ausente)'}". Este validador só entende a versão "${FORMATO_RECONHECIDO}".`)
    return { integro: false, erros, avisos, orfas, divergencias, meta: null }
  }

  if (!payload.dados || typeof payload.dados !== 'object') {
    erros.push('O arquivo não tem a seção "dados" esperada — está corrompido ou incompleto.')
    return { integro: false, erros, avisos, orfas, divergencias, meta: null }
  }
  if (!payload.contagens || typeof payload.contagens !== 'object') {
    erros.push('O arquivo não tem a seção "contagens" esperada — está corrompido ou incompleto.')
    return { integro: false, erros, avisos, orfas, divergencias, meta: null }
  }

  const tabelasNoArquivo = Object.keys(payload.dados)
  const faltando = TABELAS_ESPERADAS.filter(t => !tabelasNoArquivo.includes(t))
  const extras   = tabelasNoArquivo.filter(t => !TABELAS_ESPERADAS.includes(t))
  if (faltando.length > 0) erros.push(`Faltam tabelas no arquivo: ${faltando.join(', ')}.`)
  if (extras.length > 0) avisos.push(`O arquivo tem tabelas que este validador não conhece: ${extras.join(', ')} (ignoradas na checagem).`)

  for (const t of tabelasNoArquivo) {
    const real = Array.isArray(payload.dados[t]) ? payload.dados[t].length : null
    const declarado = payload.contagens[t]
    if (real === null) { erros.push(`A tabela "${t}" não é uma lista válida no arquivo.`); continue }
    if (typeof declarado !== 'number') { avisos.push(`Não há contagem declarada para "${t}" — não dá para conferir essa tabela.`); continue }
    if (declarado !== real) divergencias.push({ tabela: t, contagens: declarado, real })
  }
  if (divergencias.length > 0) {
    erros.push(`${divergencias.length} tabela(s) com contagem divergente do que está de fato no arquivo — sinal de arquivo adulterado ou truncado.`)
  }

  for (const [tabela, campo, alvo, opcional] of REFERENCIAS) {
    const linhas = payload.dados[tabela]
    const linhasAlvo = payload.dados[alvo]
    if (!Array.isArray(linhas) || !Array.isArray(linhasAlvo)) continue
    const idsAlvo = new Set(linhasAlvo.map(r => r.id))
    linhas.forEach(row => {
      const valor = row[campo]
      if (valor === null || valor === undefined) {
        if (!opcional) orfas.push({ tabela, campo, id_registro: row.id, valor_orfao: '(vazio)', tabela_alvo: alvo, motivo: 'campo obrigatório vazio' })
        return
      }
      if (!idsAlvo.has(valor)) orfas.push({ tabela, campo, id_registro: row.id, valor_orfao: valor, tabela_alvo: alvo, motivo: 'não encontrado' })
    })
  }
  if (orfas.length > 0) {
    erros.push(`${orfas.length} referência(s) interna(s) quebrada(s) encontrada(s) — o arquivo aponta para registros que não existem nele mesmo.`)
  }

  const dados = payload.dados
  const meta = {
    conta: payload.conta?.nome || payload.conta?.id || '—',
    data_backup: payload.data_backup || null,
    resumo: `Este backup contém ${dados.veterinario_clientes?.length ?? 0} clientes, ${dados.veterinario_lancamentos?.length ?? 0} lançamentos financeiros e ${dados.veterinario_atestados?.length ?? 0} atestados, gerado em ${payload.data_backup ? new Date(payload.data_backup).toLocaleString('pt-BR') : 'data desconhecida'} a partir da conta "${payload.conta?.nome || '—'}".`,
  }

  return { integro: erros.length === 0, erros, avisos, orfas, divergencias, meta }
}

export default function RestaurarBackupVeterinario() {
  const inputRef = useRef(null)
  const { contaAtual } = useConta()
  const { ehAdmin } = usePermissoes() // conta_membros.papel IN ('dono','admin') — mesmo critério da RPC

  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado]   = useState(null)
  const [payload, setPayload]       = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')

  const guardRestaurar = useSubmitGuard()
  const [nomeConfirmacao, setNomeConfirmacao] = useState('')
  const [baixandoSeguranca, setBaixandoSeguranca] = useState(false)
  const [backupSegurancaOk, setBackupSegurancaOk] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [resultadoRestauracao, setResultadoRestauracao] = useState(null)

  const onEscolherArquivo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setNomeArquivo(file.name)
    setResultado(null)
    setPayload(null)
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
      const r = validarArquivoVeterinario(p)
      setResultado(r)
      if (r.integro) setPayload(p)
      setAnalisando(false)
    }
    reader.onerror = () => {
      setResultado({ integro: false, erros: ['Não foi possível ler o arquivo.'], avisos: [], orfas: [], divergencias: [], meta: null })
      setAnalisando(false)
    }
    reader.readAsText(file)
  }

  // O arquivo carregado é desta conta? A RPC já barra qualquer divergência
  // antes de apagar algo, mas checar aqui evita uma chamada fadada a falhar.
  const backupBateComContaAtual = !!payload && !!contaAtual && payload.conta?.id === contaAtual.id

  const baixarBackupDeSeguranca = async () => {
    if (!contaAtual?.id) return
    setBaixandoSeguranca(true)
    try {
      const atual = await gerarBackupVeterinarioPayload({ contaId: contaAtual.id, contaNome: contaAtual.nome })
      baixarBackupJSON(atual, `backup-seguranca-veterinario-${(contaAtual.nome || 'conta').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`)
      setBackupSegurancaOk(true)
      toast('Backup de segurança do estado atual baixado.')
    } catch (e) {
      toast('Erro ao gerar o backup de segurança: ' + e.message, 'error')
    }
    setBaixandoSeguranca(false)
  }

  const executarRestauracao = () => guardRestaurar(async () => {
    if (!ehAdmin || !payload || !contaAtual?.id) return
    if (!backupBateComContaAtual) { toast('Este backup não é desta conta — restauração bloqueada.', 'error'); return }
    if (!backupSegurancaOk) { toast('Baixe o backup de segurança do estado atual antes de restaurar.', 'error'); return }
    if (nomeConfirmacao.trim() !== contaAtual.nome) { toast('Digite o nome da conta exatamente como mostrado para confirmar.', 'error'); return }
    setRestaurando(true)
    setResultadoRestauracao(null)
    const { data, error } = await supabase.rpc('restaurar_backup_conta_veterinario', { p_conta_id: contaAtual.id, p_backup: payload })
    setRestaurando(false)
    if (error) { setResultadoRestauracao({ sucesso: false, erro: error.message }); return }
    setResultadoRestauracao({ sucesso: true, ...data })
  })

  if (!ehAdmin) return null

  return (
    <div className="card" style={{ borderTop: '3px solid #7B2FBE' }}>
      <div className="card-title"><i className="ti ti-database-import" /> Restaurar backup do Veterinário</div>

      <AlertBox type="green" icon="ti-shield-check"
        title="Nada é gravado nesta etapa"
        body="Esta tela só lê e analisa o arquivo dentro do seu navegador — nenhuma informação é enviada ao banco de dados ou alterada no sistema aqui. É só um raio-x do arquivo antes de qualquer restauração de verdade." />

      <div style={{ marginTop: 14, marginBottom: 14 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={analisando}>
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
              {resultado.meta.resumo}
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
                      <tr key={i}><td>{LABEL_TABELA[d.tabela] || d.tabela}</td><td style={{ textAlign: 'right' }}>{d.contagens}</td><td style={{ textAlign: 'right', color: '#791F1F', fontWeight: 600 }}>{d.real}</td></tr>
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
                        <td>{LABEL_TABELA[o.tabela] || o.tabela}</td><td>{o.campo}</td>
                        <td style={{ fontSize: '.72rem', color: '#9CA3AF' }}>{o.id_registro}</td>
                        <td>{LABEL_TABELA[o.tabela_alvo] || o.tabela_alvo}</td>
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
              {resultado.avisos.map((a, i) => <AlertBox key={i} type="amber" icon="ti-info-circle" body={a} />)}
            </div>
          )}

          {resultado.integro && (
            <div>
              <AlertBox type="green" icon="ti-circle-check"
                title="Arquivo íntegro"
                body="Passou em todas as checagens: formato reconhecido, contagens batem, nenhuma referência quebrada." />

              {!backupBateComContaAtual ? (
                <AlertBox type="amber" icon="ti-info-circle"
                  title="Este backup não é desta conta"
                  body={`Este arquivo é da conta "${payload.conta?.nome || '—'}". Entre nessa conta para restaurar este backup.`} />
              ) : (restaurando || resultadoRestauracao) ? (
                <div style={{ marginTop: 12 }}>
                  {restaurando && (
                    <AlertBox type="amber" icon="ti-loader" title="Restaurando — não feche esta aba"
                      body="Apagando e regravando os dados do módulo Veterinário numa única operação atômica no banco. Não deve demorar mais que alguns segundos." />
                  )}
                  {resultadoRestauracao && !resultadoRestauracao.sucesso && (
                    <AlertBox type="red" icon="ti-alert-triangle" title="Restauração abortada — nada foi alterado"
                      body={`O banco recusou a operação antes de apagar qualquer coisa: ${resultadoRestauracao.erro}`} />
                  )}
                  {resultadoRestauracao?.sucesso && (
                    <div>
                      <AlertBox type="green" icon="ti-circle-check" title="Restauração concluída"
                        body='Os dados do módulo Veterinário foram completamente substituídos pelo conteúdo do arquivo. Recarregue a página para ver os dados atualizados.' />
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => window.location.reload()}>
                        <i className="ti ti-refresh" /> Recarregar página
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <AlertBox type="red" icon="ti-alert-triangle"
                    title="Isto é IRREVERSÍVEL"
                    body='TODO o conteúdo atual do módulo Veterinário desta conta (configuração, categorias, clientes, ciclos, lançamentos e atestados) será apagado e substituído pelo que está neste arquivo. Não há como desfazer depois de confirmado. Isto NÃO afeta nenhuma fazenda — dados de animais, financeiro e reprodutivo ficam intactos, este backup é só do módulo Veterinário.' />
                  <AlertBox type="amber" icon="ti-photo"
                    body="A logo do veterinário não faz parte deste backup — se a logo for trocada depois deste arquivo, restaurar não traz a logo antiga de volta." />

                  <div style={{ marginTop: 10 }}>
                    <button className="btn btn-secondary btn-sm" onClick={baixarBackupDeSeguranca} disabled={baixandoSeguranca}>
                      <i className="ti ti-download" /> {baixandoSeguranca ? 'Gerando...' : backupSegurancaOk ? 'Backup de segurança baixado ✓' : 'Baixar backup de segurança do estado atual'}
                    </button>
                  </div>

                  <div style={{ maxWidth: 420, marginTop: 12 }}>
                    <Field label={`Digite "${contaAtual?.nome}" para confirmar`} required>
                      <input value={nomeConfirmacao} onChange={e => setNomeConfirmacao(e.target.value)} disabled={!backupSegurancaOk} />
                    </Field>
                  </div>

                  <button className="btn btn-sm" style={{ marginTop: 10, background: '#791F1F', color: 'white' }}
                    onClick={executarRestauracao}
                    disabled={!backupSegurancaOk || nomeConfirmacao.trim() !== contaAtual?.nome}>
                    <i className="ti ti-alert-triangle" /> Apagar tudo e restaurar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
