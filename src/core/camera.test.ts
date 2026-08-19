import { describe, expect, it } from 'vitest'

import {
  cloneSurfaceCamera,
  getSurfaceCameraPreset,
  interpolateSurfaceCamera,
  matchesSurfaceCameraPreset,
  readSurfaceCamera,
  surfaceCameraAnimationDuration,
} from './camera'

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

  it('exposes the animation duration constant', () => {
    expect(surfaceCameraAnimationDuration).toBe(300)
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
