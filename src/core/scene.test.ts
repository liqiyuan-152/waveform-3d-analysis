import { describe, expect, it } from 'vitest'

import {
  buildSurfacePlotConfig,
  buildSurfaceScene,
  cloneSurfaceCamera,
  getSurfaceCameraPreset,
  interpolateSurfaceCamera,
  matchesSurfaceCameraPreset,
  readSurfaceCamera,
} from './scene'
import type { SurfaceView } from './surfaceView'

const buildView = (overrides: Partial<SurfaceView> = {}): SurfaceView => ({
  time: [0, 1, 2],
  fullTimeRange: [0, 2],
  y: [1, 2],
  z: [
    [0, 1, 2],
    [2, 1, 0],
  ],
  channelLabels: ['CH01', 'CH02'],
  coordinateMode: 'z',
  colorMin: 0,
  colorMax: 2,
  valueMin: 0,
  valueMax: 2,
  sliceTime: 1,
  sliceValues: [1, 1],
  sampledPointCount: 3,
  timeUnit: 'ms',
  valueUnit: 'V',
  ...overrides,
})

describe('camera presets', () => {
  it('returns defensive copies', () => {
    const first = getSurfaceCameraPreset('side')
    const second = getSurfaceCameraPreset('side')
    expect(first).not.toBe(second)
    expect(cloneSurfaceCamera(first)).toEqual(first)
  })

  it('matches a preset camera only for the same preset', () => {
    const camera = getSurfaceCameraPreset('top')
    expect(matchesSurfaceCameraPreset(camera, 'top')).toBe(true)
    expect(matchesSurfaceCameraPreset(camera, 'front')).toBe(false)
    expect(matchesSurfaceCameraPreset({ invalid: true }, 'top')).toBe(false)
  })

  it('reads a camera from an unknown payload', () => {
    expect(readSurfaceCamera(getSurfaceCameraPreset('default'))).toEqual(
      getSurfaceCameraPreset('default'),
    )
    expect(readSurfaceCamera({ up: { x: 0, y: 0, z: 1 } })).toBeNull()
  })
})

describe('interpolateSurfaceCamera', () => {
  it('returns exact endpoints outside (0, 1)', () => {
    const from = getSurfaceCameraPreset('side')
    const to = getSurfaceCameraPreset('front')

    expect(interpolateSurfaceCamera(from, to, 0)).toEqual(from)
    expect(interpolateSurfaceCamera(from, to, 1)).toEqual(to)
  })

  it('keeps camera units normalized in between', () => {
    const from = getSurfaceCameraPreset('side')
    const to = getSurfaceCameraPreset('top')
    const middle = interpolateSurfaceCamera(from, to, 0.5)

    expect(Math.hypot(middle.up.x, middle.up.y, middle.up.z)).toBeCloseTo(1, 6)
    expect(middle.eye).toBeDefined()
  })
})

describe('buildSurfacePlotConfig', () => {
  it('maps quality to the GL pixel ratio', () => {
    expect(buildSurfacePlotConfig(1)).toMatchObject({ plotGlPixelRatio: 1, locale: 'zh-CN' })
    expect(buildSurfacePlotConfig(2)).toMatchObject({ plotGlPixelRatio: 2, scrollZoom: true })
  })
})

describe('buildSurfaceScene', () => {
  it('creates a single surface trace without slice', () => {
    const scene = buildSurfaceScene({ view: buildView(), color: 'Jet', showSlice: false })
    expect(scene.data).toHaveLength(1)
    expect(scene.data[0]).toMatchObject({ type: 'surface' })
    expect(scene.layout.scene?.camera).toEqual(getSurfaceCameraPreset('default'))
    expect(scene.layout.scene?.zaxis?.title).toEqual({ text: '幅值 (V)' })
  })

  it('adds slice plane and slice curve when enabled', () => {
    const scene = buildSurfaceScene({ view: buildView(), color: 'Turbo', showSlice: true })
    expect(scene.data).toHaveLength(3)
    expect(scene.data[1]).toMatchObject({ type: 'surface', opacity: 0.22 })
    expect(scene.data[2]).toMatchObject({ type: 'scatter3d' })
  })

  it('uses spatial axis title in spatial mode', () => {
    const scene = buildSurfaceScene({
      view: buildView({ coordinateMode: 'spatial' }),
      color: 'Jet',
      showSlice: false,
    })
    expect(scene.layout.scene?.yaxis?.title).toEqual({ text: '空间位置' })
  })
})
