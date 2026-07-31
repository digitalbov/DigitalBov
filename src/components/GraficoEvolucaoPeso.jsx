import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// Gráfico de evolução de peso — extraído de Pesagens.jsx (Fase 13) pra ser
// reaproveitado também na ficha do animal (Animais.jsx), sem duplicar. `data`
// já vem pronto no formato {data, peso}[] (individual ou média de um grupo).
export default function GraficoEvolucaoPeso({ data, titulo }) {
  return (
    <div className="card" style={{ marginBottom:12 }}>
      <div className="card-title"><i className="ti ti-chart-line"/> {titulo}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{top:5,right:10,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
          <XAxis dataKey="data" tick={{fontSize:10}}/>
          <YAxis tick={{fontSize:10}}/>
          <Tooltip formatter={v=>`${v} kg`}/>
          <Line type="monotone" dataKey="peso" name="Peso kg" stroke="#2B6CD9" strokeWidth={2} dot={{r:4}}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
