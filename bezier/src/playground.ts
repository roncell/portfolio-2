// The hero playground: a 2D drafting stage for quadratic, cubic and chained
// cubic curves. Cubic evaluation, segment chaining, joint syncing, export and
// the per-segment timeline come from the repo (see bezier.ts / flow.ts).
// Drawing, dragging, the quadratic mode, de Casteljau construction and the
// constant-speed option are the page's presentation layer.
import {
  V2,
  arcTable,
  ArcTable,
  deCasteljau,
  derivative,
  evaluate,
  tAtFraction,
} from "./bezier"
import {
  ControlPoints,
  ControlPointName,
  SEGMENT_DURATION,
  addRandomSegment,
  exportCurve,
  moveControlPoint,
  timelineAt,
} from "./flow"
import { fitCanvas, getPalette, onThemeChange, reducedMotion, withAlpha } from "./theme"

type Mode = "quadratic" | "cubic" | "path"

interface Handle {
  seg: number
  name: ControlPointName | "q0" | "q1" | "q2"
  pos: V2
  kind: "end" | "mid"
  label: string
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

// The repo's default segment (src/store/index.ts), x/y only, mapped from
// [-3, 3] world units onto the stage with y pointing up.
const fromRepo = (x: number, y: number): V2 => [(x + 3) / 6, (3 - y) / 6]

const presets = {
  quadratic: (): V2[] => [
    [0.1, 0.8],
    [0.5, 0.06],
    [0.9, 0.8],
  ],
  cubic: (): ControlPoints<V2> => ({
    startPoint: fromRepo(-2, -2),
    midPointA: fromRepo(-1, 1),
    midPointB: fromRepo(1, -1),
    endPoint: fromRepo(2, 2),
  }),
  path: (): ControlPoints<V2>[] => [
    { startPoint: [0.06, 0.72], midPointA: [0.2, 0.08], midPointB: [0.36, 0.95], endPoint: [0.5, 0.5] },
    { startPoint: [0.5, 0.5], midPointA: [0.64, 0.05], midPointB: [0.9, 0.14], endPoint: [0.84, 0.52] },
    { startPoint: [0.84, 0.52], midPointA: [0.78, 0.9], midPointB: [0.55, 0.96], endPoint: [0.36, 0.84] },
  ],
}

const randomStagePoint = (): V2 => [0.06 + Math.random() * 0.88, 0.08 + Math.random() * 0.84]

const segPts = (s: ControlPoints<V2>): V2[] => [s.startPoint, s.midPointA, s.midPointB, s.endPoint]

export function initPlayground() {
  const canvas = $<HTMLCanvasElement>("stage")
  const playBtn = $<HTMLButtonElement>("play")
  const scrub = $<HTMLInputElement>("scrub")
  const optConstruction = $<HTMLInputElement>("opt-construction")
  const optTraveler = $<HTMLInputElement>("opt-traveler")
  const optConstant = $<HTMLInputElement>("opt-constant")
  const pathTools = $("path-tools")
  const exportOut = $("export-out")
  const exportWrap = $("export-wrap")
  const readT = $("readout-t")
  const readPt = $("readout-pt")
  const readSpeed = $("readout-speed")
  const readLen = $("readout-len")
  const modeNote = $("mode-note")

  let mode: Mode = "cubic"
  let quad = presets.quadratic()
  let cubic = presets.cubic()
  let path = presets.path()

  let playing = !reducedMotion.matches
  let clock = reducedMotion.matches ? 0.5 * SEGMENT_DURATION : 0
  let last = performance.now()
  let dirty = true
  let visible = true
  let tables: ArcTable[] = []
  let trail: V2[] = []

  let w = 0
  let h = 0
  let ctx: CanvasRenderingContext2D
  const pad = () => (w < 520 ? 22 : 40)
  const toPx = (p: V2): V2 => [pad() + p[0] * (w - 2 * pad()), pad() + p[1] * (h - 2 * pad())]
  const fromPx = (x: number, y: number): V2 => [
    Math.min(1.03, Math.max(-0.03, (x - pad()) / (w - 2 * pad()))),
    Math.min(1.03, Math.max(-0.03, (y - pad()) / (h - 2 * pad()))),
  ]

  const curves = (): V2[][] =>
    mode === "quadratic" ? [quad] : mode === "cubic" ? [segPts(cubic)] : path.map(segPts)

  const rebuildTables = () => {
    // Arc length in pixels so "constant speed" is constant on screen.
    tables = curves().map((pts) => arcTable((t) => toPx(evaluate(pts, t))))
  }

  const handles = (): Handle[] => {
    if (mode === "quadratic")
      return quad.map((p, i) => ({
        seg: 0,
        name: (["q0", "q1", "q2"] as const)[i],
        pos: p,
        kind: i === 1 ? "mid" : "end",
        label: `P${"₀₁₂"[i]}`,
      }))
    const segs = mode === "cubic" ? [cubic] : path
    const out: Handle[] = []
    segs.forEach((s, i) => {
      // BezierCurveEditor renders an endPoint handle only on the last segment;
      // elsewhere the next segment's startPoint stands in for it.
      ;(["startPoint", "midPointA", "midPointB", "endPoint"] as ControlPointName[]).forEach((name, k) => {
        if (name === "endPoint" && i + 1 !== segs.length) return
        out.push({
          seg: i,
          name,
          pos: s[name],
          kind: name === "midPointA" || name === "midPointB" ? "mid" : "end",
          label: mode === "cubic" ? `P${"₀₁₂₃"[k]}` : "",
        })
      })
    })
    return out
  }

  const setHandle = (hd: Handle, p: V2) => {
    if (mode === "quadratic") quad[+hd.name.slice(1)] = p
    else if (mode === "cubic") cubic = { ...cubic, [hd.name]: p }
    else moveControlPoint(path, hd.seg, hd.name as ControlPointName, p)
    rebuildTables()
    trail = []
    dirty = true
  }

  /* ---------- timing ---------- */

  const loopDuration = () => (mode === "path" ? Math.max(1, path.length) : 1) * SEGMENT_DURATION

  /** Which curve and which t the traveler is at right now. */
  const position = () => {
    const cs = curves()
    if (!cs.length) return { index: -1, t: 0 }
    if (optConstant.checked) {
      const total = tables.reduce((a, tb) => a + tb.total, 0)
      let s = ((clock % loopDuration()) / loopDuration()) * total
      for (let i = 0; i < tables.length; i++) {
        if (s <= tables[i].total || i === tables.length - 1)
          return { index: i, t: tAtFraction(tables[i], Math.min(1, s / (tables[i].total || 1))) }
        s -= tables[i].total
      }
    }
    // The repo's behaviour: equal time per segment, t linear in time.
    return timelineAt(clock, cs.length)
  }

  /* ---------- drawing ---------- */

  const drawGrid = () => {
    const pal = getPalette()
    ctx.fillStyle = pal.stage
    ctx.fillRect(0, 0, w, h)
    const step = w < 520 ? 24 : 32
    ctx.fillStyle = pal.grid
    for (let x = (w % step) / 2; x < w; x += step)
      for (let y = (h % step) / 2; y < h; y += step) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5)
  }

  const polyline = (pts: V2[]) => {
    ctx.beginPath()
    pts.forEach((p, i) => {
      const [x, y] = toPx(p)
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    })
  }

  const drawCurve = (pts: V2[], active: boolean) => {
    const pal = getPalette()
    ctx.beginPath()
    for (let i = 0; i <= 120; i++) {
      const [x, y] = toPx(evaluate(pts, i / 120))
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = withAlpha(pal.accent, 0.18)
    ctx.lineWidth = 10
    ctx.stroke()
    ctx.strokeStyle = active ? pal.accent : withAlpha(pal.accent, 0.75)
    ctx.lineWidth = 3
    ctx.stroke()
  }

  const dot = (p: V2, r: number, fill: string, stroke?: string) => {
    const [x, y] = toPx(p)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    if (stroke) {
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  const drawConstruction = (pts: V2[], t: number) => {
    const pal = getPalette()
    const levels = deCasteljau(pts, t)
    for (let L = 1; L < levels.length - 1; L++) {
      const tone = L === levels.length - 2 ? pal.accent : pal.ink2
      ctx.setLineDash([])
      polyline(levels[L])
      ctx.strokeStyle = withAlpha(tone, 0.85)
      ctx.lineWidth = 1.5
      ctx.stroke()
      levels[L].forEach((p) => dot(p, 3.5, pal.surface, tone))
    }
  }

  const drawHandles = () => {
    const pal = getPalette()
    const hs = handles()
    const coarse = w < 520
    hs.forEach((hd, i) => {
      const [x, y] = toPx(hd.pos)
      const hot = i === hover || i === dragIndex
      const focused = i === keyIndex && document.activeElement === canvas
      const r = coarse ? 8 : 7
      if (hot || focused) {
        ctx.beginPath()
        ctx.arc(x, y, r + 9, 0, Math.PI * 2)
        ctx.fillStyle = pal.accentSoft
        ctx.fill()
      }
      ctx.beginPath()
      // Endpoints are squares and control points are circles, after the repo's
      // boxBufferGeometry / sphereBufferGeometry choice in ControlPoint.tsx.
      if (hd.kind === "end") ctx.roundRect(x - r, y - r, r * 2, r * 2, 2.5)
      else ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = hot ? pal.accent : pal.surface
      ctx.fill()
      ctx.strokeStyle = focused ? pal.ink : pal.accent
      ctx.lineWidth = 2
      ctx.stroke()
      if (hd.label) {
        ctx.font = "500 12px 'JetBrains Mono', ui-monospace, monospace"
        ctx.fillStyle = pal.ink2
        const above = y > h * 0.5
        ctx.textAlign = "center"
        ctx.fillText(hd.label, x, above ? y - r - 10 : y + r + 18)
      }
    })
  }

  const drawTraveler = (p: V2, d: V2) => {
    const pal = getPalette()
    const [x, y] = toPx(p)
    // Heading from the tangent B'(t), converted to screen space.
    const dx = d[0] * (w - 2 * pad())
    const dy = d[1] * (h - 2 * pad())
    const a = Math.atan2(dy, dx)
    // trail
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        ctx.beginPath()
        ctx.moveTo(trail[i - 1][0], trail[i - 1][1])
        ctx.lineTo(trail[i][0], trail[i][1])
        ctx.strokeStyle = withAlpha(pal.signal, (i / trail.length) * 0.55)
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(13, 0)
    ctx.lineTo(-8, -8)
    ctx.lineTo(-4, 0)
    ctx.lineTo(-8, 8)
    ctx.closePath()
    ctx.fillStyle = pal.signal
    ctx.fill()
    ctx.strokeStyle = pal.stage
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }

  const draw = () => {
    const pal = getPalette()
    ;({ ctx, w, h } = fitCanvas(canvas))
    if (!tables.length) rebuildTables()
    drawGrid()
    const cs = curves()
    const pos = position()

    // control polygons
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1.25
    ctx.strokeStyle = withAlpha(pal.ink2, 0.55)
    cs.forEach((pts) => {
      if (mode === "path") {
        polyline([pts[0], pts[1]])
        ctx.stroke()
        polyline([pts[2], pts[3]])
      } else polyline(pts)
      ctx.stroke()
    })
    ctx.setLineDash([])

    cs.forEach((pts, i) => drawCurve(pts, i === pos.index))

    if (pos.index >= 0) {
      const pts = cs[pos.index]
      if (optConstruction.checked) drawConstruction(pts, pos.t)
      const p = evaluate(pts, pos.t)
      const d = derivative(pts, pos.t)
      if (optTraveler.checked) {
        const px = toPx(p)
        if (playing) {
          trail.push(px)
          if (trail.length > 36) trail.shift()
        }
        drawTraveler(p, d)
      } else {
        dot(p, 6, pal.accent, pal.surface)
      }
      if (optConstruction.checked && !optTraveler.checked) dot(p, 6, pal.accent, pal.surface)

      // readouts
      const speedPx =
        Math.hypot(d[0] * (w - 2 * pad()), d[1] * (h - 2 * pad())) / SEGMENT_DURATION
      readT.textContent = pos.t.toFixed(3)
      readPt.textContent = `(${p[0].toFixed(3)}, ${(1 - p[1]).toFixed(3)})`
      readSpeed.textContent = optConstant.checked
        ? `${Math.round(tables.reduce((a, tb) => a + tb.total, 0) / loopDuration())} px/s`
        : `${Math.round(speedPx)} px/s`
      readLen.textContent = `${Math.round(tables.reduce((a, tb) => a + tb.total, 0))} px`
    } else {
      readT.textContent = "–"
      readPt.textContent = "no segments"
      readSpeed.textContent = "–"
      readLen.textContent = "0 px"
    }
    drawHandles()
    if (!dragging) scrub.value = String(Math.round(((clock % loopDuration()) / loopDuration()) * 1000))
  }

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (playing && visible) {
      clock += dt
      dirty = true
    }
    if (dirty && visible) {
      draw()
      dirty = false
    }
    requestAnimationFrame(frame)
  }

  /* ---------- pointer + touch ---------- */

  let hover = -1
  let dragIndex = -1
  let dragging = false
  let keyIndex = 0
  let dragOffset: V2 = [0, 0]

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as V2
  }

  const hitTest = (x: number, y: number, radius: number) => {
    const hs = handles()
    let best = -1
    let bestD = radius
    hs.forEach((hd, i) => {
      const [hx, hy] = toPx(hd.pos)
      const d = Math.hypot(hx - x, hy - y)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  // Touch: block page scroll only when the finger lands on a handle.
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0]
      const [x, y] = local(t)
      if (hitTest(x, y, 30) >= 0) e.preventDefault()
    },
    { passive: false }
  )

  canvas.addEventListener("pointerdown", (e) => {
    const [x, y] = local(e)
    const i = hitTest(x, y, e.pointerType === "mouse" ? 16 : 30)
    if (i < 0) return
    dragIndex = i
    keyIndex = i
    dragging = true
    const [hx, hy] = toPx(handles()[i].pos)
    dragOffset = [hx - x, hy - y]
    canvas.setPointerCapture(e.pointerId)
    canvas.classList.add("is-dragging")
    dirty = true
  })

  canvas.addEventListener("pointermove", (e) => {
    const [x, y] = local(e)
    if (dragging && dragIndex >= 0) {
      setHandle(handles()[dragIndex], fromPx(x + dragOffset[0], y + dragOffset[1]))
      return
    }
    if (e.pointerType === "mouse") {
      const i = hitTest(x, y, 16)
      if (i !== hover) {
        hover = i
        canvas.style.cursor = i >= 0 ? "grab" : "default"
        dirty = true
      }
    }
  })

  const endDrag = () => {
    if (!dragging) return
    dragging = false
    dragIndex = -1
    canvas.classList.remove("is-dragging")
    dirty = true
  }
  canvas.addEventListener("pointerup", endDrag)
  canvas.addEventListener("pointercancel", endDrag)
  canvas.addEventListener("pointerleave", () => {
    if (hover !== -1) {
      hover = -1
      dirty = true
    }
  })

  // Keyboard: N / Shift+N picks a point, arrows move it (Shift for bigger steps).
  canvas.addEventListener("keydown", (e) => {
    const hs = handles()
    if (!hs.length) return
    if (e.key === "n" || e.key === "N") {
      keyIndex = (keyIndex + (e.shiftKey ? hs.length - 1 : 1)) % hs.length
      dirty = true
      e.preventDefault()
      return
    }
    const step = e.shiftKey ? 0.05 : 0.01
    const delta: Record<string, V2> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const dv = delta[e.key]
    if (!dv) return
    e.preventDefault()
    keyIndex = Math.min(keyIndex, hs.length - 1)
    const p = hs[keyIndex].pos
    setHandle(hs[keyIndex], [p[0] + dv[0], p[1] + dv[1]])
  })
  canvas.addEventListener("focus", () => (dirty = true))
  canvas.addEventListener("blur", () => (dirty = true))

  /* ---------- controls ---------- */

  const setPlaying = (v: boolean) => {
    playing = v
    playBtn.setAttribute("aria-pressed", String(v))
    playBtn.querySelector(".label")!.textContent = v ? "Pause" : "Play"
    if (!v) trail = []
    dirty = true
  }
  setPlaying(playing)

  playBtn.addEventListener("click", () => setPlaying(!playing))
  scrub.addEventListener("input", () => {
    setPlaying(false)
    clock = (+scrub.value / 1000) * loopDuration()
    dirty = true
  })
  ;[optConstruction, optTraveler, optConstant].forEach((el) =>
    el.addEventListener("change", () => {
      trail = []
      dirty = true
    })
  )

  const notes: Record<Mode, string> = {
    quadratic:
      "Quadratic mode is a page explainer. The repository only implements cubic segments.",
    cubic:
      "The repository's default segment (src/store/index.ts), x and y only. Evaluated with its getCubicBezierPoint.",
    path:
      "Chained cubic segments, the repository's core model. Moving a joint updates both neighbours, as BezierCurveEditor.tsx does.",
  }

  const setMode = (m: Mode) => {
    mode = m
    document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.mode === m))
    )
    pathTools.hidden = m !== "path"
    modeNote.textContent = notes[m]
    keyIndex = 0
    trail = []
    clock = playing ? 0 : 0.5 * loopDuration()
    rebuildTables()
    exportWrap.hidden = true
    dirty = true
  }
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode as Mode))
  )
  // Arrow-key navigation inside the mode radiogroup.
  $("mode-group").addEventListener("keydown", (e) => {
    const order: Mode[] = ["quadratic", "cubic", "path"]
    const i = order.indexOf(mode)
    const n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!n) return
    e.preventDefault()
    const next = order[(i + n + 3) % 3]
    setMode(next)
    document.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)!.focus()
  })

  $("add-seg").addEventListener("click", () => {
    path = addRandomSegment(path, randomStagePoint, [0.5, 0.5] as V2)
    rebuildTables()
    trail = []
    dirty = true
  })
  $("clear-seg").addEventListener("click", () => {
    path = []
    rebuildTables()
    trail = []
    dirty = true
  })
  $("reset").addEventListener("click", () => {
    quad = presets.quadratic()
    cubic = presets.cubic()
    path = presets.path()
    rebuildTables()
    trail = []
    exportWrap.hidden = true
    dirty = true
  })

  $("export-btn").addEventListener("click", () => {
    let text: string
    if (mode === "quadratic") {
      const f = (p: V2) => `${p[0].toFixed(2)},${(1 - p[1]).toFixed(2)}`
      text = `B(t) = (1-t)²(${f(quad[0])}) + 2(1 - t)t(${f(quad[1])}) + t²(${f(quad[2])}); \n`
    } else {
      // y flipped so exported numbers read with y pointing up.
      const flip = (s: ControlPoints<V2>): ControlPoints => ({
        startPoint: [s.startPoint[0], 1 - s.startPoint[1]],
        midPointA: [s.midPointA[0], 1 - s.midPointA[1]],
        midPointB: [s.midPointB[0], 1 - s.midPointB[1]],
        endPoint: [s.endPoint[0], 1 - s.endPoint[1]],
      })
      text = exportCurve((mode === "cubic" ? [cubic] : path).map(flip)) || "No segments to export."
    }
    exportOut.textContent = text.trim()
    exportWrap.hidden = false
  })

  /* ---------- lifecycle ---------- */

  new ResizeObserver(() => {
    ;({ ctx, w, h } = fitCanvas(canvas))
    rebuildTables()
    trail = []
    dirty = true
  }).observe(canvas)
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible) dirty = true
  }).observe(canvas)
  onThemeChange(() => (dirty = true))
  reducedMotion.addEventListener("change", () => setPlaying(!reducedMotion.matches && playing))

  setMode("cubic")
  requestAnimationFrame(frame)
}
