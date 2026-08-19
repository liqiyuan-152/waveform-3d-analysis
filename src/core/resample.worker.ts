export {}

type ThreeDResampleRequest =
  | {
      id: number
      type: 'three-d-resample'
      flatTimeValues: Float64Array
      flatDataValues: Float64Array
      offsets: Uint32Array
      lengths: Uint32Array
    }
  | {
      id: number
      type: 'three-d-resample-to-union'
      unionTimeValues: Float64Array
      flatTimeValues: Float64Array
      flatDataValues: Float64Array
      offsets: Uint32Array
      lengths: Uint32Array
    }

type ThreeDResampleResponse =
  | {
      id: number
      type: 'three-d-resample:success'
      unionTimeValues: Float64Array
      values: Float64Array
      rowCount: number
      unionLength: number
      runtime: number
    }
  | {
      id: number
      type: 'three-d-resample:error'
      message: string
    }

type TimeDataPair = {
  time: number
  value: number | null
}

const workerScope = self as unknown as {
  postMessage: (message: ThreeDResampleResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<ThreeDResampleRequest>) => void) | null
}

const normalizeSurfaceValue = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const getRowTimeValues = (
  flatTimeValues: Float64Array,
  offsets: Uint32Array,
  lengths: Uint32Array,
  rowIndex: number,
) => {
  const rowOffset = offsets[rowIndex]
  const rowLength = lengths[rowIndex]
  const rowTimeValues: number[] = []

  for (let valueIndex = 0; valueIndex < rowLength; valueIndex += 1) {
    const time = flatTimeValues[rowOffset + valueIndex]

    if (Number.isFinite(time)) {
      rowTimeValues.push(time)
    }
  }

  return rowTimeValues
}

const buildUnionTimeValues = (
  flatTimeValues: Float64Array,
  offsets: Uint32Array,
  lengths: Uint32Array,
) =>
  Array.from(
    new Set(
      Array.from({ length: offsets.length }).flatMap((_, rowIndex) =>
        getRowTimeValues(flatTimeValues, offsets, lengths, rowIndex),
      ),
    ),
  ).sort((left, right) => left - right)

const buildTimeDataPairs = (
  flatTimeValues: Float64Array,
  flatDataValues: Float64Array,
  offsets: Uint32Array,
  lengths: Uint32Array,
  rowIndex: number,
): TimeDataPair[] => {
  const rowOffset = offsets[rowIndex]
  const rowLength = lengths[rowIndex]
  const pairs: TimeDataPair[] = []

  for (let valueIndex = 0; valueIndex < rowLength; valueIndex += 1) {
    const time = flatTimeValues[rowOffset + valueIndex]

    if (!Number.isFinite(time)) {
      continue
    }

    pairs.push({
      time,
      value: normalizeSurfaceValue(flatDataValues[rowOffset + valueIndex]),
    })
  }

  return pairs.sort((left, right) => left.time - right.time)
}

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

const resampleRowToUnionTimeValues = (
  unionTimeValues: number[],
  flatTimeValues: Float64Array,
  flatDataValues: Float64Array,
  offsets: Uint32Array,
  lengths: Uint32Array,
  rowIndex: number,
) => {
  const pairs = buildTimeDataPairs(flatTimeValues, flatDataValues, offsets, lengths, rowIndex)

  if (!pairs.length) {
    return unionTimeValues.map(() => Number.NaN)
  }

  const firstPair = pairs[0]
  const lastPair = pairs[pairs.length - 1]
  let pairIndex = 0

  return unionTimeValues.map((targetTime) => {
    if (targetTime < firstPair.time || targetTime > lastPair.time) {
      return Number.NaN
    }

    while (pairIndex < pairs.length - 1 && pairs[pairIndex + 1].time < targetTime) {
      pairIndex += 1
    }

    const currentPair = pairs[pairIndex]
    const nextPair = pairs[pairIndex + 1]

    if (currentPair.time === targetTime) {
      return currentPair.value ?? Number.NaN
    }

    if (nextPair?.time === targetTime) {
      return nextPair.value ?? Number.NaN
    }

    if (!nextPair) {
      return Number.NaN
    }

    return interpolateBetweenPairs(targetTime, currentPair, nextPair) ?? Number.NaN
  })
}

const resampleRowsToUnionTimeValues = (
  unionTimeValues: number[],
  flatTimeValues: Float64Array,
  flatDataValues: Float64Array,
  offsets: Uint32Array,
  lengths: Uint32Array,
) => {
  const rowCount = offsets.length
  const unionLength = unionTimeValues.length
  const values = new Float64Array(rowCount * unionLength)

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowValues = resampleRowToUnionTimeValues(
      unionTimeValues,
      flatTimeValues,
      flatDataValues,
      offsets,
      lengths,
      rowIndex,
    )

    values.set(rowValues, rowIndex * unionLength)
  }

  return values
}

workerScope.onmessage = (event) => {
  const startedAt = performance.now()

  try {
    const message = event.data
    const unionTimeValues =
      message.type === 'three-d-resample'
        ? buildUnionTimeValues(message.flatTimeValues, message.offsets, message.lengths)
        : Array.from(message.unionTimeValues)
    const values = resampleRowsToUnionTimeValues(
      unionTimeValues,
      message.flatTimeValues,
      message.flatDataValues,
      message.offsets,
      message.lengths,
    )
    const unionArray = new Float64Array(unionTimeValues)

    workerScope.postMessage(
      {
        id: message.id,
        type: 'three-d-resample:success',
        unionTimeValues: unionArray,
        values,
        rowCount: message.offsets.length,
        unionLength: unionArray.length,
        runtime: Number((performance.now() - startedAt).toFixed(2)),
      },
      [unionArray.buffer, values.buffer],
    )
  } catch (error) {
    workerScope.postMessage({
      id: event.data.id,
      type: 'three-d-resample:error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
