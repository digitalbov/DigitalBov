import { AlertBox } from '../../../components/UI'

export default function SecaoAssistente({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        O <strong>Assistente IA</strong> é um chat (com opção de pergunta por voz e resposta lida em voz alta)
        para perguntas rápidas sobre a fazenda, sem precisar navegar pelas telas — ex: "Quantas matrizes
        tenho?", "Tem algum produto abaixo do mínimo no estoque?", "Quanto gastei com remédios este ciclo?".
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Que dados ele enxerga</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        A cada pergunta, o sistema monta um resumo atualizado com: animais ativos e sua composição por
        categoria, matrizes/prenhas/vazias, resumo de inseminações e diagnósticos do ciclo atual, partos do
        ciclo atual, estoque (itens e saldos), os últimos 20 procedimentos sanitários, e o financeiro do
        ciclo atual (receitas/despesas por grupo). É um <strong>resumo do momento</strong>, focado no ciclo
        atual — não é o histórico completo de safras passadas nem um acesso livre ao banco de dados.
      </p>

      <AlertBox type="amber" icon="ti-alert-triangle"
        title="Resposta de IA precisa ser conferida — não é fonte de verdade contábil"
        body='O assistente lê os mesmos dados do sistema, mas quem calcula a resposta é um modelo de IA (Gemini), que pode interpretar errado, arredondar de forma diferente das telas oficiais, ou simplesmente errar. Para qualquer decisão financeira, fiscal ou de manejo importante, confirme o número direto na tela correspondente (Metas, Financeiro, Estoque...) — o assistente é um atalho de consulta, não substitui os indicadores oficiais do sistema.' />
    </div>
  )
}
