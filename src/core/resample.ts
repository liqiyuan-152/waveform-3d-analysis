export type TimeDataPair = {
  time: number
  value: number | null
}

/** WASM 重采样模块需要暴露的函数签名（可选加速，由宿主通过 setWasmResampleLoader 注入） */
export type WasmResampleModule = {
  default?: (moduleOrPath?: RequestInfo | URL | WebAssembly.Module) => Promise<unknown>
  build_union_and_resample?: (
    flatTimeValues: Float64Array,
    flatDataValues: Float64Array,
    offsets: Uint32Array,
    lengths: Uint32Array,
  ) => Float64Array
  resample_to_union_time: (
    flatTimeValues: Float64Array,
    flatDataValues: Float64Array,
    offsets: Uint32Array,
    lengths: Uint32Array,
    unionTimeValues: Float64Array,
  ) => Float64Array
}

export type SurfaceResampleResult = {
  values: Array<Array<number | null>>
  runtime: 'js' | 'wasm' | 'worker-js'
  workerRuntime?: number
}

export type SurfaceUnionResampleResult = SurfaceResampleResult & {
  unionTimeValues: number[]
}

let wasmResampleLoader: (() => Promise<WasmResampleModule | null>) | null = null
let wasmModulePromise: Promise<WasmResampleModule | null> | null = null
let resampleWorker: Worker | null | undefined
let resampleWorkerRequestId = 0

/**
 * 注入可选的 WASM 重采样模块加载器（默认关闭）。
 * 宿主如需启用，传入返回 WASM 模块的函数；传 null 恢复默认的 Worker/JS 实现。
 */
export const setWasmResampleLoader = (
  loader: (() => Promise<WasmResampleModule | null>) | null,
) => {
  wasmResampleLoader = loader
  wasmModulePromise = null
}

type ThreeDWorkerSuccess = {
  id: number
  type: 'three-d-resample:success'
  unionTimeValues: Float64Array
  values: Float64Array
  rowCount: number
  unionLength: number
  runtime: number
}

type ThreeDWorkerError = {
  id: number
  type: 'three-d-resample:error'
  message: string
}

type ThreeDWorkerResponse = ThreeDWorkerSuccess | ThreeDWorkerError

type PendingResampleWorkerRequest = {
  resolve: (value: ThreeDWorkerSuccess) => void
  reject: (reason?: unknown) => void
  timeoutId: number
}

const pendingResampleWorkerRequests = new Map<number, PendingResampleWorkerRequest>()

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

export const buildUnionTimeValues = (timeRows: number[][]) =>
  Array.from(new Set(timeRows.flatMap((row) => row.filter((time) => Number.isFinite(time))))).sort(
    (left, right) => left - right,
  )

const loadWasmResampleModule = async (): Promise<WasmResampleModule | null> => {
  if (!wasmResampleLoader) {
    return null
  }

  if (!wasmModulePromise) {
    wasmModulePromise = wasmResampleLoader().catch((error) => {
      console.warn('[3D resample] Failed to load WASM module, falling back to JS.', error)
      return null
    })
  }

  return wasmModulePromise
}

const flattenRowsForWasm = (timeRows: number[][], dataRows: Array<Array<number | null>>) => {
  const totalLength = timeRows.reduce((sum, row) => sum + row.length, 0)
  const flatTimeValues = new Float64Array(totalLength)
  const flatDataValues = new Float64Array(totalLength)
  const offsets = new Uint32Array(timeRows.length)
  const lengths = new Uint32Array(timeRows.length)
  let offset = 0

  timeRows.forEach((timeRow, rowIndex) => {
    const dataRow = dataRows[rowIndex] || []
    offsets[rowIndex] = offset
    lengths[rowIndex] = timeRow.length

    timeRow.forEach((time, valueIndex) => {
      flatTimeValues[offset + valueIndex] = time
      flatDataValues[offset + valueIndex] = normalizeSurfaceValue(dataRow[valueIndex]) ?? Number.NaN
    })

    offset += timeRow.length
  })

  return {
    flatTimeValues,
    flatDataValues,
    offsets,
    lengths,
  }
}

const unflattenWasmResult = (flatResult: Float64Array, rowCount: number, unionLength: number) =>
  Array.from({ length: rowCount }, (_, rowIndex) => {
    const start = rowIndex * unionLength

    return Array.from(flatResult.slice(start, start + unionLength), (value) =>
      Number.isFinite(value) ? value : null,
    )
  })

const rejectPendingWorkerRequests = (reason: unknown) => {
  pendingResampleWorkerRequests.forEach((request) => {
    clearTimeout(request.timeoutId)
    request.reject(reason)
  })
  pendingResampleWorkerRequests.clear()
}

const getResampleWorker = () => {
  if (resampleWorker !== undefined) {
    return resampleWorker
  }

  if (typeof Worker === 'undefined') {
    resampleWorker = null
    return resampleWorker
  }

  try {
    resampleWorker = new Worker(new URL('./resample.worker.ts', import.meta.url), {
      type: 'module',
    })
    resampleWorker.onmessage = (event: MessageEvent<ThreeDWorkerResponse>) => {
      const response = event.data
      const pendingRequest = pendingResampleWorkerRequests.get(response.id)

      if (!pendingRequest) {
        return
      }

      clearTimeout(pendingRequest.timeoutId)
      pendingResampleWorkerRequests.delete(response.id)

      if (response.type === 'three-d-resample:error') {
        pendingRequest.reject(new Error(response.message))
        return
      }

      pendingRequest.resolve(response)
    }
    resampleWorker.onerror = (error) => {
      const currentWorker = resampleWorker
      resampleWorker = null
      currentWorker?.terminate()
      rejectPendingWorkerRequests(error)
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[3D resample] Failed to create Worker, falling back.', error)
    }
    resampleWorker = null
  }

  return resampleWorker
}

const runResampleWorker = async (
  type: 'three-d-resample' | 'three-d-resample-to-union',
  timeRows: number[][],
  dataRows: Array<Array<number | null>>,
  unionTimeValues?: number[],
): Promise<ThreeDWorkerSuccess | null> => {
  const worker = getResampleWorker()

  if (!worker) {
    return null
  }

  const requestId = resampleWorkerRequestId + 1
  resampleWorkerRequestId = requestId
  const { flatTimeValues, flatDataValues, offsets, lengths } = flattenRowsForWasm(
    timeRows,
    dataRows,
  )
  const unionArray = unionTimeValues ? new Float64Array(unionTimeValues) : undefined
  const transferList: Transferable[] = [
    flatTimeValues.buffer,
    flatDataValues.buffer,
    offsets.buffer,
    lengths.buffer,
  ]

  if (unionArray) {
    transferList.push(unionArray.buffer)
  }

  return new Promise<ThreeDWorkerSuccess>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingResampleWorkerRequests.delete(requestId)
      reject(new Error('3D resample Worker timed out.'))
    }, 30_000)

    pendingResampleWorkerRequests.set(requestId, {
      resolve,
      reject,
      timeoutId,
    })

    worker.postMessage(
      {
        id: requestId,
        type,
        unionTimeValues: unionArray,
        flatTimeValues,
        flatDataValues,
        offsets,
        lengths,
      },
      transferList,
    )
  }).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn('[3D resample] Worker failed, falling back.', error)
    }

    return null
  })
}

const parseUnionAndResampleResult = (
  result: Float64Array,
  fallbackRowCount: number,
): {
  unionTimeValues: number[]
  values: Array<Array<number | null>>
} => {
  const unionLength = Number(result[0])
  const rowCount = Number(result[1])

  if (
    !Number.isInteger(unionLength) ||
    !Number.isInteger(rowCount) ||
    unionLength < 0 ||
    rowCount < 0
  ) {
    return {
      unionTimeValues: [],
      values: Array.from({ length: fallbackRowCount }, () => []),
    }
  }

  const unionStart = 2
  const valuesStart = unionStart + unionLength
  const unionTimeValues = Array.from(result.slice(unionStart, valuesStart))
  const flatValues = result.slice(valuesStart)

  return {
    unionTimeValues,
    values: unflattenWasmResult(flatValues, rowCount, unionLength),
  }
}

const logResampleRuntime = (
  runtime: SurfaceResampleResult['runtime'],
  rowCount: number,
  unionLength: number,
  mode = 'resample',
) => {
  if (import.meta.env.DEV) {
    console.info(`[3D resample] runtime: ${runtime}`, {
      mode,
      rowCount,
      unionLength,
    })
  }
}

export const buildUnionAndResampleRows = async (
  timeRows: number[][],
  dataRows: Array<Array<number | null>>,
): Promise<SurfaceUnionResampleResult> => {
  const wasmModule = await loadWasmResampleModule()

  if (wasmModule?.build_union_and_resample) {
    const { flatTimeValues, flatDataValues, offsets, lengths } = flattenRowsForWasm(
      timeRows,
      dataRows,
    )
    const parsedResult = parseUnionAndResampleResult(
      wasmModule.build_union_and_resample(flatTimeValues, flatDataValues, offsets, lengths),
      timeRows.length,
    )
    logResampleRuntime(
      'wasm',
      timeRows.length,
      parsedResult.unionTimeValues.length,
      'union+resample',
    )

    return {
      ...parsedResult,
      runtime: 'wasm',
    }
  }

  const workerResult = await runResampleWorker('three-d-resample', timeRows, dataRows)

  if (workerResult) {
    logResampleRuntime('worker-js', timeRows.length, workerResult.unionLength, 'union+resample')

    return {
      unionTimeValues: Array.from(workerResult.unionTimeValues),
      values: unflattenWasmResult(
        workerResult.values,
        workerResult.rowCount,
        workerResult.unionLength,
      ),
      runtime: 'worker-js',
      workerRuntime: workerResult.runtime,
    }
  }

  const unionTimeValues = buildUnionTimeValues(timeRows)

  if (wasmModule) {
    const { values } = await resampleRowsToUnionTimeValues(unionTimeValues, timeRows, dataRows)

    return {
      unionTimeValues,
      values,
      runtime: 'wasm',
    }
  }

  logResampleRuntime('js', timeRows.length, unionTimeValues.length, 'union+resample')

  return {
    unionTimeValues,
    values: timeRows.map((timeValues, index) =>
      resampleDataToUnionTimeValues(unionTimeValues, timeValues, dataRows[index] || []),
    ),
    runtime: 'js',
  }
}

export const resampleRowsToUnionTimeValues = async (
  unionTimeValues: number[],
  timeRows: number[][],
  dataRows: Array<Array<number | null>>,
): Promise<SurfaceResampleResult> => {
  const wasmModule = await loadWasmResampleModule()

  if (wasmModule) {
    const { flatTimeValues, flatDataValues, offsets, lengths } = flattenRowsForWasm(
      timeRows,
      dataRows,
    )
    const flatResult = wasmModule.resample_to_union_time(
      flatTimeValues,
      flatDataValues,
      offsets,
      lengths,
      new Float64Array(unionTimeValues),
    )

    logResampleRuntime('wasm', timeRows.length, unionTimeValues.length)

    return {
      values: unflattenWasmResult(flatResult, timeRows.length, unionTimeValues.length),
      runtime: 'wasm',
    }
  }

  const workerResult = await runResampleWorker(
    'three-d-resample-to-union',
    timeRows,
    dataRows,
    unionTimeValues,
  )

  if (workerResult) {
    logResampleRuntime('worker-js', timeRows.length, unionTimeValues.length)

    return {
      values: unflattenWasmResult(
        workerResult.values,
        workerResult.rowCount,
        workerResult.unionLength,
      ),
      runtime: 'worker-js',
      workerRuntime: workerResult.runtime,
    }
  }

  logResampleRuntime('js', timeRows.length, unionTimeValues.length)

  return {
    values: timeRows.map((timeValues, index) =>
      resampleDataToUnionTimeValues(unionTimeValues, timeValues, dataRows[index] || []),
    ),
    runtime: 'js',
  }
}
