import { flattenRows, parseUnionAndResampleResult, unflattenRowsResult } from './resampleCodec'
import { buildUnionTimeValues, resampleDataToUnionTimeValues } from './resampleMath'
import { runResampleWorker } from './resampleWorkerClient'

export type { TimeDataPair } from './resampleMath'
export {
  buildTimeDataPairs,
  buildUnionTimeValues,
  normalizeSurfaceValue,
  resampleDataToUnionTimeValues,
} from './resampleMath'

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

/** 对多行时间轴取并集并整体重采样：WASM → Worker → JS 三级降级 */
export const buildUnionAndResampleRows = async (
  timeRows: number[][],
  dataRows: Array<Array<number | null>>,
): Promise<SurfaceUnionResampleResult> => {
  const wasmModule = await loadWasmResampleModule()

  if (wasmModule?.build_union_and_resample) {
    const { flatTimeValues, flatDataValues, offsets, lengths } = flattenRows(timeRows, dataRows)
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
      values: unflattenRowsResult(
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

/** 在给定的并集时间轴上重采样多行数据：WASM → Worker → JS 三级降级 */
export const resampleRowsToUnionTimeValues = async (
  unionTimeValues: number[],
  timeRows: number[][],
  dataRows: Array<Array<number | null>>,
): Promise<SurfaceResampleResult> => {
  const wasmModule = await loadWasmResampleModule()

  if (wasmModule) {
    const { flatTimeValues, flatDataValues, offsets, lengths } = flattenRows(timeRows, dataRows)
    const flatResult = wasmModule.resample_to_union_time(
      flatTimeValues,
      flatDataValues,
      offsets,
      lengths,
      new Float64Array(unionTimeValues),
    )

    logResampleRuntime('wasm', timeRows.length, unionTimeValues.length)

    return {
      values: unflattenRowsResult(flatResult, timeRows.length, unionTimeValues.length),
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
      values: unflattenRowsResult(
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
