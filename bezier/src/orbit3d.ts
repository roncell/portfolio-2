// A dependency-free port of the repo's 3D scene (src/App.tsx + friends) so it
// runs in any browser without React Three Fiber. Kept from the repo: the
// camera ([0, 5, 15], fov 45), the 20x20 grid helper, 50-sample cubic lines,
// the default segment, "Add Random Point" chaining with getRandomPoint, "Clear
// All", "Export Curve", Play/Pause, and the sphere running each segment for 3 s.
// Added here: a hand-rolled perspective projection, drag-to-orbit, gentle
// auto-rotate and auto-zoom to keep random points in frame. Control points are
// not draggable in this port; the repo uses a TransformControls gizmo for that.
import { V3, getCubicBezierPoint } from "./bezier"
import {
  ControlPoints,
  addRandomSegment,
  defaultSegments3D,
  exportCurve,
  getRandomPoint3D,
  timelineAt,
} from "./flow"
import { fitCanvas, getPalette, onThemeChange, reducedMotion, withAlpha } from "./theme"

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

const BASE_DISTANCE = Math.hypot(0, 5, 15)
const FOV = (45 * Math.PI) / 180

export function initOrbit() {
  const canvas = $<HTMLCanvasElement>("orbit")
  const out = $("o-out")
  const outWrap = $("o-out-wrap")
  const count = $("o-count")
  const state = $("o-state")

  let segments: ControlPoints<V3>[] = defaultSegments3D()
  let playAnimation = !reducedMotion.matches
  let clock = reducedMotion.matches ? 1.1 : 0
  let yaw = 0
  let pitch = Math.atan2(5, 15)
  let distance = BASE_DISTANCE
  let autoRotate = !reducedMotion.matches
  let visible = true
  let dirty = true
  let last = performance.now()

  let ctx: CanvasRenderingContext2D
  let w = 0
  let h = 0
  let cam: V3 = [0, 0, 0]
  let r: V3 = [1, 0, 0]
  let u: V3 = [0, 1, 0]
  let f: V3 = [0, 0, -1]
  let focal = 1

  const setupCamera = () => {
    cam = [
      distance * Math.cos(pitch) * Math.sin(yaw),
      distance * Math.sin(pitch),
      distance * Math.cos(pitch) * Math.cos(yaw),
    ]
    f = norm(sub([0, 0, 0], cam))
    r = norm(cross(f, [0, 1, 0]))
    u = cross(r, f)
    focal = h / 2 / Math.tan(FOV / 2)
  }

  const project = (p: V3) => {
    const d = sub(p, cam)
    const z = dot(d, f)
    if (z < 0.05) return null
    return { x: w / 2 + (dot(d, r) * focal) / z, y: h / 2 - (dot(d, u) * focal) / z, z }
  }

  const line = (a: V3, b: V3) => {
    const pa = project(a)
    const pb = project(b)
    if (!pa || !pb) return
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
  }

  const fitTarget = () => {
    let R = 0
    segments.forEach((s) =>
      [s.startPoint, s.midPointA, s.midPointB, s.endPoint].forEach((p) => (R = Math.max(R, Math.hypot(...p))))
    )
    return Math.max(BASE_DISTANCE, R * 2.5)
  }

  const draw = () => {
    const pal = getPalette()
    ;({ ctx, w, h } = fitCanvas(canvas))
    setupCamera()
    ctx.fillStyle = pal.stage
    ctx.fillRect(0, 0, w, h)

    // <gridHelper args={[20, 20]} />
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = -10; i <= 10; i++) {
      if (i === 0) continue
      line([i, 0, -10], [i, 0, 10])
      line([-10, 0, i], [10, 0, i])
    }
    ctx.strokeStyle = withAlpha(pal.ink2, 0.22)
    ctx.stroke()
    ctx.beginPath()
    line([0, 0, -10], [0, 0, 10])
    line([-10, 0, 0], [10, 0, 0])
    ctx.strokeStyle = withAlpha(pal.ink2, 0.55)
    ctx.stroke()

    // <CubicBezierLine segments={50} />
    segments.forEach((s) => {
      ctx.beginPath()
      let started = false
      for (let i = 0; i <= 50; i++) {
        const p = project(getCubicBezierPoint(s.startPoint, s.midPointA, s.midPointB, s.endPoint, i / 50))
        if (!p) {
          started = false
          continue
        }
        started ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)
        started = true
      }
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = withAlpha(pal.accent, 0.2)
      ctx.lineWidth = 7
      ctx.stroke()
      ctx.strokeStyle = pal.accent
      ctx.lineWidth = 2.25
      ctx.stroke()
    })

    // Control points: boxes for start/end, spheres for mids (ControlPoint.tsx).
    segments.forEach((s, si) => {
      ;(["startPoint", "midPointA", "midPointB", "endPoint"] as const).forEach((name) => {
        if (name === "endPoint" && si + 1 !== segments.length) return
        const p = project(s[name])
        if (!p) return
        const mid = name !== "startPoint" && name !== "endPoint"
        const size = Math.max(2.5, ((mid ? 0.1 : 0.1) * focal) / p.z)
        ctx.beginPath()
        if (mid) ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        else ctx.rect(p.x - size, p.y - size, size * 2, size * 2)
        ctx.fillStyle = mid ? pal.surface : pal.ink2
        ctx.fill()
        ctx.strokeStyle = pal.ink2
        ctx.lineWidth = 1.25
        ctx.stroke()
      })
    })

    // The animated sphere (useAnimation.ts).
    const { index, t } = timelineAt(clock, segments.length)
    const s = segments[index]
    const pos: V3 = s ? getCubicBezierPoint(s.startPoint, s.midPointA, s.midPointB, s.endPoint, t) : [0, 0, 0]
    const p = project(pos)
    if (p) {
      const rad = Math.max(4, (0.2 * focal) / p.z)
      const g = ctx.createRadialGradient(p.x - rad * 0.35, p.y - rad * 0.35, rad * 0.1, p.x, p.y, rad)
      g.addColorStop(0, withAlpha(pal.surface, 0.9))
      g.addColorStop(0.35, pal.signal)
      g.addColorStop(1, pal.signal)
      ctx.beginPath()
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
      ctx.fillStyle = g
      ctx.fill()
    }
  }

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (visible) {
      if (playAnimation) {
        clock += dt
        dirty = true
      }
      if (autoRotate) {
        yaw += dt * 0.12
        dirty = true
      }
      const target = fitTarget()
      if (Math.abs(target - distance) > 0.01) {
        distance += (target - distance) * Math.min(1, dt * 4)
        dirty = true
      }
      if (dirty) {
        draw()
        dirty = false
      }
    }
    requestAnimationFrame(frame)
  }

  /* orbit */
  let drag: { x: number; y: number } | null = null
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY }
    autoRotate = false
    canvas.setPointerCapture(e.pointerId)
    canvas.classList.add("is-dragging")
  })
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return
    yaw -= (e.clientX - drag.x) * 0.008
    pitch = Math.max(-1.35, Math.min(1.35, pitch + (e.clientY - drag.y) * 0.006))
    drag = { x: e.clientX, y: e.clientY }
    dirty = true
  })
  const end = () => {
    drag = null
    canvas.classList.remove("is-dragging")
  }
  canvas.addEventListener("pointerup", end)
  canvas.addEventListener("pointercancel", end)
  canvas.addEventListener("keydown", (e) => {
    const k: Record<string, [number, number]> = {
      ArrowLeft: [0.08, 0],
      ArrowRight: [-0.08, 0],
      ArrowUp: [0, 0.06],
      ArrowDown: [0, -0.06],
    }
    if (!k[e.key]) return
    e.preventDefault()
    autoRotate = false
    yaw += k[e.key][0]
    pitch = Math.max(-1.35, Math.min(1.35, pitch + k[e.key][1]))
    dirty = true
  })

  /* the repo's five buttons (UI.tsx) */
  const sync = () => {
    count.textContent = `${segments.length} segment${segments.length === 1 ? "" : "s"}`
    state.textContent = playAnimation ? "playing" : "paused"
    dirty = true
  }
  $("o-add").addEventListener("click", () => {
    segments = addRandomSegment(segments, getRandomPoint3D, [0, 0, 0] as V3)
    sync()
  })
  $("o-clear").addEventListener("click", () => {
    segments = []
    outWrap.hidden = true
    sync()
  })
  $("o-export").addEventListener("click", () => {
    out.textContent = exportCurve(segments).trim() || "No segments to export."
    outWrap.hidden = false
  })
  $("o-play").addEventListener("click", () => {
    playAnimation = true
    sync()
  })
  $("o-pause").addEventListener("click", () => {
    playAnimation = false
    sync()
  })

  new ResizeObserver(() => (dirty = true)).observe(canvas)
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible) dirty = true
  }).observe(canvas)
  onThemeChange(() => (dirty = true))
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      autoRotate = false
      playAnimation = false
      sync()
    }
  })
  sync()
  requestAnimationFrame(frame)
}
