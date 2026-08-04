import { AlertBox } from '../../../components/UI'

export default function SecaoBackup({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Backup e Dados</strong> tem 3 botões de exportação, todos da fazenda que você está
        vendo no momento:
      </p>

      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Backup Completo (.json)</strong> — todos os dados da fazenda num arquivo só: animais, proprietários, lotes, piquetes, reprodutivo (estações de monta, lotes de inseminação com os touros da monta natural, inseminações, partos, abortos), pesagens, sanidade (com o vínculo de cada procedimento aos animais tratados), estoque e movimentações, financeiro completo (com o rateio por proprietário de cada lançamento e o detalhe por animal de cada compra/venda) e ciclos, categorias de preço, metas, planejamento e simulações.</li>
        <li><strong>Exportar Animais (.xlsx)</strong> — planilha com o cadastro completo do rebanho (inclusive vendidos e mortos), com categoria calculada, genealogia, proprietário, lote e situação.</li>
        <li><strong>Exportar Financeiro (.xlsx)</strong> — lançamentos do ciclo atual, em planilha.</li>
      </ul>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        O arquivo .json começa com um cabeçalho de metadados — versão do formato, data em que foi gerado,
        conta e fazenda de origem, e a contagem de linhas de cada tabela — pensado para uma futura
        restauração conferir se o arquivo está íntegro antes de tocar em qualquer dado.
      </p>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Recomendação do próprio sistema: baixe o Backup Completo pelo menos uma vez por mês e guarde em local
        seguro (Google Drive, e-mail, pen drive).
      </p>

      <div className="card-title" style={{ fontSize: '1rem', marginTop: 24, marginBottom: 10 }}>
        <i className="ti ti-database-import" /> Restaurar um backup
      </div>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 12 }}>
        Ainda dentro de <strong>Backup e Dados</strong>, escolha um arquivo .json de Backup Completo para
        restaurar. Antes de qualquer coisa ser gravada no banco, o próprio navegador analisa o arquivo: confere
        se o formato é reconhecido, se as contagens declaradas batem com o que de fato está no arquivo e se não
        há nenhuma referência interna quebrada (ex.: um lançamento apontando para um proprietário que não existe
        no arquivo). Se algum desses testes falhar, nenhum botão de restauração aparece — só a lista dos
        problemas encontrados.
      </p>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 12 }}>
        Com o arquivo aprovado na validação, existem dois caminhos:
      </p>

      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li>
          <strong>Importar para fazenda nova</strong> — cria uma fazenda vazia na sua conta e grava nela todo o
          conteúdo do arquivo, com IDs novos para tudo. Nenhuma fazenda existente é tocada. É o caminho para
          recuperar um backup antigo sem mexer em nada do que já está em uso, ou para duplicar uma fazenda.
        </li>
        <li>
          <strong>Restaurar TUDO sobre a fazenda atual</strong> — só aparece quando o arquivo carregado é
          exatamente da fazenda e da conta que você está vendo no momento (senão o sistema explica a
          divergência e sugere trocar de fazenda ou usar "Importar para fazenda nova"). Apaga completamente o
          conteúdo atual da fazenda — animais, financeiro, reprodutivo, sanidade, estoque, tudo — e regrava
          exatamente o que está no arquivo, com os mesmos IDs originais. É <strong>irreversível</strong>. Por
          isso, antes de liberar o botão final, o sistema: avisa em vermelho o que vai ser apagado; lembra que
          a <strong>foto da fazenda não faz parte do backup</strong> (se ela for trocada depois deste arquivo,
          restaurar não traz a foto antiga de volta); obriga a baixar um backup de segurança do estado atual
          primeiro; e só libera o botão depois que você digitar o nome exato da fazenda para confirmar. Durante
          a restauração a tela mostra o andamento, e se o banco recusar por qualquer motivo (arquivo de outra
          fazenda/conta, formato não reconhecido, etc.) nada é alterado — a mensagem de erro do banco aparece
          de forma legível.
        </li>
      </ul>

      <AlertBox type="amber" icon="ti-photo"
        body="A foto da fazenda não é gravada no backup — depois de restaurar, a foto que está na fazenda no momento da restauração é a que permanece." />
    </div>
  )
}
