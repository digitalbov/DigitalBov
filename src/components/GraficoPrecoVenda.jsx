import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { fmtData, fmtMoeda } from '../lib/helpers'

// ── Preço de venda por categoria ao longo do tempo — 2D (item 5, revisão da
// sessão): o que importa aqui é a variação do PREÇO por kg no tempo, não os
// quilos em si — um eixo (tempo) e um valor (R$/kg ou R$/@) já contam a
// história inteira. Substitui a versão 3D (Canvas/three.js, ~870kB de bundle
// lazy só pra isto) por um LineChart comum, sem nenhuma dependência nova
// (recharts já é usado no resto da tela).
//
// Uma LINHA POR CATEGORIA, não uma linha única — categorias diferentes
// (Terneira x Boi x Vaca Prenha) têm faixas de R$/kg estruturalmente
// diferentes; uma linha só, misturando todas, subiria e desceria conforme
// o MIX de categorias vendidas em cada dia mudasse, não porque o preço de
// verdade mudou — pareceria "preço caindo" num dia em que só se vendeu
// categoria mais barata, mesmo com cada categoria individualmente estável.
// Por categoria, cada linha conta sua própria história de preço, sem
// contaminação das outras — mesmo raciocínio que já valia na versão 3D
// (uma "pista" por categoria), só que agora em 2D de verdade.
const CORES = ['#2B6CD9', '#7B2FBE', '#DB2777', '#D97706', '#166534', '#0C447C', '#DC2626', '#0891B2']

export default function GraficoPrecoVenda({ series }) {
  const [unidade,  setUnidade]  = useState('kg') // 'kg' | 'arroba' — só troca o RÓTULO exibido, nunca os dados (mesma posição do ponto nos dois casos, escala linear)
  const [visiveis, setVisiveis] = useState({})

  if (series.length === 0 || series.every(s => s.pontos.length === 0)) {
    return <p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '28px 0' }}>Sem vendas com preço/kg registradas ainda.</p>
  }

  const fmtValor = (precoKg) => {
    const v = unidade === 'arroba' ? precoKg * 15 : precoKg
    return `${fmtMoeda(v)}/${unidade === 'arroba' ? '@' : 'kg'}`
  }

  const toggleCategoria = (cat) => setVisiveis(p => ({ ...p, [cat]: p[cat] === false ? true : false }))

  // Um dataset único (uma linha por DATA, uma coluna por categoria) — recharts
  // precisa disso pra várias <Line> lerem o mesmo eixo X; datas sem venda de
  // uma categoria ficam undefined naquela coluna (connectNulls na Line liga
  // por cima do buraco, sem inventar um ponto que não existiu).
  const todasDatas = [...new Set(series.flatMap(s => s.pontos.map(p => p.data)))].sort()
  const dados = todasDatas.map(data => {
    const linha = { data }
    series.forEach(s => {
      const ponto = s.pontos.find(p => p.data === data)
      if (ponto) linha[s.categoria] = ponto.precoKg
    })
    return linha
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {series.map((s, i) => (
            <button
              key={s.categoria}
              onClick={() => toggleCategoria(s.categoria)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none',
                cursor: 'pointer', fontSize: '.76rem', padding: '2px 6px', borderRadius: 6,
                opacity: visiveis[s.categoria] === false ? .35 : 1,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: CORES[i % CORES.length], display: 'inline-block' }} />
              {s.categoria}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUnidade(u => u === 'kg' ? 'arroba' : 'kg')}>
          Eixo: {unidade === 'kg' ? 'R$ / kg' : 'R$ / @'}
        </button>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={dados} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
          <XAxis dataKey="data" tickFormatter={fmtData} tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={v => fmtValor(v)} tick={{ fontSize: 10 }} width={78} domain={['auto', 'auto']} />
          <Tooltip
            labelFormatter={fmtData}
            formatter={(v, name) => [fmtValor(v), name]}
            contentStyle={{ fontSize: '.78rem', borderRadius: 8 }}
          />
          {series.map((s, i) => visiveis[s.categoria] === false ? null : (
            <Line key={s.categoria} type="monotone" dataKey={s.categoria}
              stroke={CORES[i % CORES.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
              connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
