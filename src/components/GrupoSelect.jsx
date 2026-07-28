import { useState } from 'react'

// Select de grupo (financeiro) com opção "+ Novo grupo..." pra digitar um
// grupo fora da lista — usado no Financeiro e no Estoque (caminhos 2-5),
// MESMO componente nos dois lugares. `opcoes` já vem pronta (união da lista
// fixa GRUPOS_REC/GRUPOS_DES com os extras carregados por
// estoqueFinanceiro.js::carregarGruposExtras — ver comGrupoExtra pra como
// cada tela atualiza a lista na hora, sem reload, depois de salvar).
// Passe `key` diferente (ex: o tipo D/R) quando quiser que o modo "digitando
// novo grupo" reinicie ao trocar de contexto.
export default function GrupoSelect({ value, onChange, opcoes }) {
  const [novo, setNovo] = useState(false)

  if (novo) {
    return (
      <div style={{ display:'flex', gap:6 }}>
        <input autoFocus value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Nome do novo grupo" />
        <button type="button" className="btn btn-secondary btn-xs" title="Voltar para a lista"
          onClick={() => { setNovo(false); onChange('') }}>
          <i className="ti ti-x" />
        </button>
      </div>
    )
  }
  return (
    <select value={value || ''} onChange={e => {
      if (e.target.value === '__novo__') { setNovo(true); onChange(''); return }
      onChange(e.target.value)
    }}>
      <option value="">— selecione —</option>
      {opcoes.map(g => <option key={g}>{g}</option>)}
      <option value="__novo__">+ Novo grupo...</option>
    </select>
  )
}
