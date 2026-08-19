import type {
  ThreeDChannelRow,
  ThreeDCoordinateMode,
  ThreeDResponseRow,
  ThreeDSelectedChannelItem,
  ThreeDWaveformQueryRequest,
} from '../types'
import { buildUnionAndResampleRows, normalizeSurfaceValue } from './resample'
import type { SurfaceDataset } from './scene'

type SortedChannelRow = ThreeDChannelRow & {
  sortOrder: number
  zValue: number
}

export type ThreeDSurfaceUnitIssue =
  | {
      type: 'time-unit'
      units: string[]
    }
  | {
      type: 'value-unit'
      units: string[]
    }

type BuildThreeDWaveformQueryPayloadParams = {
  userName: string
  dev: number
  selectedCannons: string[]
  selectedChannelItems: ThreeDSelectedChannelItem[]
  timeStart: number | undefined
  timeEnd: number | undefined
  pointCount?: number
}

const buildResponseRowKey = (channelId?: number, channelName?: string, cannonNumber?: string) =>
  `${channelId ?? channelName ?? ''}|${cannonNumber ?? ''}`

const buildChannelRowIdentity = (
  row: Pick<ThreeDChannelRow, 'channelId' | 'channelName' | 'cannonNumber'>,
) => `${row.channelId ?? row.channelName}|${row.cannonNumber}`

const resolveThreeDCoordinateValue = (
  row: ThreeDChannelRow,
  coordinateMode: ThreeDCoordinateMode,
  fallbackIndex: number,
) => {
  const rawValue = coordinateMode === 'spatial' ? row.spatialCoordinate : row.zCoordinate
  const numericValue = Number(rawValue)
  return Number.isFinite(numericValue) ? numericValue : fallbackIndex + 1
}

/** 判断两组通道行是否由相同的「通道 × 炮号」组成（顺序无关） */
export const hasSameThreeDChannelRowIdentities = (
  leftRows: ThreeDChannelRow[],
  rightRows: ThreeDChannelRow[],
) => {
  if (leftRows.length !== rightRows.length) {
    return false
  }

  const leftIdentities = leftRows.map(buildChannelRowIdentity).sort()
  const rightIdentities = rightRows.map(buildChannelRowIdentity).sort()

  return leftIdentities.every((identity, index) => identity === rightIdentities[index])
}

const getUniqueUnits = (responseRows: ThreeDResponseRow[], key: 'dat_unit' | 'time_unit') =>
  Array.from(
    new Set(
      responseRows
        .map((row) => row[key])
        .filter((unit): unit is string => typeof unit === 'string' && unit.length > 0),
    ),
  )

/**
 * 检查响应行之间的单位一致性：
 * - `time-unit`：时间单位不一致，无法绘制（调用方应提示用户）；
 * - `value-unit`：幅值单位不一致，可以绘制但幅值轴不显示单位。
 */
export const getThreeDSurfaceUnitIssue = (
  responseRows: ThreeDResponseRow[],
): ThreeDSurfaceUnitIssue | null => {
  const timeUnits = getUniqueUnits(responseRows, 'time_unit')
  if (timeUnits.length > 1) {
    return {
      type: 'time-unit',
      units: timeUnits,
    }
  }

  const valueUnits = getUniqueUnits(responseRows, 'dat_unit')
  if (valueUnits.length > 1) {
    return {
      type: 'value-unit',
      units: valueUnits,
    }
  }

  return null
}

/** 按坐标模式（Z 坐标 / 空间位置）对通道行排序，返回附带排序值与原始顺序的行 */
export const sortThreeDChannelRows = (
  channelRows: ThreeDChannelRow[],
  coordinateMode: ThreeDCoordinateMode = 'z',
): SortedChannelRow[] =>
  channelRows
    .map((row, index) => {
      return {
        ...row,
        sortOrder: index,
        zValue: resolveThreeDCoordinateValue(row, coordinateMode, index),
      }
    })
    .sort((left, right) => {
      if (left.zValue === right.zValue) {
        return left.sortOrder - right.sortOrder
      }

      return left.zValue - right.zValue
    })

/**
 * 将后端响应行 + 通道行构建为 3D 曲面数据集：
 * 按 `channelRows` 的顺序与 `coordinateMode` 排布 Y 轴，
 * 对各通道的时间轴取并集并重采样（Worker/WASM/JS 自动降级）。
 */
export const buildThreeDSurfaceDataset = async ({
  responseRows,
  channelRows,
  coordinateMode = 'z',
}: {
  responseRows: ThreeDResponseRow[]
  channelRows: ThreeDChannelRow[]
  coordinateMode?: ThreeDCoordinateMode
}): Promise<SurfaceDataset> => {
  const sortedChannelRows = sortThreeDChannelRows(channelRows, coordinateMode)
  const responseRowMap = new Map<string, ThreeDResponseRow>()

  responseRows.forEach((row) => {
    responseRowMap.set(buildResponseRowKey(row.chnl_id, row.chnl, String(row.shot)), row)
  })

  const channelLabels = sortedChannelRows.map((row) => row.channelName)
  const channelColors = sortedChannelRows.map((row) => row.color)

  const valueUnits = getUniqueUnits(responseRows, 'dat_unit')
  const timeUnits = getUniqueUnits(responseRows, 'time_unit')

  const timeRows: number[][] = []
  const dataRows: Array<Array<number | null>> = []

  sortedChannelRows.forEach((row) => {
    const matchedResponseRow =
      responseRowMap.get(buildResponseRowKey(row.channelId, row.channelName, row.cannonNumber)) ||
      responseRowMap.get(buildResponseRowKey(undefined, row.channelName, row.cannonNumber))

    if (!matchedResponseRow) {
      timeRows.push([])
      dataRows.push([])
      return
    }

    timeRows.push(matchedResponseRow.time)
    dataRows.push(matchedResponseRow.data.map((value) => normalizeSurfaceValue(value)))
  })

  const { unionTimeValues, values: z } = await buildUnionAndResampleRows(timeRows, dataRows)

  return {
    x: unionTimeValues,
    y: sortedChannelRows.map((row) => row.zValue),
    z,
    channelLabels,
    channelColors,
    coordinateMode,
    timeUnit: timeUnits[0] || 'ms',
    valueUnit: valueUnits.length === 1 ? valueUnits[0] : undefined,
  }
}

/** 构建后端波形查询请求负载（炮号 × 通道 展开） */
export const buildThreeDWaveformQueryPayload = ({
  userName,
  dev,
  selectedCannons,
  selectedChannelItems,
  timeStart,
  timeEnd,
  pointCount,
}: BuildThreeDWaveformQueryPayloadParams): ThreeDWaveformQueryRequest => {
  const payload: ThreeDWaveformQueryRequest = {
    user_name: userName,
    dev,
    list: selectedCannons.flatMap((shot) =>
      selectedChannelItems.map((item) => ({
        shot: Number(shot),
        chnl_id: item.channelId,
      })),
    ),
    start_time: timeStart === undefined ? '' : String(timeStart),
    end_time: timeEnd === undefined ? '' : String(timeEnd),
  }

  if (typeof pointCount === 'number' && Number.isFinite(pointCount) && pointCount > 0) {
    payload.point_count = pointCount
  }

  return payload
}
