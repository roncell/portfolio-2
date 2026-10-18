// Bézier math for the showcase.
//
// Section 1 is a port of roncell/B-zier-flow `src/utils/interpolation.ts`.
// The Bernstein weight functions are the repo's own, unchanged. The repo's
// `getCubicBezierPoint` works on three.js Vector3 tuples; here it is
// generalised to tuples of any length (2D for the playground, 3D for the
// original-app port) so it runs without three.js.
//
// Section 2 is presentation-layer math added for this page only (quadratic
// curves, de Casteljau construction, derivatives, arc length). It is not in
// the repository.

export type Vec = number[]
export type V2 = [number, number]
export type V3 = [number, number, number]

/* ---------- 1. From the repo: src/utils/interpolation.ts ---------- */

const cubicBezierP0 = (t: number, p: number) => {
  const k = 1 - t
  return k * k * k * p
}

const cubicBezierP1 = (t: number, p: number) => {
  const k = 1 - t
  return 3 * k * k * t * p
}

const cubicBezierP2 = (t: number, p: number) => 3 * (1 - t) * t * t * p

const cubicBezierP3 = (t: number, p: number) => t * t * t * p

export const cubicBezier = (
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
) =>
  cubicBezierP0(t, p0) +
  cubicBezierP1(t, p1) +
  cubicBezierP2(t, p2) +
  cubicBezierP3(t, p3)

export const getCubicBezierPoint = <T extends Vec>(
  pStart: T,
  midA: T,
  midB: T,
  pEnd: T,
  t: number
): T => pStart.map((_, i) => cubicBezier(t, pStart[i], midA[i], midB[i], pEnd[i])) as T

/* ---------- 2. Presentation layer (not in the repo) ---------- */

export const quadraticBezier = (t: number, p0: number, p1: number, p2: number) => {
  const k = 1 - t
  return k * k * p0 + 2 * k * t * p1 + t * t * p2
}

export const getQuadraticBezierPoint = <T extends Vec>(a: T, b: T, c: T, t: number): T =>
  a.map((_, i) => quadraticBezier(t, a[i], b[i], c[i])) as T

export const lerp = <T extends Vec>(a: T, b: T, t: number): T =>
  a.map((v, i) => v + (b[i] - v) * t) as T

/** de Casteljau: every intermediate level, ending with the single point B(t). */
export const deCasteljau = <T extends Vec>(points: T[], t: number): T[][] => {
  const levels: T[][] = [points]
  let cur = points
  while (cur.length > 1) {
    const next: T[] = []
    for (let i = 0; i < cur.length - 1; i++) next.push(lerp(cur[i], cur[i + 1], t))
    levels.push(next)
    cur = next
  }
  return levels
}

/** Any-degree evaluator: picks the repo's cubic or the page's quadratic. */
export const evaluate = <T extends Vec>(pts: T[], t: number): T =>
  pts.length === 4
    ? getCubicBezierPoint(pts[0], pts[1], pts[2], pts[3], t)
    : getQuadraticBezierPoint(pts[0], pts[1], pts[2], t)

/** First derivative B'(t) via the hodograph: n * (b1 - b0) of the last de Casteljau pair. */
export const derivative = <T extends Vec>(pts: T[], t: number): T => {
  const levels = deCasteljau(pts, t)
  const pair = levels[levels.length - 2]
  const n = pts.length - 1
  return pair[0].map((v, i) => n * (pair[1][i] - v)) as T
}

export interface ArcTable {
  ts: Float64Array
  lengths: Float64Array
  total: number
}

/** Cumulative chord-length table used to re-time motion at constant speed. */
export const arcTable = (f: (t: number) => Vec, samples = 240): ArcTable => {
  const ts = new Float64Array(samples + 1)
  const lengths = new Float64Array(samples + 1)
  let prev = f(0)
  let total = 0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const p = f(t)
    total += Math.hypot(...p.map((v, k) => v - prev[k]))
    ts[i] = t
    lengths[i] = total
    prev = p
  }
  return { ts, lengths, total }
}

/** Inverse lookup: which t sits at fraction u (0..1) of the arc length. */
export const tAtFraction = (table: ArcTable, u: number) => {
  const target = u * table.total
  const L = table.lengths
  let lo = 0
  let hi = L.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (L[mid] < target) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return 0
  const span = L[lo] - L[lo - 1] || 1
  return table.ts[lo - 1] + ((target - L[lo - 1]) / span) * (table.ts[lo] - table.ts[lo - 1])
}
