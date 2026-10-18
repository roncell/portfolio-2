// Reads the page's CSS colour tokens so canvas drawings follow light/dark mode.
export interface Palette {
  stage: string
  grid: string
  ink: string
  ink2: string
  line: string
  accent: string
  accentSoft: string
  signal: string
  surface: string
}

const read = (): Palette => {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(n).trim()
  return {
    stage: v("--stage"),
    grid: v("--grid"),
    ink: v("--ink"),
    ink2: v("--ink-2"),
    line: v("--line"),
    accent: v("--accent"),
    accentSoft: v("--accent-soft"),
    signal: v("--signal"),
    surface: v("--surface"),
  }
}

let palette: Palette | null = null
const listeners = new Set<() => void>()

export const getPalette = () => (palette ??= read())

export const onThemeChange = (fn: () => void) => listeners.add(fn)

const refresh = () => {
  palette = read()
  listeners.forEach((fn) => fn())
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refresh)
new MutationObserver(refresh).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
})

export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

/** Resize a canvas to its CSS box at device pixel ratio; returns CSS size. */
export const fitCanvas = (canvas: HTMLCanvasElement) => {
  const r = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
  const w = Math.max(1, Math.round(r.width * dpr))
  const h = Math.max(1, Math.round(r.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext("2d")!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w: r.width, h: r.height }
}

export const withAlpha = (color: string, a: number) => {
  // Accepts #rrggbb tokens.
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
