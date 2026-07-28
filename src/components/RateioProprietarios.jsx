import { fmtMoeda, rateioIgualCentavos } from '../lib/helpers'
import { toast } from './UI'

// Editor de rateio por proprietário (grade % / R$, "Dividir igualmente"),
// usado no "Novo lançamento" do Financeiro E nos lançamentos criados a
// partir do Estoque (caminhos 4/5) — MESMO componente nos dois lugares, pra
// não ter duas implementações da mesma regra. Controlado: quem usa guarda
// `rateios` (array já inicializado com um item por proprietário, ver
// `props.map(p => ({ proprietario_id: p.id, percentual:'', valor:'' }))`)
// e recebe de volta a lista atualizada via onChange.
export default function RateioProprietarios({ tipo, valorTotal, props, rateios, onChange }) {
  if (!props?.length) return null
  const lista = rateios || []

  const setRateioPercentual = (propId, perc) => {
    const total = parseFloat(valorTotal || 0)
    const novoValor = perc === '' ? '' : (parseFloat(perc) / 100) * total
    onChange(lista.map(r => r.proprietario_id === propId
      ? { ...r, percentual: perc, valor: novoValor === '' ? '' : novoValor.toFixed(2) }
      : r))
  }
  const setRateioValor = (propId, val) => {
    const total = parseFloat(valorTotal || 1) || 1
    const novoPerc = val === '' ? '' : (parseFloat(val) / total) * 100
    onChange(lista.map(r => r.proprietario_id === propId
      ? { ...r, valor: val, percentual: novoPerc === '' ? '' : novoPerc.toFixed(2) }
      : r))
  }
  const dividirIgualmente = () => {
    const total = parseFloat(valorTotal || 0)
    if (!total || props.length === 0) { toast('Preencha o valor antes de dividir.', 'error'); return }
    onChange(rateioIgualCentavos(total, props))
  }
  const totalPerc  = lista.reduce((s, r) => s + (parseFloat(r.percentual) || 0), 0)
  const totalValor = lista.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0)

  return (
    <div style={{ marginTop:16, paddingTop:14, borderTop:'.5px solid #E5E7EB' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:'.85rem', fontWeight:600, color:'#374151' }}>
          Rateio por proprietário {tipo === 'D' ? '(obrigatório)' : '(opcional)'}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={dividirIgualmente}>
          Dividir igualmente
        </button>
      </div>
      <p style={{ fontSize:'.75rem', color:'#9CA3AF', marginBottom:10 }}>
        {tipo === 'D'
          ? 'Despesa exige rateio: se deixar em branco, é dividido automaticamente em partes iguais entre os proprietários ao salvar.'
          : 'Deixe em branco se não quiser definir rateio agora.'}
      </p>
      {lista.map(r => {
        const prop = props.find(p => p.id === r.proprietario_id)
        return (
          <div key={r.proprietario_id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <span style={{ flex:1, fontSize:'.83rem', color:'#374151' }}>{prop?.nome || '—'}</span>
            <input type="number" step="0.01" placeholder="%" value={r.percentual}
              onChange={e => setRateioPercentual(r.proprietario_id, e.target.value)}
              style={{ width:70, textAlign:'right' }} />
            <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>%</span>
            <input type="number" step="0.01" placeholder="0,00" value={r.valor}
              onChange={e => setRateioValor(r.proprietario_id, e.target.value)}
              style={{ width:90, textAlign:'right' }} />
            <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>R$</span>
          </div>
        )
      })}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:16, fontSize:'.78rem', color:'#6B7280', marginTop:6 }}>
        <span>Total: <strong style={{ color:'#374151' }}>{totalPerc.toFixed(2)}%</strong></span>
        <span>{fmtMoeda(totalValor)}</span>
      </div>
    </div>
  )
}
