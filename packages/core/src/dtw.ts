export type Measure<T> = (a: T, b: T) => number

/**
 * Greedy dynamic time warping used by the legacy Haskell backend.
 *
 * It is intentionally not the optimal DTW algorithm; this preserves the old
 * baseline behavior and makes it cheap enough to run in a browser worker.
 */
export function greedyDtw<T>(measure: Measure<T>, first: readonly T[], second: readonly T[]): number {
  if (first.length === 0 && second.length === 0) throw new Error('Cannot compare two empty series')
  if (first.length === 0) return greedyDtw(measure, second, first)
  if (second.length === 0) throw new Error('Cannot compare empty series')

  let s = first
  let o = second
  let sIndex = 0
  let oIndex = 0
  let result = measure(mustItem(s[sIndex]), mustItem(o[oIndex]))
  let pathLength = 1

  while (s.length - sIndex > 1 && o.length - oIndex > 1) {
    const left = measure(mustItem(s[sIndex + 1]), mustItem(o[oIndex]))
    const middle = measure(mustItem(s[sIndex + 1]), mustItem(o[oIndex + 1]))
    const right = measure(mustItem(s[sIndex]), mustItem(o[oIndex + 1]))
    const min = Math.min(left, middle, right)

    if (left === min) {
      sIndex += 1
      result += left
    } else if (middle === min) {
      sIndex += 1
      oIndex += 1
      result += middle
    } else {
      oIndex += 1
      result += right
    }

    pathLength += 1
  }

  if (o.length - oIndex === 1) {
    const tmp = o
    const tmpIndex = oIndex
    o = s
    oIndex = sIndex
    s = tmp
    sIndex = tmpIndex
  }

  if (s.length - sIndex !== 1) throw new Error('Unexpected DTW state')

  for (let i = oIndex + 1; i < o.length; i += 1) {
    result += measure(mustItem(s[sIndex]), mustItem(o[i]))
    pathLength += 1
  }

  return result / pathLength
}

function mustItem<T>(item: T | undefined): T {
  if (item === undefined) throw new Error('Unexpected missing DTW item')
  return item
}
