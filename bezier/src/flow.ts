// Port of roncell/B-zier-flow's state and behaviour, minus React/zustand/gsap:
//   src/types.ts           -> ControlPoints shape
//   src/store/index.ts     -> default segment, addRandomSegment, removeSegments,
//                             updateSegment, getRandomPoint (src/utils/helpers.ts)
//   src/components/UI/UI.tsx            -> the "Export Curve" formula string
//   src/components/useAnimation.ts      -> one 3-second tween per segment, run
//                                          back to back, repeating forever
//   src/components/BezierCurveEditor.tsx -> moving a segment's startPoint also
//                                          moves the previous segment's endPoint
import { Vec } from "./bezier"

export type ControlPointName = "startPoint" | "endPoint" | "midPointA" | "midPointB"

export interface ControlPoints<T extends Vec = Vec> {
  startPoint: T
  endPoint: T
  midPointA: T
  midPointB: T
}

/** src/store/index.ts initial state, verbatim. */
export const defaultSegments3D = (): ControlPoints<[number, number, number]>[] => [
  {
    startPoint: [-2, -2, 1],
    midPointA: [-1, 1, 4],
    midPointB: [1, -1, -4],
    endPoint: [2, 2, -1],
  },
]

/** src/store/index.ts addRandomSegment, generalised to a random-point source. */
export const addRandomSegment = <T extends Vec>(
  segments: ControlPoints<T>[],
  getRandomPoint: () => T,
  origin: T
): ControlPoints<T>[] => {
  const newSegments = [...segments]
  newSegments.push({
    startPoint: (newSegments[newSegments.length - 1]?.endPoint || origin).slice() as T,
    endPoint: getRandomPoint(),
    midPointA: getRandomPoint(),
    midPointB: getRandomPoint(),
  })
  return newSegments
}

/** src/utils/helpers.ts getRandomPoint, verbatim (a 20-unit cube around the origin). */
export const getRandomPoint3D = () =>
  [Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10] as [
    number,
    number,
    number
  ]

/**
 * BezierCurveEditor onTransformChange/onTransformEnd: write the moved point into
 * its segment; a moved startPoint is also the previous segment's endPoint.
 */
export const moveControlPoint = <T extends Vec>(
  segments: ControlPoints<T>[],
  segmentIndex: number,
  name: ControlPointName,
  p: T
) => {
  segments[segmentIndex] = { ...segments[segmentIndex], [name]: p }
  if (name === "startPoint" && segmentIndex > 0) {
    segments[segmentIndex - 1] = { ...segments[segmentIndex - 1], endPoint: p }
  }
}

const fmt = (p: Vec) => p.map((v) => +v.toFixed(2)).join(",")

/** src/components/UI/UI.tsx onCurveExport: same template, numbers rounded for display. */
export const exportCurve = (segments: ControlPoints[]) => {
  let str = ""
  segments.forEach((controlPoints) => {
    str += `B(t) = (1-t)³(${fmt(controlPoints.startPoint)}) + 3(1 - t)²t(${fmt(
      controlPoints.midPointA
    )}) + 3(1 - t)t²(${fmt(controlPoints.midPointB)}) + t³(${fmt(
      controlPoints.endPoint
    )}); \n`
  })
  return str
}

/** Seconds per segment in useAnimation's gsap timeline defaults. */
export const SEGMENT_DURATION = 3

/**
 * useAnimation's timeline: segments play one after another, `repeat: -1`.
 * Inside a segment the repo sets position from `this.progress()`, which is
 * linear in time, so t advances linearly. Returns which segment and local t.
 */
export const timelineAt = (elapsed: number, segmentCount: number) => {
  if (segmentCount < 1) return { index: -1, t: 0 }
  const total = segmentCount * SEGMENT_DURATION
  const local = ((elapsed % total) + total) % total
  const index = Math.min(segmentCount - 1, Math.floor(local / SEGMENT_DURATION))
  return { index, t: (local - index * SEGMENT_DURATION) / SEGMENT_DURATION }
}
