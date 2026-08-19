import { describe, expect, it } from 'vitest'

import type { SurfaceDataset } from './scene'
import {
  buildSurfaceSampleIndexes,
  buildSurfaceView,
  defaultSurfaceControls,
  hasDrawableSurfaceDataset,
  smoothSurfaceSeries,
} from './surfaceView'

const buildDataset = (overrides: Partial<SurfaceDataset> = {}): SurfaceDataset => ({
  x: [0, 1, 2, 3, 4],
  y: [1, 2],
  z: [
    [0, 1, 2, 3, 4],
    [4, 3, 2, 1, 0],
  ],
  timeUnit: 'ms',
  valueUnit: 'V',
  ...overrides,
})

describe('smoothSurfaceSeries', () => {
  it('returns normalized values when window size is 1', () => {
    expect(smoothSurfaceSeries([1, null, 3, NaN, 5], 1)).toEqual([1, null, 3, null, 5])
  })

  it('averages the neighborhood and keeps null anchors null', () => {
    const smoothed = smoothSurfaceSeries([1, 2, 3, 4, 5], 3)
    expect(smoothed).toEqual([1.5, 2, 3, 4, 4.5])
  })

  it('skips null values inside the window', () => {
    const smoothed = smoothSurfaceSeries([1, null, 3], 3)
    expect(smoothed).toEqual([1, null, 3])
  })
})

describe('buildSurfaceSampleIndexes', () => {
  it('returns empty array for non-positive counts', () => {
    expect(buildSurfaceSampleIndexes(0, 2)).toEqual([])
  })

  it('appends the final index when the step skips it', () => {
    expect(buildSurfaceSampleIndexes(5, 2)).toEqual([0, 2, 4])
    expect(buildSurfaceSampleIndexes(7, 5)).toEqual([0, 5, 6])
  })
})

describe('hasDrawableSurfaceDataset', () => {
  it('requires more than one time point and at least one finite value', () => {
    expect(hasDrawableSurfaceDataset(null)).toBe(false)
    expect(hasDrawableSurfaceDataset({ ...buildDataset(), x: [0] })).toBe(false)
    expect(
      hasDrawableSurfaceDataset({
        ...buildDataset(),
        z: [
          [null, null],
          [null, null],
        ],
      }),
    ).toBe(false)
    expect(hasDrawableSurfaceDataset(buildDataset())).toBe(true)
  })
})

describe('buildSurfaceView', () => {
  it('downsamples the time axis and pads the slice index into surface indexes', () => {
    const view = buildSurfaceView(buildDataset(), {
      ...defaultSurfaceControls(),
      downsample: 2,
      showSlice: true,
      sliceIndex: 1,
    })

    expect(view.time).toEqual([1, 2, 4])
    expect(view.z[0]).toEqual([1, 2, 4])
    expect(view.sliceTime).toBe(1)
    expect(view.sampledPointCount).toBe(3)
    expect(view.fullTimeRange).toEqual([0, 4])
  })

  it('falls back to channel labels derived from y coordinates', () => {
    const view = buildSurfaceView(buildDataset(), defaultSurfaceControls())
    expect(view.channelLabels).toEqual(['1', '2'])
    expect(view.coordinateMode).toBe('z')
    expect(view.timeUnit).toBe('ms')
    expect(view.valueUnit).toBe('V')
  })

  it('computes the extent across all rows', () => {
    const view = buildSurfaceView(buildDataset(), defaultSurfaceControls())
    expect(view.valueMin).toBe(0)
    expect(view.valueMax).toBe(4)
  })
})
