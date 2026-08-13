import { NavLink } from 'react-router-dom'
import { usePermissoes } from '../../lib/PermissoesContext'

const ITENS = [
  { path: '/',           icon: 'ti-layout-dashboard', label: 'Painel',     modulo: 'dashboard' },
  { path: '/animais',    icon: 'ti-paw',              label: 'Animais',    modulo: 'animais' },
  { path: '/financeiro', icon: 'ti-cash',             label: 'Financeiro', modulo: 'financeiro' },
  { path: '/rebanho',    icon: 'ti-chart-bar',        label: 'Rebanho',    modulo: 'rebanho' },
]

// "Mais" agora leva pra /modulos (tela inicial em cards com TODOS os
// módulos) em vez de abrir a sidebar em overlay — Rodada de layout, item 1.
// A tela de módulos já cobre tudo que a sidebar mostraria (inclusive
// Backup/Usuários/Tutorial, que não cabem nos 4 atalhos fixos acima), então
// vira a superfície de "ver tudo" no celular; o hamburger no topo continua
// abrindo a sidebar tradicional pra quem preferir aquele formato.
export default function BottomNav() {
  const { podeVer, ehAdmin } = usePermissoes()
  const visiveis = ITENS.filter(i => i.modulo === 'dashboard' || ehAdmin || podeVer(i.modulo))
  return (
    <nav className="bottom-nav">
      {visiveis.map(item => (
        <NavLink key={item.path} to={item.path} end={item.path === '/'}
          className={({isActive}) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
          <i className={`ti ${item.icon}`} />
          <span>{item.label}</span>
        </NavLink>
      ))}
      <NavLink to="/modulos" className={({isActive}) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
        <i className="ti ti-menu-2" />
        <span>Mais</span>
      </NavLink>
    </nav>
  )
}
