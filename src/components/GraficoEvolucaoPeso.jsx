import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// Gráfico de evolução de peso — extraído de Pesagens.jsx (Fase 13) pra ser
// reaproveitado também na ficha do animal (Animais.jsx), sem duplicar. `data`
// já vem pronto no formato {data, peso}[] (individual ou média de um grupo).
//
// Fase 13 (2ª rodada) — linha de comparação opcional: se algum ponto de
// `data` tiver a chave `pesoComparacao`, desenha uma 2ª linha discreta e
// tracejada (ex: média dos contemporâneos na ficha do animal). Sem essa
// chave em nenhum ponto, o gráfico continua idêntico ao de antes (usado
// também por Por Lote/Por Categoria, que nunca passam comparação).
export default function GraficoEvolucaoPeso({ data, titulo, nomeSerie = 'Peso kg', nomeComparacao = 'Comparação', notaComparacao }) {
  const temComparacao = data.some(d => d.pesoComparacao != null)
  return (
    <div className="card" style={{ marginBottom:12 }}>
      <div className="card-title"><i className="ti ti-chart-line"/> {titulo}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{top:5,right:10,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
          <XAxis dataKey="data" tick={{fontSize:10}}/>
          <YAxis tick={{fontSize:10}}/>
          <Tooltip formatter={v=>`${v} kg`}/>
          {temComparacao && <Legend wrapperStyle={{fontSize:11}}/>}
          {temComparacao && (
            <Line type="monotone" dataKey="pesoComparacao" name={nomeComparacao} stroke="#9CA3AF" strokeWidth={1.5}
              strokeDasharray="4 4" dot={{r:3}} connectNulls />
          )}
          <Line type="monotone" dataKey="peso" name={nomeSerie} stroke="#2B6CD9" strokeWidth={2} dot={{r:4}}/>
        </LineChart>
      </ResponsiveContainer>
      {notaComparacao && (
        <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginTop:6 }}>
          <i className="ti ti-info-circle" style={{ fontSize:11 }} /> {notaComparacao}
        </div>
      )}
    </div>
  )
}
