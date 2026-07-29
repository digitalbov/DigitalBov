import { useState } from 'react'
import { Field, AlertBox, Badge } from '../../../components/UI'

const TIPOS_DEMO = ['Vacina', 'Vermifugação', 'Ectoparasita', 'Medicação', 'Exame']

// ── Recriação do seletor "Por lote" / "Individual" (Sanidade.jsx) — mesmas
// classes .pill/.pill-group da tela real, estado local, não grava nada.
function DemoSelecaoProcedimento() {
  const [modo, setModo] = useState('lote')
  const [tipo, setTipo] = useState('Vacina')

  return (
    <div data-pdf-shot="true" style={{
      border: '1.5px dashed #C7D2E8', borderRadius: 12, padding: 18,
      background: '#F8FAFD', marginTop: 10, marginBottom: 18,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
        background: '#EEEDFE', color: '#3C3489', borderRadius: 8,
        padding: '3px 10px', fontSize: '.72rem', fontWeight: 700,
      }}>
        <i className="ti ti-flask" /> MODO DEMONSTRAÇÃO — não salva dados reais
      </div>
      <div className="grid-form" style={{ marginBottom: 12 }}>
        <Field label="Tipo" required>
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            {TIPOS_DEMO.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Procedimento" required>
          <input placeholder="ex: Ivermectina 1%" />
        </Field>
      </div>
      <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, marginBottom: 6 }}>Seleção de animais</label>
      <div className="pill-group" style={{ marginBottom: 10 }}>
        <button type="button" className={`pill ${modo === 'lote' ? 'active' : ''}`} onClick={() => setModo('lote')}>Por lote</button>
        <button type="button" className={`pill ${modo === 'individual' ? 'active' : ''}`} onClick={() => setModo('individual')}>Individual</button>
      </div>
      <div style={{ fontSize: '.8rem', color: '#6B7280' }}>
        {modo === 'lote'
          ? 'Marque um ou mais lotes — a quantidade de animais é preenchida sozinha, contando só quem já tinha nascido na data do procedimento.'
          : 'Filtre por categoria e proprietário e marque os animais um a um.'}
      </div>
    </div>
  )
}

export default function SecaoSanidade({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Sanidade</strong> registra vacinas, vermifugações, tratamentos e exames aplicados no
        rebanho, com agenda de retorno e, opcionalmente, baixa automática dos itens usados no Estoque.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Abas do módulo</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Registros</strong> — lista de procedimentos JÁ REALIZADOS, com o formulário de novo procedimento.</li>
        <li><strong>Calendário de vacinação</strong> — vacinações AGENDADAS (data futura, ainda não concluídas). Ver seção própria abaixo.</li>
        <li><strong>Alertas</strong> — retornos vencidos e próximos (30 dias) de procedimentos já realizados, MAIS os agendamentos vencidos e dentro dos próximos 90 dias (com selo "Agendado"), com um calendário sanitário dos próximos 90 dias.</li>
        <li><strong>Histórico</strong> — consulta geral dos procedimentos já realizados, por período/animal.</li>
      </ul>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: registrar um procedimento</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 8, paddingLeft: 20 }}>
        <li>Clique em <strong>"Novo procedimento"</strong> (em Registros) ou <strong>"Novo agendamento"</strong> (em Calendário de vacinação — é o mesmo formulário).</li>
        <li>Escolha o <strong>tipo</strong> (Vacina, Vermifugação, Ectoparasita, Medicação ou Exame), a <strong>data</strong> e descreva o <strong>procedimento</strong> (ex: "Ivermectina 1%"). <strong>Data futura vira agendamento automaticamente</strong> — vai para a aba Calendário de vacinação, não para Registros, mesmo que você tenha aberto o formulário por Registros.</li>
        <li>Escolha <strong>Por lote</strong> (marca lotes inteiros) ou <strong>Individual</strong> (marca animais um a um, com filtro por categoria/proprietário).</li>
        <li>A <strong>quantidade de animais</strong> é preenchida sozinha a partir da seleção — só conta quem já tinha nascido na data do procedimento.</li>
        <li>Se a data for hoje ou passada, você pode dar baixa em itens do estoque agora (veja abaixo) — num agendamento essa opção não aparece nem aqui nem ao editá-lo depois, porque a baixa só acontece no momento da conclusão (ver seção abaixo). Em ambos os casos dá pra definir a <strong>próxima aplicação</strong> (data do retorno).</li>
        <li>Clique em <strong>Salvar</strong> (ou <strong>Agendar</strong>, se a data for futura).</li>
      </ol>
      <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
        Experimente o seletor abaixo — é uma recriação exata da tela real, mas não grava nada:
      </p>
      <DemoSelecaoProcedimento />

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Calendário de vacinação (agendamentos)</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Enquanto um agendamento não é concluído, ele fica isolado: <strong>não aparece</strong> em Registros,
        na ficha do animal, em Histórico, nos indicadores de Relatórios nem no Assistente — continua assim
        mesmo depois que a data agendada chega e passa. A exceção é a aba <strong>Alertas</strong>, onde ele
        aparece propositalmente (com o selo "Agendado") quando está vencido ou dentro dos próximos 90 dias —
        veja "Agenda de retorno" abaixo. Ele aparece também no módulo <strong>Calendário</strong> (com o
        ícone 📅 e o prefixo "Agendado:"), diferente dos alertas de "próxima aplicação" (ícone 💉), que são
        só de procedimentos já realizados.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Cada agendamento tem 3 ações — na aba Calendário de vacinação ou direto num alerta de Alertas:
      </p>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10, paddingLeft: 20 }}>
        <li><strong>Editar</strong> (ícone de lápis) — abre o formulário completo, com todos os campos, os animais selecionados e os <strong>itens de estoque previstos</strong> editáveis. Continua agendado depois de salvar. É aqui (e só aqui) que você mexe nos dados do agendamento — a conclusão, abaixo, não edita nada.</li>
        <li><strong>Marcar como concluído</strong> (ícone de check) — <strong>não abre formulário</strong>: mostra uma confirmação curta com o resumo (data, procedimento, quantidade de animais e os itens previstos, se houver) e dois botões. Ao confirmar: se algum item previsto não tiver saldo suficiente (ou tiver sido excluído do estoque), a conclusão inteira é recusada, com o aviso de qual item e quanto falta — nada é alterado. Se estiver tudo certo, o registro vira "realizado", a baixa de estoque acontece de verdade e ele passa a valer normalmente: entra em Registros, na ficha dos animais, nos indicadores. Se a data ainda estiver no futuro, a conclusão também é recusada — mude a data em Editar primeiro.</li>
        <li><strong>Excluir</strong> (ícone de lixeira) — nunca reverte nada, porque um agendamento nunca baixou estoque nem afetou qualquer outro dado (itens previstos não são movimentação, só planejamento). É só apagar a agenda.</li>
      </ol>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Agenda de retorno</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Se você preencher <strong>"Próxima aplicação"</strong> ao registrar um procedimento REALIZADO, ele
        entra na aba <strong>Alertas</strong>: aparece em vermelho se já venceu, em amarelo se vence nos
        próximos 30 dias. Um botão <strong>"Marcar como concluído"</strong> fecha o alerta e já oferece
        registrar a nova aplicação na hora, com a data de hoje.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Os <strong>agendamentos</strong> (Calendário de vacinação) aparecem na mesma aba Alertas, misturados
        na mesma ordem por proximidade da data, mas com o selo <strong>"Agendado"</strong> pra você não
        confundir com um retorno de procedimento já realizado — a janela deles é mais larga (90 dias, não 30)
        e o botão vira <strong>Editar/Concluir</strong> em vez de "Marcar como concluído". Um agendamento
        vencido (passou a data e ninguém concluiu) aparece na seção vermelha de vencidos, junto dos retornos
        vencidos — é o caso que mais precisa da sua atenção.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Baixa de estoque</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Num procedimento REALIZADO (data hoje ou passada), os itens que você adiciona são baixados de
        verdade assim que você salva. Num <strong>agendamento</strong>, a mesma seção some do formulário
        principal, aparece só dentro de <strong>Editar</strong> agendamento, com o rótulo "Itens de estoque
        previstos" — é só planejamento, não desconta nada do saldo. A baixa de verdade só acontece quando
        você confirma "Marcar como concluído" (veja acima). Um ícone de pacote cinza ao lado do procedimento,
        na aba Calendário de vacinação, indica que ele tem itens previstos — passe o mouse pra ver quais.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Opcional. Só aparecem para escolher os itens de estoque das categorias <strong>Medicamento</strong> e
        <strong> Vacina</strong> — as únicas que fazem sentido numa aplicação sanitária (suplemento, ração e
        sêmen não aparecem aqui). Para cada item usado, você adiciona uma linha com o item e a
        <strong> quantidade</strong>. Se a quantidade pedida for maior que o saldo disponível, o sistema
        recusa salvar o procedimento inteiro (não só a baixa) com a mensagem, por exemplo: <em>"Saldo
        insuficiente de 'Ivermectina 1%': disponível 50,0 ml, solicitado 80,0 ml."</em>
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Um ícone de pacote ao lado do procedimento na lista indica que ele baixou estoque — passe o mouse
        para ver o que foi usado.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 10, marginTop: 4 }}>Avisos importantes</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="purple" icon="ti-calendar-event"
          title="Agendamento não conta em nada até você confirmar"
          body='Um procedimento com data futura vira agendamento automaticamente — não entra na ficha do animal, não baixa estoque, não conta em indicadores nem no Assistente, mesmo depois que a data agendada já passou. Só passa a valer quando você mesmo clica em "Marcar como concluído".' />
        <AlertBox type="amber" icon="ti-shield-lock"
          title="Concluir com itens previstos sem saldo não conclui nada"
          body='Se algum item previsto não tiver saldo suficiente no momento da conclusão (ou tiver sido excluído do estoque desde o agendamento), o sistema recusa a conclusão inteira — nem o status muda, nem os itens que teriam saldo são baixados. O aviso mostra qual item e quanto falta. Edite o agendamento pra ajustar os itens previstos (ou registre entrada no estoque) e tente concluir de novo.' />
        <AlertBox type="green" icon="ti-info-circle"
          title="A baixa é por procedimento, não por animal"
          body='A quantidade que você digita é descontada UMA VEZ no total — mesmo que o procedimento esteja vinculado a 5 ou 50 animais de um lote. "80 ml de Ivermectina" desconta 80 ml do estoque, não 80 ml multiplicado pelos animais.' />
        <AlertBox type="amber" icon="ti-lock"
          title="Itens já baixados não podem ser editados"
          body='Ao editar um procedimento que já baixou estoque, os itens usados aparecem só como consulta (não dá pra mudar item nem quantidade). Para corrigir, exclua o procedimento — isso devolve os itens ao estoque — e registre de novo com os valores certos.' />
        <AlertBox type="amber" icon="ti-shield-lock"
          title="Excluir um procedimento com baixa exige permissão também de Estoque"
          body='Se o procedimento baixou itens do estoque, excluí-lo devolve essas quantidades — por isso o sistema também exige que você tenha permissão de edição no módulo Estoque, além de Sanidade. Sem ela, a exclusão é recusada com o aviso: "Este registro baixou itens do estoque. É necessária permissão de edição no módulo Estoque para excluí-lo."' />
        <AlertBox type="green" icon="ti-swords"
          title="Uma baixa de Sanidade só se desfaz por aqui, nunca pela tela Estoque"
          body='É proposital: se você for até Estoque → Movimentar tentar reverter uma linha marcada com o selo "Sanidade", o sistema recusa e te manda voltar pra cá. Isso é diferente de uma entrada/saída ligada a uma despesa ou receita do Financeiro, que pode ser desfeita dos dois lados — a diferença é que um procedimento de Sanidade pode baixar vários itens de uma vez, então só ele tem o contexto completo pra reverter direito.' />
      </div>
    </div>
  )
}
