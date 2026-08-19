import { flattenRows } from './resampleCodec'

/** 重采样 Worker 客户端：模块 Worker 生命周期、请求/响应协议与超时兜底 */

export type ThreeDWorkerSuccess = {
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

let resampleWorker: Worker | null | undefined
let resampleWorkerRequestId = 0

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

/**
 * 向 Worker 发起重采样请求；Worker 不可用、失败或超时（30s）时返回 null，
 * 由调用方降级到主线程 JS 路径。
 */
export const runResampleWorker = async (
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
  const { flatTimeValues, flatDataValues, offsets, lengths } = flattenRows(timeRows, dataRows)
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
