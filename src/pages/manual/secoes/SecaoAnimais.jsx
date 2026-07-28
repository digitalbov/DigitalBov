import { useState } from 'react'
import { Field, AlertBox } from '../../../components/UI'

// ── Recriação do formulário real de "Novo animal" (Animais.jsx) — mesmos
// campos e componente <Field>, estado 100% local, não grava nada. Mesma
// convenção de demonstração usada nas outras seções do manual.
function DemoNovoAnimal() {
  const [demo, setDemo] = useState({ brinco: '', sexo: 'F', data_nascimento: '', pai: '', mae_brinco: '' })

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
      <div className="grid-form">
        <Field label="Brinco" required>
          <input value={demo.brinco} onChange={e => setDemo(p => ({ ...p, brinco: e.target.value }))} placeholder="ex: 0231" />
        </Field>
        <Field label="Sexo" required>
          <select value={demo.sexo} onChange={e => setDemo(p => ({ ...p, sexo: e.target.value }))}>
            <option value="F">Fêmea</option>
            <option value="M">Macho</option>
          </select>
        </Field>
        <Field label="Data de nascimento" required>
          <input type="date" value={demo.data_nascimento} onChange={e => setDemo(p => ({ ...p, data_nascimento: e.target.value }))} />
        </Field>
        <Field label="Categoria" hint="Calculada automaticamente pela data de nascimento — você não escolhe.">
          <input type="text" readOnly value="—" style={{ background: '#F3F4F6', color: '#9CA3AF', cursor: 'default' }} />
        </Field>
        <Field label="Pai" hint="Texto livre — nome do touro, não um cadastro de animal.">
          <input value={demo.pai} onChange={e => setDemo(p => ({ ...p, pai: e.target.value }))} placeholder="Nome do touro" />
        </Field>
        <Field label="Mãe (brinco)" hint="Texto livre — precisa bater com o brinco cadastrado da mãe para a árvore genealógica encontrá-la.">
          <input value={demo.mae_brinco} onChange={e => setDemo(p => ({ ...p, mae_brinco: e.target.value }))} placeholder="ex: 03" />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" disabled><i className="ti ti-check" /> Salvar</button>
      </div>
    </div>
  )
}

export default function SecaoAnimais({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Cadastro de Animais</strong> é a ficha individual de cada animal do rebanho: dados
        básicos, genealogia (pai/mãe) e uma linha do tempo automática com tudo que já aconteceu com aquele
        animal em outros módulos (pesagem, inseminação, parto, aborto).
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: cadastrar um animal</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 8, paddingLeft: 20 }}>
        <li>Clique em <strong>"Novo animal"</strong>.</li>
        <li>Preencha <strong>brinco</strong>, <strong>sexo</strong> e <strong>data de nascimento</strong> — a <strong>categoria</strong> é calculada sozinha a partir da data de nascimento, você não escolhe.</li>
        <li>Se for um macho reprodutor, marque <strong>"É touro"</strong> — isso faz ele contar como Touro para sempre, não importa a idade.</li>
        <li>Preencha raça, pelagem, proprietário e, se já existir, o lote.</li>
        <li><strong>Pai</strong> e <strong>Mãe (brinco)</strong> são campos de texto livre, não uma busca no cadastro — preencha com cuidado, porque é esse texto que a árvore genealógica usa para tentar achar a mãe entre os animais já cadastrados.</li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>
      <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
        Experimente o formulário abaixo — é uma recriação exata da tela real, mas não grava nada:
      </p>
      <DemoNovoAnimal />

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Cadastro em lote pela planilha</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Para cadastrar muitos animais de uma vez: clique em <strong>"Plan. cadastro lote"</strong> para baixar
        a planilha modelo, preencha uma linha por animal (as mesmas colunas do formulário: brinco, sexo, data
        de nascimento, proprietário, raça, pelagem, pai, mãe, lote, situação), e depois clique em
        <strong> "Importar plan. cad. lote"</strong> e escolha o arquivo preenchido. O sistema mostra uma
        prévia com quantas linhas estão certas e quais têm erro (proprietário ou lote com nome que não bate
        com o cadastro, data em formato errado, sexo/situação inválidos, etc.) antes de importar — linhas com
        erro são ignoradas, o resto entra normalmente.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Genealogia e monta natural com vários touros</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Quando um bezerro nasce de um lote de <strong>monta natural com mais de um touro</strong> junto
        (Reprodutivo), o sistema não sabe qual touro é o pai de verdade — nesse caso o campo Pai é preenchido
        sozinho com algo como "Monta natural — Lote 4, Estação Repasse 26/27" em vez de um nome. Na ficha do
        animal e na árvore genealógica, esse "pai" aparece como um link clicável que leva direto ao lote de
        monta em Reprodutivo, para você conferir quais touros estavam juntos naquele período — em vez de um
        nome de touro comum, que não é clicável por não haver como confirmar de qual animal cadastrado
        aquele nome se refere.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Linha do tempo</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Mostra automaticamente, do mais recente para o mais antigo: nascimento, cada pesagem, cada
        inseminação (com o lote e o touro/sêmen usado), cada diagnóstico de gestação (prenha ou vazia), cada
        parto (tanto os que ela teve quanto o próprio nascimento dela, se foi registrado como bezerro) e cada
        aborto. Você não lança nada aqui — a linha do tempo só reúne o que já foi registrado nas telas
        Pesagens, Reprodutivo e no próprio Cadastro de Animais.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Como a categoria é calculada</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6, marginBottom: 10 }}>
        Sempre pela <strong>idade atual</strong> (data de hoje − data de nascimento), mais o sexo e — nas
        fêmeas — se está prenha:
      </p>
      <div style={{
        background: '#F3F4F6', borderRadius: 8, padding: '10px 14px',
        fontSize: '.82rem', color: '#111827', marginBottom: 10, lineHeight: 1.9,
      }}>
        <strong>Fêmeas</strong> — até 12 meses: Terneira · 13 a 24 meses: Novilha 13-24m (ou "Prenha" se
        estiver prenha) · 25 a 36 meses: Novilha 25-36m (ou Prenha) · 37 a 84 meses: Vaca Vazia ou Vaca Prenha
        · acima de 84 meses (7 anos): Vaca Madura Vazia ou Prenha.<br /><br />
        <strong>Machos</strong> — até 12 meses: Terneiro · 13 a 24 meses: Novilho 13-24m · 25 a 36 meses:
        Novilho 25-36m · acima de 36 meses: Boi. Marcado como "É touro": sempre <strong>Touro</strong>, não
        importa a idade.
      </div>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6 }}>
        Essa é a categoria "oficial" usada em filtros, no valor de mercado estimado e nos lotes — é diferente
        de uma marcação manual: se a situação reprodutiva da fêmea mudar (engravidar, parir, abortar), a
        categoria dela muda sozinha na próxima vez que a tela recalcular.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 10, marginTop: 14 }}>Avisos importantes</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="amber" icon="ti-calendar-x"
          title="Data de nascimento não pode ser futura"
          body="O sistema recusa salvar um animal com data de nascimento depois de hoje." />
        <AlertBox type="amber" icon="ti-lock"
          title="Animal com histórico não pode ser excluído"
          body='Se o animal já tem pesagem, inseminação ou parto registrado, o botão Excluir não funciona — use "Vender" ou marque como "Morto" para dar baixa nele sem perder o histórico.' />
        <AlertBox type="green" icon="ti-info-circle"
          title="Pai e mãe são texto livre"
          body='Não é uma busca automática: se você digitar o brinco da mãe errado ou diferente do cadastro dela, a árvore genealógica simplesmente não vai encontrar o vínculo.' />
      </div>
    </div>
  )
}
