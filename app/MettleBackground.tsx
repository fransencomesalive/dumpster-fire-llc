'use client'

import { useEffect, useRef } from 'react'
import styles from './MettleBackground.module.css'

type MeshDef = { hex: string; rMin: number; rMax: number; a0: string }

// Original MTTL Grain Background — node hex colors adapted to dumpster-fire palette
// Parameters (velocity, grain density, blur, alpha stops, bounce) are locked per preset
const MESH_DEFS: MeshDef[] = [
  { hex: '#1e8c41', rMin: 0.55, rMax: 0.75, a0: 'dd' },
  { hex: '#0c4b20', rMin: 0.20, rMax: 0.30, a0: '66' },
  { hex: '#158929', rMin: 0.38, rMax: 0.52, a0: '99' },
  { hex: '#c9981f', rMin: 0.50, rMax: 0.68, a0: 'cc' },
  { hex: '#d4a828', rMin: 0.52, rMax: 0.70, a0: 'cc' },
  { hex: '#7c4a10', rMin: 0.18, rMax: 0.28, a0: '55' },
  { hex: '#e5b535', rMin: 0.48, rMax: 0.65, a0: 'cc' },
  { hex: '#03240a', rMin: 0.15, rMax: 0.25, a0: '44' },
]

type MeshNode = {
  x: number; y: number
  vx: number; vy: number
  hex: string; a0: string; r: number
}

function initMeshNodes(): MeshNode[] {
  return MESH_DEFS.map(def => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.00025,
    vy: (Math.random() - 0.5) * 0.00025,
    hex: def.hex, a0: def.a0,
    r: def.rMin + Math.random() * (def.rMax - def.rMin),
  }))
}

function drawMesh(ctx: CanvasRenderingContext2D, nodes: MeshNode[], W: number, H: number) {
  ctx.fillStyle = '#070f0a'
  ctx.fillRect(0, 0, W, H)
  nodes.forEach(n => {
    const cx = n.x * W, cy = n.y * H, r = n.r * Math.max(W, H)
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    grd.addColorStop(0, n.hex + n.a0)
    grd.addColorStop(0.55, n.hex + '55')
    grd.addColorStop(1, n.hex + '00')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, H)
  })
}

export default function MettleBackground() {
  const bgRef = useRef<HTMLCanvasElement>(null)
  const grainRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const bg = bgRef.current, grain = grainRef.current
    if (!bg || !grain) return

    const bgCtx = bg.getContext('2d')!, ctx = grain.getContext('2d')!
    let W = window.innerWidth, H = window.innerHeight
    const DPR = window.devicePixelRatio || 1
    let PW = 0, PH = 0, imgData = ctx.createImageData(1, 1), grainCount = 0
    const meshNodes = initMeshNodes()

    const resize = () => {
      W = window.innerWidth; H = window.innerHeight
      PW = Math.floor(W * DPR); PH = Math.floor(H * DPR)
      bg.width = W; bg.height = H
      grain.width = PW; grain.height = PH
      grain.style.width = `${W}px`; grain.style.height = `${H}px`
      imgData = ctx.createImageData(PW, PH)
      grainCount = Math.floor(PW * PH * 0.02)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf: number, frame = 0
    const tick = () => {
      frame++
      if (frame % 2 === 0) {
        meshNodes.forEach(n => {
          n.x += n.vx; n.y += n.vy
          if (n.x < 0.05 || n.x > 0.95) n.vx *= -1
          if (n.y < 0.05 || n.y > 0.95) n.vy *= -1
        })
        drawMesh(bgCtx, meshNodes, W, H)
      }
      if (frame % 3 === 0) {
        const data = imgData.data
        data.fill(0)
        for (let i = 0; i < grainCount; i++) {
          const base = ((Math.random() * PH | 0) * PW + (Math.random() * PW | 0)) * 4
          data[base] = 255; data[base + 1] = 225; data[base + 2] = 160; data[base + 3] = 90
        }
        ctx.putImageData(imgData, 0, 0)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      <canvas ref={bgRef} className={styles.bgCanvas} aria-hidden="true" />
      <canvas ref={grainRef} className={styles.grainCanvas} aria-hidden="true" />
    </>
  )
}
