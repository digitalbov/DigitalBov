import { AlertBox } from '../../../components/UI'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14 }
const UL = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }

export default function SecaoCalendario({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        O <strong>Calendário</strong> junta numa lista só tudo que está vencido ou vencendo na fazenda — você
        não precisa entrar em Reprodutivo, Sanidade e Estoque separadamente para saber o que fazer esta
        semana.
      </p>

      <h4 style={H4}>O que aparece na agenda</h4>
      <ul style={UL}>
        <li><strong>🍼 Previsão de parto</strong> — uma por fêmea diagnosticada Prenha que ainda não pariu nem abortou naquele lote. A data é sempre a data da monta + 283 dias (fixo, a mesma estimativa usada em Reprodutivo) — não é o mesmo cálculo de janela de 260-300 dias usado para o aviso de gestação fora do padrão.</li>
        <li><strong>💉 Retorno sanitário</strong> — um por procedimento de Sanidade JÁ REALIZADO que tem "Próxima aplicação" preenchida e ainda não foi marcado como concluído.</li>
        <li><strong>📅 Vacinação agendada</strong> — um por procedimento de Sanidade com status "agendado" (data futura, criado na aba Calendário de vacinação de Sanidade e ainda não confirmado por lá) — a data do evento é a data agendada da vacinação, não uma "próxima aplicação". Some da agenda só quando você marcar como concluído ou excluir o agendamento em Sanidade.</li>
        <li><strong>📦 Vencimento de estoque</strong> — um por lote de entrada (mesmo lote/validade do FEFO, veja a seção Estoque) que ainda tem saldo positivo.</li>
        <li><strong>🔄 Pendências sem data — Repasse de Vazias</strong> — uma seção separada, sem prazo, listando toda fêmea ativa com situação reprodutiva "Vazia": um lembrete de quem precisa entrar no próximo lote de monta, não um evento com data.</li>
      </ul>

      <h4 style={H4}>Como navegar</h4>
      <p style={P}>
        Escolha o <strong>ciclo</strong> no seletor do topo — só eventos com data dentro dele aparecem (as
        pendências sem data não são afetadas). Filtre por tipo (Todos, Partos, Sanidade, Estoque, Reprodução)
        nas pílulas. 4 KPIs resumem: atrasados/vencidos, esta semana, este mês e total. Os eventos ficam
        organizados em duas listas — <strong>Atrasados/Vencidos</strong> primeiro, depois
        <strong> Próximos eventos</strong> — cada um com uma cor de urgência (vermelho = atrasado, amarelo =
        hoje, laranja = até 7 dias, azul = até 30 dias, cinza = mais adiante). Dá para exportar a agenda em
        PDF.
      </p>

      <AlertBox type="green" icon="ti-info-circle"
        title="Você não lança nada aqui"
        body="O Calendário só lê eventos já registrados em outros módulos (Reprodutivo, Sanidade, Estoque) — não existe um botão de criar evento nesta tela. Para adiantar ou resolver um item, vá até o módulo de origem (ex: marcar o retorno sanitário como concluído em Sanidade)." />
    </div>
  )
}
