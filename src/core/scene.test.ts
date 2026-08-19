import { describe, expect, it } from 'vitest'

import { getSurfaceCameraPreset } from './camera'
import { buildSurfacePlotConfig, buildSurfaceScene, matlabJet } from './scene'
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

  it('keeps the matlab jet color scale with 7 anchors', () => {
    expect(matlabJet).toHaveLength(7)
    expect(matlabJet[0]).toEqual([0, '#000080'])
  })
})
