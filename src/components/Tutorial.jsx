import { useState } from 'react'

const TOPICOS = [
  {
    icon: '🧭', titulo: 'Visão Geral do Sistema',
    itens: [
      ['🔍', 'Filtros', 'Em cada módulo, use os filtros no topo das listas para encontrar rapidamente o que procura (por sexo, situação, lote, período).'],
      ['🤖', 'Assistente IA', 'Tire dúvidas e peça análises dos seus dados em linguagem natural. Alguns módulos aceitam comandos por voz.'],
      ['📅', 'Calendário', 'Veja todos os eventos da fazenda (partos, vacinas, movimentações) organizados por data.'],
      ['🎯', 'Metas e Indicadores', 'Defina metas (prenhez, parição, GMD, mortalidade) e acompanhe seus índices zootécnicos em tempo real.'],
    ]
  },
  {
    icon: '📱', titulo: 'Instalar no Celular', compacto: true,
    itens: [
      ['📲', 'Instale como aplicativo', 'O DigitalBov funciona como um app no seu celular, com ícone na tela inicial e acesso rápido, sem precisar baixar de nenhuma loja.'],
      ['🤖', 'No Android (Chrome)', 'Abra o site no Chrome, toque no menu (três pontinhos) no canto superior direito e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".'],
      ['🍎', 'No iPhone (Safari)', 'Abra o site no Safari, toque no botão de compartilhar (quadrado com seta para cima) e escolha "Adicionar à Tela de Início".'],
      ['⚡', 'Vantagens', 'Depois de instalado, o app abre em tela cheia, carrega mais rápido e fica sempre à mão, como qualquer outro aplicativo do seu celular.'],
    ]
  },
  {
    icon: '🏡', titulo: 'Propriedade',
    itens: [
      ['🏢', 'Várias fazendas', 'Você pode cadastrar e gerenciar mais de uma fazenda na mesma conta, trocando entre elas pelo menu.'],
      ['👤', 'Proprietários', 'Cadastre os donos dos animais — útil para separar rebanhos de diferentes pessoas.'],
      ['🌿', 'Piquetes', 'Registre suas áreas de pastagem, com controle de status (em uso / em descanso).'],
      ['📦', 'Lotes', 'Organize o rebanho em grupos (matrizes, recria, engorda) e selecione os animais de cada lote.'],
    ]
  },
  {
    icon: '👥', titulo: 'Usuários e Permissões',
    itens: [
      ['➕', 'Adicionar operadores', 'Como administrador, crie acessos para seus colaboradores direto na tela Usuários.'],
      ['🔐', 'Permissões por módulo', 'Para cada colaborador, defina em quais fazendas ele atua e o que pode fazer: apenas Ver ou também Editar cada módulo.'],
      ['⭐', 'Administradores', 'Você pode promover um colaborador a administrador, dando a ele acesso total de gestão.'],
    ]
  },
  {
    icon: '🐄', titulo: 'Cadastro de Animais',
    itens: [
      ['📝', 'Ficha completa', 'Cadastre cada animal com brinco, sexo, raça, data de nascimento, proprietário e lote.'],
      ['🔗', 'Vínculos', 'Associe o animal a um lote e acompanhe sua situação reprodutiva.'],
      ['✏️', 'Edição', 'Atualize os dados a qualquer momento e filtre a lista para encontrar animais rapidamente.'],
    ]
  },
  {
    icon: '📊', titulo: 'Controle de Rebanho',
    itens: [
      ['📈', 'Visão geral', 'Acompanhe a composição do rebanho por categoria, sexo e faixa etária.'],
      ['🔢', 'Índices', 'Veja indicadores consolidados do seu rebanho.'],
      ['💲', 'Valor do rebanho', 'Estime o valor patrimonial do rebanho a partir das categorias de preço.'],
    ]
  },
  {
    icon: '🧬', titulo: 'Painel Reprodutivo',
    itens: [
      ['💉', 'Lotes de inseminação', 'Monte lotes de inseminação selecionando fêmeas vazias, com filtro por lote.'],
      ['🔬', 'Diagnóstico', 'Registre o diagnóstico (prenha/vazia) de cada fêmea — a situação do animal é atualizada automaticamente.'],
      ['🐮', 'Nascimentos', 'Registre partos e nascimentos; o bezerro é cadastrado automaticamente no rebanho.'],
    ]
  },
  {
    icon: '💉', titulo: 'Sanidade',
    itens: [
      ['🩺', 'Procedimentos', 'Registre vacinas, vermífugos e outros procedimentos sanitários.'],
      ['🔔', 'Alertas', 'Acompanhe alertas de próximas aplicações e vencimentos.'],
      ['📋', 'Histórico', 'Consulte o histórico sanitário completo do rebanho.'],
    ]
  },
  {
    icon: '⚖️', titulo: 'Pesagens',
    itens: [
      ['⚖️', 'Registro', 'Registre pesagens individuais dos animais.'],
      ['📈', 'Desempenho', 'Acompanhe o ganho de peso (GMD) e a evolução de cada animal.'],
      ['🔮', 'Projeção', 'Veja projeções de peso com base no histórico.'],
    ]
  },
  {
    icon: '📦', titulo: 'Estoque',
    itens: [
      ['📥', 'Itens', 'Cadastre insumos (medicamentos, ração, sal) com quantidade e preço.'],
      ['🔄', 'Movimentações', 'Registre entradas e saídas para manter o saldo atualizado.'],
      ['⚠️', 'Alertas', 'Seja avisado quando um item atingir o estoque mínimo.'],
    ]
  },
  {
    icon: '💰', titulo: 'Gestão Financeira',
    itens: [
      ['🔁', 'Ciclos', 'O sistema organiza suas finanças por ciclo (safra).'],
      ['📒', 'Lançamentos', 'Registre receitas e despesas do dia a dia.'],
      ['🐂', 'Compra e venda', 'Registre transações de compra e venda de animais.'],
      ['📊', 'Resultados', 'Acompanhe o resultado do ciclo e a rentabilidade.'],
    ]
  },
  {
    icon: '📄', titulo: 'Relatórios',
    itens: [
      ['🖨️', 'PDF profissional', 'Gere relatórios em PDF de qualquer módulo, com a identidade da sua fazenda.'],
      ['📑', 'Por seção', 'Cada aba tem seu próprio relatório pronto para imprimir ou compartilhar.'],
    ]
  },
  {
    icon: '💾', titulo: 'Backup e Dados',
    itens: [
      ['💾', 'Segurança', 'Seus dados ficam salvos na nuvem com segurança e isolamento por conta.'],
      ['📤', 'Exportação', 'Exporte seus dados quando precisar.'],
    ]
  },
]

export default function Tutorial({ onClose, onNaoMostrarMais }) {
  const [atual, setAtual] = useState(0)
  const topico = TOPICOS[atual]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <style>{`
        .tutorial-menu-mobile { display: none; }
        @media (max-width: 768px) {
          .tutorial-body          { flex-direction: column; }
          .tutorial-menu-desktop  { display: none; }
          .tutorial-menu-mobile   { display: block; }
          .tutorial-content-body  { padding: 16px !important; }
          .tutorial-footer        { flex-direction: column; align-items: stretch !important; gap: 10px !important; padding: 14px 16px !important; }
          .tutorial-footer-right  { flex-direction: column; align-items: stretch !important; width: 100%; gap: 8px !important; }
          .tutorial-footer-actions { flex-direction: column; width: 100%; }
          .tutorial-footer-actions .btn { width: 100%; justify-content: center; }
          .tutorial-footer-skip  { text-align: center; }
          .tutorial-footer-close { align-self: flex-end; }
        }
      `}</style>
      <div className="tutorial-body" style={{ background:'white', borderRadius:16, width:'100%', maxWidth:'min(95vw, 860px)', maxHeight:'90vh', height:'88vh', display:'flex', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,.35)' }}>

        {/* Menu lateral de tópicos — desktop */}
        <div className="tutorial-menu-desktop" style={{ width:230, flexShrink:0, background:'#F3F4F6', borderRight:'.5px solid #E5E7EB', overflowY:'auto', padding:'12px 0' }}>
          <div style={{ padding:'8px 16px 12px', fontWeight:700, fontSize:'.9rem', color:'#1a1a1a' }}>Tutorial</div>
          {TOPICOS.map((t, i) => (
            <button key={i} onClick={() => setAtual(i)}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', border:'none',
                background: i===atual ? 'linear-gradient(90deg,#2B6CD9,#7B2FBE)' : 'transparent',
                color: i===atual ? 'white' : '#374151', cursor:'pointer', padding:'9px 16px', fontSize:'.82rem', fontFamily:'inherit' }}>
              <span>{t.icon}</span> {t.titulo}
            </button>
          ))}
        </div>

        {/* Conteúdo do tópico */}
        <div style={{ flex:1, minWidth:0, minHeight:0, display:'flex', flexDirection:'column' }}>
          {/* Menu de tópicos — mobile (dropdown) */}
          <div className="tutorial-menu-mobile" style={{ padding:'12px 16px', borderBottom:'.5px solid #E5E7EB', flexShrink:0 }}>
            <select
              value={atual}
              onChange={e => setAtual(Number(e.target.value))}
              style={{ width:'100%' }}
            >
              {TOPICOS.map((t, i) => (
                <option key={i} value={i}>{t.icon} {t.titulo}</option>
              ))}
            </select>
          </div>

          <div className="tutorial-content-body" style={{ padding:'24px 28px', overflowY:'auto', flex:1, minHeight:0 }}>
            <div style={{ fontSize: topico.compacto ? '1.6rem' : '2rem', marginBottom:4 }}>{topico.icon}</div>
            <h2 style={{ fontSize: topico.compacto ? '1.15rem' : '1.4rem', fontWeight:700, color:'#1a1a1a', marginBottom: topico.compacto ? 14 : 20 }}>{topico.titulo}</h2>
            <div style={{ display:'flex', flexDirection:'column', gap: topico.compacto ? 10 : 14 }}>
              {topico.itens.map(([ic, tit, desc]) => (
                <div key={tit} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                  <span style={{ fontSize: topico.compacto ? '1.15rem' : '1.4rem', flexShrink:0 }}>{ic}</span>
                  <div>
                    <div style={{ fontWeight:600, color:'#1a1a1a', fontSize: topico.compacto ? '.86rem' : '.92rem' }}>{tit}</div>
                    <div style={{ color:'#6B7280', fontSize: topico.compacto ? '.78rem' : '.85rem', lineHeight: topico.compacto ? 1.4 : 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rodapé com navegação */}
          <div className="tutorial-footer" style={{ borderTop:'.5px solid #E5E7EB', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexShrink:0 }}>
            <div style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{atual+1} de {TOPICOS.length}</div>
            <div className="tutorial-footer-right" style={{ display:'flex', alignItems:'center', gap:8 }}>
              {onNaoMostrarMais && (
                <button className="tutorial-footer-skip" onClick={onNaoMostrarMais} style={{ background:'none', border:'none', color:'#6B7280', cursor:'pointer', fontSize:'.8rem', textDecoration:'underline', fontFamily:'inherit' }}>
                  Não mostrar novamente
                </button>
              )}
              <div className="tutorial-footer-actions" style={{ display:'flex', gap:8 }}>
                <button onClick={() => setAtual(a => Math.max(0, a-1))} disabled={atual===0}
                  className="btn btn-secondary btn-sm">Anterior</button>
                {atual < TOPICOS.length-1
                  ? <button onClick={() => setAtual(a => a+1)} className="btn btn-primary btn-sm">Próximo</button>
                  : <button onClick={onNaoMostrarMais || onClose} className="btn btn-primary btn-sm">Concluir</button>}
              </div>
              <button className="tutorial-footer-close" onClick={onClose} style={{ background:'none', border:'none', color:'#6B7280', cursor:'pointer', fontSize:'1.2rem', fontFamily:'inherit', padding:'0 4px' }} title="Fechar">×</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
