import type { ThreeDCoordinateMode } from '../types'
import type { SurfaceDataset } from './scene'

export type SurfaceSmoothWindow = 1 | 3 | 5 | 9
export type SurfaceDownsample = 1 | 2 | 5 | 10
export type SurfaceRenderQuality = 1 | 1.5 | 2
export type SurfaceColorScale = 'Jet' | 'Turbo' | 'Hot' | 'Viridis'

export type SurfaceControls = {
  smooth: SurfaceSmoothWindow
  downsample: SurfaceDownsample
  quality: SurfaceRenderQuality
  color: SurfaceColorScale
  showSlice: boolean
  sliceIndex: number
}

export type SurfaceView = {
  time: number[]
  fullTimeRange: [number, number]
  y: number[]
  z: Array<Array<number | null>>
  channelLabels: string[]
  coordinateMode: ThreeDCoordinateMode
  colorMin: number
  colorMax: number
  valueMin: number
  valueMax: number
  sliceTime: number
  sliceValues: Array<number | null>
  sampledPointCount: number
  timeUnit: string
  valueUnit?: string
}

export const defaultSurfaceControls = (): SurfaceControls => ({
  smooth: 1,
  downsample: 1,
  quality: 1.5,
  color: 'Jet',
  showSlice: false,
  sliceIndex: 0,
})

const normalizeSurfacePoint = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export const smoothSurfaceSeries = (
  values: Array<number | null>,
  windowSize: SurfaceSmoothWindow,
): Array<number | null> => {
  const normalizedValues = values.map((value) => normalizeSurfacePoint(value))
  if (windowSize === 1) {
    return normalizedValues
  }

  const halfWindow = Math.floor(windowSize / 2)
  return normalizedValues.map((value, pointIndex) => {
    if (value === null) {
      return null
    }

    const windowValues = normalizedValues
      .slice(
        Math.max(0, pointIndex - halfWindow),
        Math.min(normalizedValues.length, pointIndex + halfWindow + 1),
      )
      .filter((item): item is number => item !== null)

    if (windowValues.length === 0) {
      return null
    }

    return windowValues.reduce((sum, item) => sum + item, 0) / windowValues.length
  })
}

export const buildSurfaceSampleIndexes = (
  pointCount: number,
  step: SurfaceDownsample,
): number[] => {
  if (pointCount <= 0) {
    return []
  }

  const indexes: number[] = []
  for (let index = 0; index < pointCount; index += step) {
    indexes.push(index)
  }

  const finalIndex = pointCount - 1
  if (indexes[indexes.length - 1] !== finalIndex) {
    indexes.push(finalIndex)
  }

  return indexes
}

const clampSliceIndex = (sliceIndex: number, pointCount: number) =>
  Math.max(0, Math.min(pointCount - 1, Math.round(sliceIndex)))

const resolveValueExtent = (rows: Array<Array<number | null>>) => {
  const values = rows.flat().filter((value): value is number => value !== null)
  if (values.length === 0) {
    return { min: 0, max: 1 }
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

export const hasDrawableSurfaceDataset = (
  dataset: SurfaceDataset | null,
): dataset is SurfaceDataset =>
  Boolean(
    dataset &&
    dataset.x.length > 1 &&
    dataset.y.length > 0 &&
    dataset.z.some((row) => row.some((value) => normalizeSurfacePoint(value) !== null)),
  )

export const buildSurfaceView = (
  dataset: SurfaceDataset,
  controls: Pick<SurfaceControls, 'smooth' | 'downsample' | 'showSlice' | 'sliceIndex'>,
): SurfaceView => {
  const pointCount = dataset.x.length
  const activeSliceIndex = clampSliceIndex(controls.sliceIndex, pointCount)
  const smoothedRows = dataset.z.map((row) => {
    const normalizedRow = Array.from({ length: pointCount }, (_, index) =>
      normalizeSurfacePoint(row[index]),
    )
    return smoothSurfaceSeries(normalizedRow, controls.smooth)
  })
  const sampleIndexes = buildSurfaceSampleIndexes(pointCount, controls.downsample)
  const surfaceIndexes = controls.showSlice
    ? sampleIndexes.filter((index) => index >= activeSliceIndex)
    : sampleIndexes.slice()
  if (controls.showSlice && !surfaceIndexes.includes(activeSliceIndex)) {
    surfaceIndexes.unshift(activeSliceIndex)
  }
  const sampledTime = sampleIndexes.map((index) => dataset.x[index])
  const extent = resolveValueExtent(smoothedRows)

  return {
    time: surfaceIndexes.map((index) => dataset.x[index]),
    fullTimeRange: [Math.min(...sampledTime), Math.max(...sampledTime)],
    y: dataset.y.slice(),
    z: smoothedRows.map((row) => surfaceIndexes.map((index) => row[index] ?? null)),
    channelLabels:
      dataset.channelLabels?.length === dataset.y.length
        ? dataset.channelLabels.slice()
        : dataset.y.map((value) => String(value)),
    coordinateMode: dataset.coordinateMode || 'z',
    colorMin: extent.min,
    colorMax: extent.max,
    valueMin: extent.min,
    valueMax: extent.max,
    sliceTime: dataset.x[activeSliceIndex],
    sliceValues: smoothedRows.map((row) => row[activeSliceIndex] ?? null),
    sampledPointCount: surfaceIndexes.length,
    timeUnit: dataset.timeUnit || 'ms',
    valueUnit: dataset.valueUnit,
  }
}
