import { Component } from 'react'

// Sem isto, qualquer erro de JS numa tela (ex: acesso a propriedade de undefined)
// desmontava a árvore inteira do React e a tela ficava em branco, sem nenhuma
// mensagem — sidebar incluída. Isolado no conteúdo da página (ver Layout.jsx),
// então um erro numa tela não derruba a navegação.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] erro ao renderizar a tela:', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 40, marginBottom: 12, color: '#E24B4A' }} />
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#374151' }}>Esta tela encontrou um erro</div>
          <div style={{ fontSize: '.85rem', marginBottom: 14 }}>{this.state.error.message || String(this.state.error)}</div>
          <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
            <i className="ti ti-refresh" /> Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
