import { useState } from 'react'

const MODULOS_DEMO = ['Animais', 'Financeiro', 'Estoque']

// ── Recriação do seletor de nível de acesso por módulo (Usuários → Gerenciar)
// — mesmas classes .pill/.pill-group da tela real, estado local, não grava
// nada. Mesma convenção de demonstração usada nas outras seções do manual.
function DemoNivelAcesso() {
  const [niveis, setNiveis] = useState({ Animais: 'ver', Financeiro: 'sem_acesso', Estoque: 'editar' })
  const LABEL = { sem_acesso: 'Sem acesso', ver: 'Ver', editar: 'Ver e editar' }

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {MODULOS_DEMO.map(mod => (
          <div key={mod} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '.5px solid #F3F4F6', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: '.85rem' }}>{mod}</span>
            <div className="pill-group">
              {['sem_acesso', 'ver', 'editar'].map(niv => (
                <button key={niv} type="button" className={`pill ${niveis[mod] === niv ? 'active' : ''}`}
                  onClick={() => setNiveis(p => ({ ...p, [mod]: niv }))}>
                  {LABEL[niv]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SecaoUsuarios({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Usuários</strong> (menu lateral, visível só para dono e administradores) é onde você
        cadastra quem mais tem acesso ao sistema e controla exatamente o que cada pessoa pode ver e mexer.
        Para entender a diferença entre Conta, Fazenda e os papéis dono/administrador/operador, veja a seção
        <strong> Primeiros Passos</strong> — aqui o foco é o passo a passo da tela.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: adicionar um operador</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li>Clique em <strong>"Adicionar operador"</strong>.</li>
        <li>Informe o <strong>e-mail</strong> e uma <strong>senha provisória</strong> (mínimo 6 caracteres) — é isso que a pessoa vai usar para entrar.</li>
        <li>Clique em <strong>Criar usuário</strong>. Por padrão ele entra sem acesso a nenhuma fazenda ainda.</li>
        <li>Na lista de usuários, clique em <strong>"Gerenciar"</strong> ao lado do nome dele.</li>
        <li>Escolha a <strong>fazenda</strong> que você quer configurar (se tiver mais de uma) — a bolinha verde ao lado do nome indica que ele já tem acesso a alguma coisa nela.</li>
        <li>Para cada módulo da lista, escolha <strong>Sem acesso</strong>, <strong>Ver</strong> ou <strong>Ver e editar</strong>.</li>
        <li>Clique em <strong>Aplicar</strong>. O vínculo dele com a fazenda é ligado ou desligado automaticamente, dependendo se sobrou algum módulo com acesso "Ver".</li>
      </ol>
      <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
        Experimente o seletor de nível abaixo — é uma recriação exata da tela real, mas não grava nada:
      </p>
      <DemoNivelAcesso />

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Promovendo, rebaixando e removendo</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>"Tornar admin"</strong> (ao lado de um operador) — dá acesso total a todos os módulos de todas as fazendas da conta, sem precisar configurar módulo por módulo.</li>
        <li><strong>"Tornar operador"</strong> (ao lado de um admin) — volta o acesso dele a ser controlado módulo por módulo, do jeito que estava configurado antes.</li>
        <li><strong>"Remover"</strong> — tira o acesso da pessoa a esta conta. O login dela continua existindo (ela pode ter acesso a outras contas), só perde a entrada nesta.</li>
        <li>O <strong>dono</strong> da conta não pode ser rebaixado nem removido por ninguém.</li>
      </ul>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Como funciona "Ver" x "Ver e editar"</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6 }}>
        <strong>Ver</strong> deixa a pessoa abrir a tela e consultar os dados, mas os botões de criar, editar e
        excluir ficam escondidos. <strong>Ver e editar</strong> libera tudo naquele módulo. Um operador pode
        ter, por exemplo, "Ver e editar" em Pesagens e Sanidade, só "Ver" em Financeiro, e "Sem acesso" em
        Estoque — cada módulo é independente, e as permissões valem só para a fazenda em que foram
        configuradas: se ele também tem acesso a uma segunda fazenda, o nível ali pode ser completamente
        diferente.
      </p>
    </div>
  )
}
