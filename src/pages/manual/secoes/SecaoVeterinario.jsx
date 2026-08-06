import { AlertBox } from '../../../components/UI'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }
const UL_DISC = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20, listStyle: 'disc' }

export default function SecaoVeterinario({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        O módulo <strong>Veterinário</strong> é um cadastro à parte, dedicado a quem presta serviço veterinário
        para as fazendas da conta. Diferente de todo o resto do sistema, os dados deste módulo pertencem à
        <strong> conta</strong>, não a uma fazenda específica — existe um único cadastro de veterinário, financeiro,
        lista de clientes e histórico de atestados, compartilhados entre todas as fazendas da conta. Ele não se
        conecta ao restante do sistema, com uma única exceção: as fazendas cadastradas aparecem automaticamente
        como clientes pré-cadastrados.
      </p>

      <AlertBox type="amber" icon="ti-alert-triangle" title="Não coberto pelo backup de fazenda"
        body={'Os dados deste módulo (configuração, categorias, clientes, ciclos, lançamentos e histórico de atestados) ' +
          'NÃO entram no "Baixar Backup Completo" nem nos dois caminhos de restauração (Backup e Dados) — esses ' +
          'mecanismos operam por FAZENDA, e este módulo é por CONTA, na mesma categoria de Usuários/Permissões, que ' +
          'também já ficam fora do backup de fazenda hoje. É uma lacuna conhecida, não um esquecimento.'} />

      <div style={H4}>Configuração</div>
      <p style={P}>
        Nome, CRV, slogan, telefone, e-mail e dados bancários (banco, agência, conta, PIX) do veterinário, além do
        logo — usado no cabeçalho de todos os documentos gerados, sempre em proporção original (nunca recortado em
        círculo, diferente da foto de fazenda).
      </p>

      <div style={H4}>Financeiro</div>
      <p style={P}>
        Lançamentos de receita e despesa em R$, com categoria (criada livremente) e cliente opcional. O
        fechamento é organizado em <strong>ciclos independentes</strong> — períodos configurados pelo próprio
        veterinário, sem relação com o ciclo pecuário/financeiro do resto do sistema. O saldo transportado de um
        ciclo para o seguinte é sempre <strong>calculado na hora</strong>, a partir dos lançamentos — nunca gravado,
        então nunca fica desatualizado.
      </p>

      <div style={H4}>Clientes</div>
      <p style={P}>
        Toda fazenda cadastrada na conta aparece aqui automaticamente como cliente pronto para uso, na primeira
        vez que a aba é aberta. É uma <strong>cópia</strong> do nome da fazenda no momento em que ela apareceu, não
        um espelho ao vivo — se a fazenda for renomeada depois, o cliente mantém o nome antigo até alguém clicar
        em "sincronizar nome" manualmente. Isso é proposital: uma prestação de contas já emitida não deve mudar
        retroativamente por causa de um rename, e excluir uma fazenda não apaga o histórico financeiro do
        veterinário associado a ela.
      </p>

      <div style={H4}>Documentos</div>
      <ul style={UL_DISC}>
        <li><strong>Prestação de contas</strong> — relatório do que já foi lançado para um cliente (não é
          orçamento prévio): escolha o cliente, marque quais lançamentos apropriados a ele entram, e adicione
          itens manuais livremente — eles aparecem no PDF com a mesma formatação dos apropriados, sem nenhuma
          diferenciação visual. Termina com o total, dados bancários e espaço para assinatura.</li>
        <li><strong>Atestados — 4 tipos, todos com 1 ou vários animais no mesmo documento</strong>: Atestado de
          Prenhez, Atestado de Brucelose, Exame Andrológico e Comprovante de Vacinação (Brucelose, cepa B19).
          A tabela de animais do modal foi pensada para digitação em sequência, sem tirar a mão do teclado:
          digite o brinco (e os demais campos da linha, se houver) e dê <strong>Tab</strong> — ao sair do último
          campo da última linha, uma linha nova já aparece com o cursor nela, pronta pro próximo animal.
          <strong>Enter</strong> faz a mesma coisa que Tab em qualquer campo. Clicar fora da tabela depois de
          preencher o brinco da última linha tem o mesmo efeito. Uma linha em branco sempre sobra no fim — é
          esperado, ela é descartada sozinha ao emitir, sem aviso. Linhas do meio podem ser removidas a qualquer
          momento pelo ícone de lixeira. Em <strong>Atestado de Prenhez</strong>, <strong>Atestado de
          Brucelose</strong> e <strong>Comprovante de Vacinação</strong> a descrição é única para o documento
          inteiro (ex: "vacas Nelore, 3 anos" ou "terneiras Nelore" vale pra todo o lote) — só o brinco é por
          animal. No <strong>Exame Andrológico</strong> a descrição continua por animal (cada touro é avaliado
          individualmente, raça/idade podem variar de um pra outro). Com
          <strong> 1 único animal</strong>, o texto sai corrido, mencionando o animal na própria frase; com
          <strong> 2 ou mais</strong>, os animais saem numa tabela abaixo do texto. O Exame Andrológico é a
          exceção: sai <strong>sempre em tabela</strong>, mesmo com 1 animal só, porque tem valores demais por
          animal (circunferência escrotal, motilidade, vigor, defeitos maiores/menores, classificação — Apto /
          Questionável / Inapto) para caber em texto corrido. O
          Comprovante de Vacinação tem campos próprios da vacina (fabricante, nome comercial, lote, validade) e,
          por animal, data de nascimento e a marcação aplicada. Toda emissão fica no histórico com todos os
          animais e campos, com opção de reemitir sem redigitar nada.</li>
      </ul>

      <div style={H4}>Permissões</div>
      <p style={P}>
        Como qualquer outro módulo: o administrador concede "Ver" ou "Ver e editar" por usuário, na tela de
        Usuários. Só um detalhe próprio deste módulo — a concessão continua sendo por fazenda (mesmo mecanismo dos
        demais), mas o dado é o mesmo em qualquer fazenda da conta; para um operador enxergar o módulo
        independente de qual fazenda tem selecionada, conceda a permissão em todas as fazendas dele.
      </p>
    </div>
  )
}
