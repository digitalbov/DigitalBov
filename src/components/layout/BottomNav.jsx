import { NavLink } from 'react-router-dom'
import { usePermissoes } from '../../lib/PermissoesContext'

const ITENS = [
  { path: '/',           icon: 'ti-layout-dashboard', label: 'Início',     modulo: 'dashboard' },
  { path: '/animais',    icon: 'ti-paw',              label: 'Animais',    modulo: 'animais' },
  { path: '/financeiro', icon: 'ti-cash',             label: 'Financeiro', modulo: 'financeiro' },
  { path: '/rebanho',    icon: 'ti-chart-bar',        label: 'Rebanho',    modulo: 'rebanho' },
]

export default function BottomNav({ onMais }) {
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
      <button type="button" className="bottom-nav-item" onClick={onMais}>
        <i className="ti ti-menu-2" />
        <span>Mais</span>
      </button>
    </nav>
  )
}
