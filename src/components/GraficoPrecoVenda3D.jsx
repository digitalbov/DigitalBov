import { useState, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
// Import direto de cada submódulo do drei (em vez do barrel '@react-three/drei')
// — o barrel reexporta ~100 helpers e mesmo sem usá-los o bundler não conseguia
// eliminar tudo, quase dobrando o tamanho do chunk. Rótulo de categoria usa
// <Html> (posicionamento leve) em vez de <Text> (troika-three-text, pesado).
import { Line } from '@react-three/drei/core/Line'
import { OrbitControls } from '@react-three/drei/core/OrbitControls'
import { Html } from '@react-three/drei/web/Html'
import { fmtData, fmtMoeda } from '../lib/helpers'

// Carregado só quando este componente é importado via React.lazy (ver Metas.jsx)
// — three.js/@react-three/fiber/drei nunca entram no bundle inicial do app.

const CORES_3D = ['#2B6CD9', '#7B2FBE', '#DB2777', '#D97706', '#166534', '#0C447C', '#DC2626', '#0891B2']

const LARGURA    = 10   // extensão em X (tempo)
const ALTURA_MAX = 3    // extensão máxima em Y (preço) — normalizado, não é kg/R$ real
const PROF_LANE  = 1.1  // espaçamento em Z entre categorias (uma "pista" por categoria)

// Normaliza datas/preços pra um espaço 3D fixo (0..LARGURA em X, 0..ALTURA_MAX em
// Y). A escala Y é sempre a mesma independente da unidade (kg/arroba) — o toggle
// de unidade (ver componente principal) só muda o RÓTULO exibido, nunca a posição
// dos pontos, senão a curva pareceria mudar de formato ao trocar de unidade.
function construirSeriesPosicionadas(series, minData, maxData, minPreco, maxPreco) {
  const spanData  = Math.max(1, maxData - minData)
  const spanPreco = Math.max(0.01, maxPreco - minPreco)
  return series.map((serie, i) => ({
    categoria: serie.categoria,
    cor: CORES_3D[i % CORES_3D.length],
    z: i * PROF_LANE,
    pontos: serie.pontos.map(p => {
      const t = new Date(p.data + 'T12:00:00').getTime()
      return {
        x: ((t - minData) / spanData) * LARGURA,
        y: ((p.precoKg - minPreco) / spanPreco) * ALTURA_MAX,
        z: i * PROF_LANE,
        data: p.data,
        precoKg: p.precoKg,
      }
    }),
  }))
}

function LinhaCategoria({ serie, visivel, onHover, onLeave }) {
  if (!visivel || serie.pontos.length === 0) return null
  const pts = serie.pontos.map(p => [p.x, p.y, p.z])
  const ultimo = pts[pts.length - 1]
  return (
    <group>
      {pts.length > 1 && <Line points={pts} color={serie.cor} lineWidth={2.5} />}
      {serie.pontos.map((p, i) => (
        <mesh
          key={i}
          position={[p.x, p.y, p.z]}
          castShadow
          onPointerOver={(e) => { e.stopPropagation(); onHover(serie, p) }}
          onPointerOut={() => onLeave()}
        >
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshStandardMaterial color={serie.cor} />
        </mesh>
      ))}
      <Html position={[ultimo[0] + 0.3, ultimo[1], serie.z]} style={{ pointerEvents: 'none' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: serie.cor, whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(255,255,255,.8)' }}>
          {serie.categoria}
        </span>
      </Html>
    </group>
  )
}

function Cena({ series, visiveis, onHover, onLeave }) {
  const profTotal = Math.max(0, (series.length - 1) * PROF_LANE)
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 8, 5]} intensity={0.9} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LARGURA / 2, -0.02, profTotal / 2]} receiveShadow>
        <planeGeometry args={[LARGURA + 3, profTotal + 3]} />
        <meshStandardMaterial color="#F3F4F6" />
      </mesh>
      <gridHelper
        args={[Math.max(LARGURA, profTotal) + 3, 20, '#E5E7EB', '#E5E7EB']}
        position={[LARGURA / 2, -0.01, profTotal / 2]}
      />
      {series.map(s => (
        <LinhaCategoria key={s.categoria} serie={s} visivel={visiveis[s.categoria] !== false} onHover={onHover} onLeave={onLeave} />
      ))}
    </>
  )
}

export default function GraficoPrecoVenda3D({ series }) {
  const [unidade,  setUnidade]  = useState('kg') // 'kg' | 'arroba'
  const [visiveis, setVisiveis] = useState({})
  const [hover,    setHover]    = useState(null)

  const { seriesPos } = useMemo(() => {
    const todasDatas  = series.flatMap(s => s.pontos.map(p => new Date(p.data + 'T12:00:00').getTime()))
    const todosPrecos = series.flatMap(s => s.pontos.map(p => p.precoKg))
    if (todasDatas.length === 0) return { seriesPos: [] }
    const minData  = Math.min(...todasDatas),  maxData  = Math.max(...todasDatas)
    const minPreco = Math.min(...todosPrecos), maxPreco = Math.max(...todosPrecos)
    return { seriesPos: construirSeriesPosicionadas(series, minData, maxData, minPreco, maxPreco) }
  }, [series])

  if (seriesPos.length === 0) {
    return <p style={{ color: '#9CA3AF', fontSize: '.82rem', textAlign: 'center', padding: '28px 0' }}>Sem vendas com preço/kg registradas ainda.</p>
  }

  const fmtValor = (precoKg) => {
    const v = unidade === 'arroba' ? precoKg * 15 : precoKg
    return `${fmtMoeda(v)}/${unidade === 'arroba' ? '@' : 'kg'}`
  }

  const toggleCategoria = (cat) => setVisiveis(p => ({ ...p, [cat]: p[cat] === false ? true : false }))

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {seriesPos.map(s => (
            <button
              key={s.categoria}
              onClick={() => toggleCategoria(s.categoria)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none',
                cursor: 'pointer', fontSize: '.76rem', padding: '2px 6px', borderRadius: 6,
                opacity: visiveis[s.categoria] === false ? .35 : 1,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.cor, display: 'inline-block' }} />
              {s.categoria}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUnidade(u => u === 'kg' ? 'arroba' : 'kg')}>
          Eixo: {unidade === 'kg' ? 'R$ / kg' : 'R$ / @'}
        </button>
      </div>

      <div style={{ position: 'relative', height: 360, borderRadius: 10, overflow: 'hidden', background: 'linear-gradient(180deg,#F9FAFB,#F3F4F6)' }}>
        <Canvas shadows camera={{ position: [LARGURA * 0.7, ALTURA_MAX * 2.2, seriesPos.length * PROF_LANE + 6], fov: 40 }}>
          <Cena series={seriesPos} visiveis={visiveis} onHover={(s, p) => setHover({ s, p })} onLeave={() => setHover(null)} />
          <OrbitControls enablePan={false} minDistance={4} maxDistance={20} />
        </Canvas>
        {hover && (
          <div style={{
            position: 'absolute', top: 10, left: 10, background: '#fff', border: '1px solid #E5E7EB',
            borderRadius: 8, padding: '6px 10px', fontSize: '.78rem', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
            pointerEvents: 'none',
          }}>
            <strong style={{ color: hover.s.cor }}>{hover.s.categoria}</strong><br />
            {fmtData(hover.p.data)} · {fmtValor(hover.p.precoKg)}
          </div>
        )}
      </div>
      <div style={{ fontSize: '.7rem', color: '#9CA3AF', marginTop: 6, textAlign: 'center' }}>
        Arraste para girar · role para zoom · clique na legenda pra isolar/ocultar uma categoria
      </div>
    </div>
  )
}
