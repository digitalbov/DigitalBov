import { AlertBox } from '../../../components/UI'

export default function SecaoDashboard({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        O <strong>Painel</strong> é a tela inicial: um retrato rápido de "como está a fazenda agora" — sem
        precisar entrar em cada módulo.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>O que ele mostra</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>KPIs do topo</strong> — total de animais ativos, matrizes, novilhas (13-24 meses) e área útil.</li>
        <li><strong>Valor de mercado do rebanho</strong> — tabela por categoria, quantidade × peso médio × preço/kg (os mesmos parâmetros de Financeiro → Parâmetros).</li>
        <li><strong>Índices reprodutivos do ciclo atual</strong> — taxa de prenhez, prenhas, matrizes.</li>
        <li><strong>Composição do rebanho</strong> — barra por categoria.</li>
        <li><strong>Financeiro do ciclo</strong> — receitas, despesas e resultado.</li>
        <li><strong>Alertas do sistema</strong> — taxa de prenhez abaixo de 85%, despesas superando receitas, itens de estoque vencidos/vencendo.</li>
      </ul>

      <AlertBox type="amber" icon="ti-report-money"
        title="Valor de mercado do rebanho é só o que existe HOJE"
        body='Essa tabela conta só animais com situação "ativo" no momento em que você abre a tela — é uma foto do patrimônio atual, não um índice histórico de safra. Um animal vendido some dela imediatamente, mesmo que a venda tenha sido registrada com data retroativa. É diferente dos indicadores de Metas, que ficam fixos na safra em que aconteceram e não mudam quando você vende ou compra animais depois.' />
    </div>
  )
}
