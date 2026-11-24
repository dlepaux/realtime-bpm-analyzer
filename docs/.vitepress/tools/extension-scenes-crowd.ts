// A copy of rba-pro's options/crowd.ts (extension/src/entrypoints/options/crowd.ts) at b360cd1, the
// crowd David approved for the extension's Settings scene. rba-pro is private and this repo
// is public, so they can't share the code: change the two together. Only the formatting differs, and the
// comments say "player" where the extension's say "stage". scripts/extension-scenes-crowd.test.ts holds it to the same shape rules as rba-pro's crowd.test.ts.
// Pure and import-free, like extension-scenes.ts, so `npm test` reads it directly.
//
// The audience in front of the stage, as one solid silhouette per row. It is a single outline along
// the tops of heads, shoulders and a few raised hands, so the rim of light traces the crowd's skyline
// and nothing inside it: drawn as separate shapes, every head and arm took its own rim and read as
// stick figures.

type Arm = -1 | 0 | 1
type Point = readonly [number, number]
type Person = { readonly x: number; readonly head: number; readonly arm: Arm; readonly lean: number; readonly reach: number }
/** A part of the outline that rises above the shoulders, between two points of the shoulder line. */
type Rise = { readonly from: number; readonly to: number; readonly draw: (shoulders: (x: number) => number) => string }

const HEAD_R = 7.5
const NECK = 4
const SHOULDER_DROP = 11
/** Where the neck's curve meets the shoulders, from the middle of the body. */
const NECK_BASE = 8.5
const HALF_SHOULDERS = 17
const SHOULDER_ROUND = 9
/** Where a raised arm leaves the shoulder, from the middle of the body. */
const ARM_AT = 13.5
const HAND_R = 3.6
const WRIST = 2.8
const UPPER_ARM = 4.5
/**
 * Far below the 70-high viewBox: the player clips the crowd (its svg overflows), so the back row
 * reaches down behind the front one with no strip of floor between them, and no rim of light runs
 * along the base.
 */
const BELOW = 200
const MARGIN = 20

const n = (value: number) => value.toFixed(1)

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
}

/**
 * The people along the row. Heads never overlap, and a raised arm gets room beside it, so no two
 * parts of the outline cross and the silhouette stays one clean shape.
 */
function placePeople(seed: number, width: number): Person[] {
  const random = seeded(seed)
  const people: Person[] = []
  for (let x = -8; x < width + 16; ) {
    const previous = people.at(-1)
    // A few hands, never two neighbours at once, so each one reads on its own.
    const raises = random() > 0.8 && previous?.arm === 0
    const arm: Arm = raises ? (random() > 0.5 ? 1 : -1) : 0
    if (previous) x += 21 + random() * 7 + (previous.arm === 1 ? 10 : 0) + (arm === -1 ? 10 : 0)
    const head = 30 + random() * 14
    people.push({ x, head, arm, lean: arm * (-1.5 + random() * 5.5), reach: head - 6 - random() * 8 })
  }
  return people
}

/** The top of one person's shoulders at x: flat, rounding off at the sides, then falling away. */
function shoulderAt(person: Person, x: number): number {
  const top = person.head + SHOULDER_DROP
  const off = Math.abs(x - person.x)
  if (off <= HALF_SHOULDERS - SHOULDER_ROUND) return top
  if (off <= HALF_SHOULDERS) return top + SHOULDER_ROUND - Math.sqrt(SHOULDER_ROUND ** 2 - (off - HALF_SHOULDERS + SHOULDER_ROUND) ** 2)
  return top + SHOULDER_ROUND + (off - HALF_SHOULDERS) * 2.5
}

/** Drops the points that sit on a straight line between their neighbours. */
function simplify(points: readonly Point[]): Point[] {
  return points.filter((point, i) => {
    const before = points[i - 1]
    const after = points[i + 1]
    if (!before || !after) return true
    return Math.abs((point[0] - before[0]) * (after[1] - before[1]) - (point[1] - before[1]) * (after[0] - before[0])) > 0.05
  })
}

function shoulderLine(shoulders: (x: number) => number, from: number, to: number): string {
  const points: Point[] = [[from, shoulders(from)]]
  for (let x = Math.floor(from) + 1; x < to; x += 1) points.push([x, shoulders(x)])
  points.push([to, shoulders(to)])
  return simplify(points).map(([x, y]) => `L${n(x)} ${n(y)}`).join('')
}

function headRise(person: Person): Rise {
  const { x, head } = person
  const neckTop = head + Math.sqrt(HEAD_R ** 2 - NECK ** 2)
  const shoulder = head + SHOULDER_DROP
  // The neck flows into the shoulders in one curve, so a head reads as part of the body, not as a ball on a post.
  return {
    from: x - NECK_BASE,
    to: x + NECK_BASE,
    draw: (shoulders) =>
      `Q${n(x - NECK - 0.5)} ${n(shoulder)} ${n(x - NECK)} ${n(neckTop)}A${HEAD_R} ${HEAD_R} 0 1 1 ${n(x + NECK)} ${n(neckTop)}` +
      `Q${n(x + NECK + 0.5)} ${n(shoulder)} ${n(x + NECK_BASE)} ${n(shoulders(x + NECK_BASE))}`,
  }
}

/** A forearm up from the shoulder, ending in a hand only a little wider than the wrist: a hand, not a ball. */
function armRise(person: Person): Rise {
  const base = person.x + person.arm * ARM_AT
  const tip = base + person.lean
  const top = person.reach
  const wristY = top + 6
  const palmY = top + 2.5
  // The edges bow outward a little at the elbow, away from the head.
  const elbow = person.arm * 1.5
  return {
    from: base - UPPER_ARM,
    to: base + UPPER_ARM,
    draw: (shoulders) => {
      const [left, right] = [base - UPPER_ARM, base + UPPER_ARM]
      const [leftY, rightY] = [shoulders(left), shoulders(right)]
      const [wristL, wristR] = [tip - WRIST, tip + WRIST]
      return (
        `Q${n((left + wristL) / 2 + elbow)} ${n((leftY + wristY) / 2)} ${n(wristL)} ${n(wristY)}` +
        `L${n(tip - HAND_R)} ${n(palmY)}A${HAND_R} ${HAND_R} 0 0 1 ${n(tip + HAND_R)} ${n(palmY)}L${n(wristR)} ${n(wristY)}` +
        `Q${n((right + wristR) / 2 + elbow)} ${n((rightY + wristY) / 2)} ${n(right)} ${n(rightY)}`
      )
    },
  }
}

/** The crowd as one closed path, `width` wide in a 70-high viewBox. The same seed draws the same crowd. */
export function crowdPath(seed: number, width: number): string {
  const people = placePeople(seed, width)
  const shoulders = (x: number) => Math.min(BELOW, ...people.map((person) => shoulderAt(person, x)))
  const rises = people
    .flatMap((person) => (person.arm === 0 ? [headRise(person)] : [headRise(person), armRise(person)]))
    .sort((a, b) => a.from - b.from)
  let path = `M${-MARGIN} ${BELOW}`
  let at = -MARGIN
  for (const rise of rises) {
    path += shoulderLine(shoulders, at, rise.from) + rise.draw(shoulders)
    at = rise.to
  }
  return `${path}${shoulderLine(shoulders, at, width + MARGIN)}V${BELOW}Z`
}

export type CrowdLayer = { readonly depth: 'far' | 'back' | 'middle' | 'front'; readonly seed: number; readonly width: number }

/**
 * The rows of the audience, from the back of the room to the front. Each row is one path stretched
 * to the player's width, so a wider viewBox fits more people and draws them smaller: the rows shrink
 * and crowd together with distance.
 */
export const CROWD_LAYERS: readonly CrowdLayer[] = [
  { depth: 'far', seed: 83, width: 760 },
  { depth: 'back', seed: 47, width: 580 },
  { depth: 'middle', seed: 11, width: 440 },
  { depth: 'front', seed: 29, width: 300 },
]
