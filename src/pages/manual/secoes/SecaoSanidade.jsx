import { useState } from 'react'
import { Field, AlertBox, Badge } from '../../../components/UI'

const TIPOS_DEMO = ['Vacina', 'Vermifugação', 'Ectoparasita', 'Medicação', 'Exame']

// ── Recriação do seletor "Por lote" / "Individual" (Sanidade.jsx) — mesmas
// classes .pill/.pill-group da tela real, estado local, não grava nada.
function DemoSelecaoProcedimento() {
  const [modo, setModo] = useState('lote')
  const [tipo, setTipo] = useState('Vacina')

  return (
    <div style={{
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
        <li><strong>Registros</strong> — lista de procedimentos já lançados, com o formulário de novo procedimento.</li>
        <li><strong>Alertas</strong> — retornos vencidos e próximos (30 dias), com um calendário sanitário dos próximos 90 dias.</li>
        <li><strong>Histórico</strong> — consulta geral dos procedimentos por período/animal.</li>
      </ul>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: registrar um procedimento</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 8, paddingLeft: 20 }}>
        <li>Clique em <strong>"Novo procedimento"</strong>.</li>
        <li>Escolha o <strong>tipo</strong> (Vacina, Vermifugação, Ectoparasita, Medicação ou Exame), a <strong>data</strong> e descreva o <strong>procedimento</strong> (ex: "Ivermectina 1%").</li>
        <li>Escolha <strong>Por lote</strong> (marca lotes inteiros) ou <strong>Individual</strong> (marca animais um a um, com filtro por categoria/proprietário).</li>
        <li>A <strong>quantidade de animais</strong> é preenchida sozinha a partir da seleção — só conta quem já tinha nascido na data do procedimento.</li>
        <li>Se quiser, dê baixa em itens do estoque (veja abaixo) e/ou defina a <strong>próxima aplicação</strong> (data do retorno).</li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>
      <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
        Experimente o seletor abaixo — é uma recriação exata da tela real, mas não grava nada:
      </p>
      <DemoSelecaoProcedimento />

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Agenda de retorno</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Se você preencher <strong>"Próxima aplicação"</strong> ao registrar o procedimento, ele entra na aba
        <strong> Alertas</strong>: aparece em vermelho se já venceu, em amarelo se vence nos próximos 30 dias.
        Um botão <strong>"Marcar como concluído"</strong> fecha o alerta e já oferece registrar a nova
        aplicação na hora, com a data de hoje.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Baixa de estoque</h4>
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
        <AlertBox type="green" icon="ti-info-circle"
          title="A baixa é por procedimento, não por animal"
          body='A quantidade que você digita é descontada UMA VEZ no total — mesmo que o procedimento esteja vinculado a 5 ou 50 animais de um lote. "80 ml de Ivermectina" desconta 80 ml do estoque, não 80 ml multiplicado pelos animais.' />
        <AlertBox type="amber" icon="ti-lock"
          title="Itens já baixados não podem ser editados"
          body='Ao editar um procedimento que já baixou estoque, os itens usados aparecem só como consulta (não dá pra mudar item nem quantidade). Para corrigir, exclua o procedimento — isso devolve os itens ao estoque — e registre de novo com os valores certos.' />
        <AlertBox type="amber" icon="ti-shield-lock"
          title="Excluir um procedimento com baixa exige permissão também de Estoque"
          body='Se o procedimento baixou itens do estoque, excluí-lo devolve essas quantidades — por isso o sistema também exige que você tenha permissão de edição no módulo Estoque, além de Sanidade. Sem ela, a exclusão é recusada com o aviso: "Este registro baixou itens do estoque. É necessária permissão de edição no módulo Estoque para excluí-lo."' />
      </div>
    </div>
  )
}
