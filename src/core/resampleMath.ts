/** 时间轴并集重采样的纯函数实现（JS 兜底路径，与 Worker/WASM 共用同一语义） */

export type TimeDataPair = {
  time: number
  value: number | null
}

export const normalizeSurfaceValue = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export const buildTimeDataPairs = (
  timeValues: number[],
  dataValues: Array<number | null>,
): TimeDataPair[] =>
  timeValues
    .map((time, index) => ({
      time,
      value: normalizeSurfaceValue(dataValues[index]),
    }))
    .filter((pair) => Number.isFinite(pair.time))
    .sort((left, right) => left.time - right.time)

const interpolateBetweenPairs = (
  targetTime: number,
  currentPair: TimeDataPair,
  nextPair: TimeDataPair,
) => {
  if (currentPair.value === null || nextPair.value === null || currentPair.time === nextPair.time) {
    return null
  }

  const ratio = (targetTime - currentPair.time) / (nextPair.time - currentPair.time)
  return Number((currentPair.value + (nextPair.value - currentPair.value) * ratio).toFixed(6))
}

/** 将单行 (time, data) 重采样到并集时间轴：范围外为 null，相邻点间线性插值 */
export const resampleDataToUnionTimeValues = (
  unionTimeValues: number[],
  timeValues: number[],
  dataValues: Array<number | null>,
): Array<number | null> => {
  const pairs = buildTimeDataPairs(timeValues, dataValues)

  if (!pairs.length) {
    return unionTimeValues.map(() => null)
  }

  const firstPair = pairs[0]
  const lastPair = pairs[pairs.length - 1]
  let pairIndex = 0

  return unionTimeValues.map((targetTime) => {
    if (targetTime < firstPair.time || targetTime > lastPair.time) {
      return null
    }

    while (pairIndex < pairs.length - 1 && pairs[pairIndex + 1].time < targetTime) {
      pairIndex += 1
    }

    const currentPair = pairs[pairIndex]
    const nextPair = pairs[pairIndex + 1]

    if (currentPair.time === targetTime) {
      return currentPair.value
    }

    if (nextPair?.time === targetTime) {
      return nextPair.value
    }

    if (!nextPair) {
      return null
    }

    return interpolateBetweenPairs(targetTime, currentPair, nextPair)
  })
}

/** 多行时间轴取并集（去重、过滤非有限值、升序） */
export const buildUnionTimeValues = (timeRows: number[][]) =>
  Array.from(new Set(timeRows.flatMap((row) => row.filter((time) => Number.isFinite(time))))).sort(
    (left, right) => left - right,
  )
