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
        não precisa entrar em Gestão Reprodutiva, Manejo Sanitário e Estoque separadamente para saber o que fazer esta
        semana.
      </p>

      <h4 style={H4}>O que aparece na agenda</h4>
      <ul style={UL}>
        <li><strong>🍼 Previsão de parto</strong> — uma por fêmea diagnosticada Prenha que ainda não pariu nem abortou naquele lote. A data é sempre a data da monta + 283 dias (fixo, a mesma estimativa usada em Gestão Reprodutiva) — não é o mesmo cálculo de janela de 260-300 dias usado para o aviso de gestação fora do padrão. É uma projeção calculada, presa ao ciclo (veja "Como navegar" abaixo).</li>
        <li><strong>💉 Retorno sanitário</strong> — um por procedimento de Manejo Sanitário JÁ REALIZADO que tem "Próxima aplicação" preenchida e ainda não gerou um agendamento (registros antigos, de antes do agendamento automático existir, ou que você ainda não interagiu). Some sozinho assim que um agendamento é gerado (inclusive na hora, ao clicar Editar/Concluir/Não realizado nele) — vira o item abaixo, nunca os dois juntos. É só um campo de um registro histórico, sem identidade própria — preso ao ciclo.</li>
        <li><strong>📅 Vacinação agendada</strong> — um por procedimento de Manejo Sanitário com status "agendado" (data futura, criado manualmente na aba Calendário de vacinação, gerado automaticamente pela "Próxima aplicação" de outro procedimento, ou gerado na hora ao interagir com um alerta de retorno sanitário) — a data do evento é a data agendada da vacinação, não uma "próxima aplicação". Some da agenda quando você marcar como concluído, como não realizado, ou excluir o agendamento em Manejo Sanitário. É um <strong>compromisso marcado</strong> — sempre aparece, mesmo fora do ciclo selecionado.</li>
        <li><strong>📦 Vencimento de estoque</strong> — um por lote de entrada (mesmo lote/validade do FEFO, veja a seção Estoque) que ainda tem saldo positivo. Preso ao ciclo.</li>
        <li><strong>🏆 Feira agendada</strong> — uma por participação em feira sem resultado lançado, enquanto a feira ainda não terminou (veja a seção Feiras e Premiações). Compromisso marcado — sempre aparece, mesmo fora do ciclo selecionado. <strong>⚠️ Resultado pendente</strong> — a mesma participação vira este alerta (na área de Atrasados/Vencidos) se a feira já terminou e ninguém lançou Colocação/Título ainda; isso já é passado, não compromisso futuro — preso ao ciclo.</li>
        <li><strong>🔄 Pendências sem data — Repasse de Vazias</strong> — uma seção separada, sem prazo, listando toda fêmea ativa com situação reprodutiva "Vazia": um lembrete de quem precisa entrar no próximo lote de monta, não um evento com data.</li>
      </ul>

      <h4 style={H4}>Como navegar</h4>
      <p style={P}>
        Escolha o <strong>ciclo</strong> no seletor do topo — eventos com data dentro dele aparecem em
        Atrasados/Próximos (as pendências sem data não são afetadas). Uma exceção de propósito: <strong>📅
        vacinação agendada</strong> e <strong>🏆 feira agendada</strong> são compromissos que você mesmo marcou
        pra uma data — aparecem sempre, mesmo se a data cair fora do ciclo selecionado. Os outros tipos (🍼
        previsão de parto, 💉 retorno sanitário, 📦 vencimento de estoque, ⚠️ resultado pendente) são derivados
        de dado histórico, não um compromisso com identidade própria — ficam presos ao ciclo selecionado; se
        houver algum fora dele, uma seção própria <strong>"Além do ciclo"</strong> aparece no fim da agenda,
        mostrando cada um com o nome do ciclo a que pertence (útil também no PDF exportado, que não carrega o
        seletor de ciclo da tela). Filtre por tipo (Todos, Partos, Manejo Sanitário, Estoque, Feiras,
        Reprodução) nas pílulas. Os 4 KPIs do topo (rotulados "no ciclo") resumem só o que está dentro do
        ciclo selecionado — os compromissos que escapam do filtro não entram nessa contagem, por isso o total
        visível na tela pode ser maior que o "Total no ciclo". Os eventos ficam organizados em duas listas —
        <strong> Atrasados/Vencidos</strong> primeiro, depois <strong>Próximos eventos</strong> — cada um com
        uma cor de urgência (vermelho = atrasado, amarelo = hoje, laranja = até 7 dias, azul = até 30 dias,
        cinza = mais adiante). Dá para exportar a agenda em PDF, incluindo a seção "Além do ciclo" se houver.
      </p>

      <AlertBox type="green" icon="ti-info-circle"
        title="Você não lança nada aqui"
        body="O Calendário só lê eventos já registrados em outros módulos (Gestão Reprodutiva, Manejo Sanitário, Estoque) — não existe um botão de criar evento nesta tela. Para adiantar ou resolver um item, vá até o módulo de origem (ex: marcar o retorno sanitário como concluído em Manejo Sanitário)." />
    </div>
  )
}
