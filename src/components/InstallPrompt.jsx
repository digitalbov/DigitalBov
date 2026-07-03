import { useState, useEffect } from 'react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position:'fixed', bottom:16, left:16, right:16, zIndex:9999,
      background:'#2B6CD9', color:'white', borderRadius:12, padding:'14px 16px',
      display:'flex', alignItems:'center', gap:12, boxShadow:'0 8px 24px rgba(0,0,0,.25)'
    }}>
      <img src="/pdf-marca.png" style={{width:40,height:40,borderRadius:8}} alt=""/>
      <div style={{flex:1}}>
        <div style={{fontSize:'.85rem',fontWeight:600}}>Instalar DigitalBov</div>
        <div style={{fontSize:'.75rem',opacity:.8}}>Acesso rápido direto da tela inicial</div>
      </div>
      <button onClick={install} style={{
        background:'white', color:'#2B6CD9', border:'none', borderRadius:8,
        padding:'8px 14px', fontWeight:600, fontSize:'.8rem', cursor:'pointer'
      }}>Instalar</button>
      <button onClick={()=>setShow(false)} style={{
        background:'transparent', border:'none', color:'white', opacity:.6,
        fontSize:18, cursor:'pointer', padding:4
      }}>×</button>
    </div>
  )
}
