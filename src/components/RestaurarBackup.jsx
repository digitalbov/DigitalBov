import { useRef, useState } from 'react'
import { AlertBox, Badge } from './UI'

// ── FASE 0 da restauração: só VALIDA o arquivo no navegador — nenhuma chamada
// a supabase/banco acontece neste componente, em nenhum caminho. A fase que
// de fato grava dados (Fase 1) é um passo futuro separado; aqui o botão de
// prosseguir nunca fica clicável, só existe pra mostrar que o arquivo passou
// na validação.

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
  ['abortos', 'animal_id', 'animais', true],
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
  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado]   = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')

  const onEscolherArquivo = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo depois
    if (!file) return
    setNomeArquivo(file.name)
    setResultado(null)
    setAnalisando(true)

    const reader = new FileReader()
    reader.onload = (ev) => {
      let payload
      try {
        payload = JSON.parse(ev.target.result)
      } catch {
        setResultado({ integro: false, erros: ['O arquivo não é um JSON válido.'], avisos: [], orfas: [], divergencias: [], meta: null })
        setAnalisando(false)
        return
      }
      setResultado(validarArquivo(payload))
      setAnalisando(false)
    }
    reader.onerror = () => {
      setResultado({ integro: false, erros: ['Não foi possível ler o arquivo.'], avisos: [], orfas: [], divergencias: [], meta: null })
      setAnalisando(false)
    }
    reader.readAsText(file)
  }

  return (
    <div className="card" style={{ borderTop: '3px solid #7B2FBE' }}>
      <div className="card-title"><i className="ti ti-database-import" /> Restaurar backup (validação)</div>

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
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" disabled title="A importação de verdade ainda não foi implementada">
                  <i className="ti ti-database-import" /> Restaurar estes dados
                </button>
                <span style={{ fontSize: '.78rem', color: '#9CA3AF' }}>Importação será liberada na próxima etapa.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
