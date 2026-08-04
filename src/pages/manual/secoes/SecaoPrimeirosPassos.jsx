import { useState } from 'react'
import { Field, AlertBox } from '../../../components/UI'

// ── Recriação do formulário real de "Nova fazenda" (Propriedade → aba
// Fazenda) — mesmos campos e componente <Field>, estado 100% local, não
// grava nada. Mesma convenção de demonstração usada em SecaoPesagens.jsx.
function DemoNovaFazenda() {
  const [demo, setDemo] = useState({ nome: '', localizacao: '', area_total: '' })

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
        <Field label="Nome da fazenda" required>
          <input value={demo.nome} onChange={e => setDemo(p => ({ ...p, nome: e.target.value }))} placeholder="ex: Fazenda São João" />
        </Field>
        <Field label="Localização">
          <input value={demo.localizacao} onChange={e => setDemo(p => ({ ...p, localizacao: e.target.value }))} placeholder="ex: Corumbá, MS" />
        </Field>
        <Field label="Área total (ha)">
          <input type="number" step="0.1" value={demo.area_total} onChange={e => setDemo(p => ({ ...p, area_total: e.target.value }))} />
        </Field>
        <Field label="Área útil (ha)" hint="No sistema real, esse campo é calculado sozinho a partir dos piquetes cadastrados — você não digita.">
          <input type="text" readOnly value="Cadastre piquetes para calcular" style={{ background: '#F3F4F6', color: '#9CA3AF', cursor: 'default' }} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" disabled><i className="ti ti-check" /> Criar fazenda</button>
      </div>
    </div>
  )
}

export default function SecaoPrimeirosPassos({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        Esta seção explica como o DigitalBov é organizado e o que fazer antes de começar a lançar dados de
        verdade: como entrar, como sua fazenda é cadastrada, quem pode acessar o quê, e alguns recursos gerais
        da tela que valem para o sistema inteiro.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Como você entra no sistema</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 12 }}>
        O DigitalBov é de <strong>acesso restrito</strong> — não existe cadastro público. Você recebe um
        e-mail e uma senha provisória de quem administra a conta da sua fazenda (o "dono"), e entra com eles
        na tela inicial. Se esqueceu a senha ou nunca recebeu um acesso, fale com o administrador da sua
        conta — só ele consegue criar novos usuários.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Como o sistema é organizado: Conta → Fazenda → Ciclo</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Conta</strong> — é o seu contrato com o DigitalBov. Pode ter uma ou várias fazendas dentro, e uma ou várias pessoas com acesso (dono, administradores, operadores).</li>
        <li><strong>Fazenda</strong> — uma propriedade cadastrada dentro da conta. Se você toca mais de uma fazenda, todas aparecem no seletor de fazenda na faixa superior da tela (ao lado do nome do módulo), e cada uma tem seu próprio rebanho, financeiro e índices — nada se mistura entre elas.</li>
        <li><strong>Ciclo</strong> — o "ano" de gestão de cada fazenda, sempre de <strong>1º de julho a 30 de junho</strong> do ano seguinte (ex: ciclo 2026/27 vai de 01/07/2026 a 30/06/2027). Praticamente tudo no sistema — lançamentos financeiros, índices de Metas, relatórios — é organizado por ciclo.</li>
      </ul>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Ainda na faixa superior, ao lado do seletor de ciclo, o botão <strong>"Mercado e Índices Nespro"</strong> abre
        em uma nova aba o site de índices e mercado de bovinos da Nespro/UFRGS — é só uma referência externa,
        não faz parte dos dados do DigitalBov.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Cadastrando uma fazenda</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 8, paddingLeft: 20 }}>
        <li>Vá em <strong>Propriedade → Configurações → Todas as fazendas</strong>.</li>
        <li>Clique em <strong>"Nova fazenda"</strong> (só donos e administradores veem este botão).</li>
        <li>Informe nome, localização e área total.</li>
        <li>Clique em <strong>Criar fazenda</strong>.</li>
      </ol>
      <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
        Experimente o formulário abaixo — é uma recriação exata da tela real, mas não grava nada:
      </p>
      <DemoNovaFazenda />
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Depois de criada, um <strong>tutorial guiado</strong> abre automaticamente (também pode ser reaberto a
        qualquer momento no botão "Abrir tutorial" da mesma tela) e leva você por 7 passos: dados da fazenda,
        valor da propriedade, proprietários, piquetes, lotes, um lembrete de que animais são cadastrados no
        módulo Cadastro de Animais, e planejamento. A maioria dos passos é opcional e pode ser preenchida
        depois — o tutorial só ajuda a não esquecer nada na primeira configuração.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Usuários e permissões</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Em <strong>Usuários</strong> (menu lateral), o dono e os administradores da conta cadastram operadores
        e definem exatamente o que cada um pode fazer:
      </p>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10, paddingLeft: 20 }}>
        <li><strong>Dono</strong> — quem contratou o sistema. Acesso total, não pode ser removido nem rebaixado.</li>
        <li><strong>Administrador</strong> — acesso total a todos os módulos de todas as fazendas, incluindo gerenciar outros usuários.</li>
        <li><strong>Operador</strong> — acesso configurado módulo por módulo, fazenda por fazenda: para cada módulo (Propriedade, Animais, Reprodutivo, Sanidade, Pesagens, Estoque, Financeiro, Metas, Relatórios, Rebanho) você escolhe entre <strong>Sem acesso</strong>, <strong>Ver</strong> (só consulta) ou <strong>Ver e editar</strong>.</li>
      </ul>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Passo a passo para adicionar um operador: clique em <strong>"Adicionar operador"</strong>, informe
        e-mail e uma senha provisória, e clique em <strong>Criar usuário</strong>. Em seguida, clique em
        <strong> "Gerenciar"</strong> ao lado do nome dele, escolha a fazenda (o vínculo com a fazenda é
        criado automaticamente assim que ele tem acesso "Ver" em pelo menos um módulo dela) e ajuste o nível
        de cada módulo. Clique em <strong>Aplicar</strong> para salvar.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Recursos gerais da tela</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Menu recolhível</strong> — no computador, a seta no canto do menu lateral recolhe o menu para uma faixa fina de ícones, deixando mais espaço de tela para tabelas e gráficos. A preferência fica salva neste computador/navegador.</li>
        <li><strong>Lançamento por voz</strong> — telas como Financeiro, Pesagens, Sanidade, Estoque e Reprodutivo têm um botão de microfone ao lado de alguns campos. Clique, fale a informação (ex: "brinco zero dois três um, quatrocentos quilos, intermediária") e o sistema tenta preencher o campo sozinho. Funciona só no Chrome ou Edge, e pede permissão do navegador para usar o microfone na primeira vez.</li>
      </ul>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>Avisos importantes</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="amber" icon="ti-user-x"
          title="Não existe cadastro próprio"
          body='Só quem já é dono/administrador da sua conta pode criar seu acesso. Se você não tem login, peça para o administrador te cadastrar em "Usuários".' />
        <AlertBox type="amber" icon="ti-calendar-x"
          title="Ciclo encerrado vira só-leitura"
          body="Depois que o ciclo termina (30/06), você ainda tem 180 dias de carência para ajustar lançamentos daquele ciclo. Depois disso, ele fica travado para consulta — não é mais possível lançar nem editar nada nele." />
        <AlertBox type="green" icon="ti-device-floppy"
          title="Menu recolhido não é por conta, é por aparelho"
          body="Se você recolher o menu no computador do escritório, o celular ou outro computador continuam mostrando o menu aberto — cada aparelho guarda essa preferência separadamente." />
      </div>
    </div>
  )
}
