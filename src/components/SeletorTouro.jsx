import { resolverTouroDigitado, nomeTouro } from '../lib/helpers'

// Extraído de Reprodutivo.jsx (Item 5 aprovado nesta rodada) — usado também
// pelo campo "Pai" de Animais.jsx, que tem exatamente o mesmo domínio (touro
// cadastrado OU touro externo, mesma tabela touros_externos). Um componente
// só, nunca duas versões quase iguais.

// Seletor de atalho pra touro (Tarefa B) — usado tanto no campo "Touro" da
// IA quanto no "novo touro" da monta natural, nunca duas implementações. Dois
// optgroups visualmente distintos (ícone + rótulo, sem precisar de texto
// explicativo): "🐮 Touros da fazenda" (cadastrados, brinco — nome no
// rótulo) e "🔗 Touros externos já usados" (touros_externos — emprestado ou
// sêmen, reoferecido pra reuso sem depender de grafia). Só PREENCHE o campo
// de texto ao lado (onSelect(nome)) — nunca substitui a digitação livre, e
// nunca guarda nenhum id: escolher aqui é EXATAMENTE a mesma coisa que
// digitar aquele texto à mão. A resolução (pra qual touro esse texto aponta)
// é sempre recalculada depois, ao vivo, por resolverTouroDigitado — nunca
// capturada no momento da escolha (ver ResolucaoTouro, abaixo).
export function SeletorTouro({ tourosCadastrados, tourosExternos, onSelect }) {
  if (tourosCadastrados.length === 0 && tourosExternos.length === 0) return null
  return (
    <select value="" onChange={e => {
      if (!e.target.value) return
      const [tipo, id] = e.target.value.split(':')
      if (tipo === 'animal') {
        const t = tourosCadastrados.find(x => x.id === id)
        if (t) onSelect(t.brinco)
      } else {
        const t = tourosExternos.find(x => x.id === id)
        if (t) onSelect(t.nome)
      }
    }} style={{ maxWidth:170 }}>
      <option value="">Selecionar…</option>
      {tourosCadastrados.length > 0 && (
        <optgroup label="🐮 Touros da fazenda">
          {tourosCadastrados.map(t => <option key={t.id} value={`animal:${t.id}`}>{t.brinco}{t.nome ? ` — ${t.nome}` : ''}</option>)}
        </optgroup>
      )}
      {tourosExternos.length > 0 && (
        <optgroup label="🔗 Touros externos já usados">
          {tourosExternos.map(t => <option key={t.id} value={`externo:${t.id}`}>{t.nome}</option>)}
        </optgroup>
      )}
    </select>
  )
}

// Bloco de confirmação AO VIVO — "qual touro vai ser usado" — sempre visível
// (nunca some), sempre recalculado do texto atual (resolverTouroDigitado,
// helpers.js), nunca de um estado de vínculo guardado à parte. Informativo,
// não alerta: os 3 casos normais (cadastrado, externo já usado, externo
// novo) usam tom neutro/confirmação — só a ambiguidade rara (brinco de
// cadastrado igual ao nome de um externo) usa âmbar, porque essa sim precisa
// chamar atenção (nunca fica silenciosa).
export function ResolucaoTouro({ texto, tourosCadastrados, tourosExternos, onEscolherAproximado }) {
  const r = resolverTouroDigitado(texto, tourosCadastrados, tourosExternos)
  if (!r) return null
  const base = { fontSize:'.75rem', marginTop:5, padding:'5px 9px', borderRadius:7, display:'flex', flexDirection:'column', gap:3 }
  if (r.tipo === 'cadastro') {
    return (
      <div style={{ ...base, background:'#E8F0FC', color:'#1E55B0' }}>
        <span><i className="ti ti-home" style={{ fontSize:11 }} /> Touro cadastrado: <strong>{nomeTouro({ touro_animal: r.touro })}</strong></span>
        {r.ambiguoExterno && (
          <span style={{ color:'#92620A' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:11 }} /> Também existe um touro EXTERNO chamado "{r.ambiguoExterno.nome}" — o cadastrado tem prioridade e é esse que vai ser usado.
          </span>
        )}
      </div>
    )
  }
  if (r.tipo === 'externo_exato') {
    return (
      <div style={{ ...base, background:'#F3E8FF', color:'#5B2A9E' }}>
        <i className="ti ti-link" style={{ fontSize:11 }} /> Touro externo já cadastrado: <strong>{r.touro.nome}</strong>
      </div>
    )
  }
  // tipo 'novo' — caminho normal, nunca vermelho/alerta.
  return (
    <div style={{ ...base, background:'#F9FAFB', color:'#6B7280' }}>
      <span><i className="ti ti-circle-plus" style={{ fontSize:11 }} /> Será criado um touro externo novo: <strong>{(texto||'').trim()}</strong></span>
      {r.aproximados.length > 0 && (
        <span>
          Parecido com: {r.aproximados.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ', '}
              <button type="button" onClick={() => onEscolherAproximado(a.nome)}
                style={{ background:'none', border:'none', padding:0, color:'#2B6CD9', textDecoration:'underline', cursor:'pointer', fontSize:'.75rem' }}>
                {a.nome}
              </button>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
