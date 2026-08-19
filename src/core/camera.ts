import {
  cameraBasisToQuaternion,
  cameraPointMatches,
  crossCameraPoints,
  getCameraPointLength,
  interpolateCameraPoint,
  isRecord,
  normalizeCameraPoint,
  rotateCameraPoint,
  scaleCameraPoint,
  slerpQuaternions,
  subtractCameraPoints,
} from './cameraMath'
import type { SurfaceCameraBasis, SurfaceCameraPoint } from './cameraMath'

export type { SurfaceCameraBasis, SurfaceCameraPoint } from './cameraMath'

export type SurfaceViewPreset = 'default' | 'side' | 'front' | 'top'

export type SurfaceCamera = {
  up: SurfaceCameraPoint
  center: SurfaceCameraPoint
  eye: SurfaceCameraPoint
  projection: {
    type: 'orthographic' | 'perspective'
  }
}

export const surfaceCameraAnimationDuration = 300

export const surfaceDefaultCamera: SurfaceCamera = {
  up: { x: 0, y: 0, z: 1 },
  center: {
    x: -0.1171903800756957,
    y: 0.03869572414200659,
    z: -0.1729280018754842,
  },
  eye: {
    x: -1.577190380075695,
    y: -1.5813042758579936,
    z: 0.7870719981245158,
  },
  projection: { type: 'perspective' },
}

export const surfaceSideCamera: SurfaceCamera = {
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: 0 },
  eye: { x: -2.2, y: 0, z: 0 },
  projection: { type: 'perspective' },
}

const surfaceCameraPresets: Record<SurfaceViewPreset, SurfaceCamera> = {
  default: surfaceDefaultCamera,
  side: surfaceSideCamera,
  front: {
    up: { x: 0, y: 0, z: 1 },
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: -2.2, z: 0 },
    projection: { type: 'perspective' },
  },
  top: {
    up: { x: 0, y: 1, z: 0 },
    center: { x: 0, y: 0, z: 0 },
    eye: { x: 0, y: 0, z: 2.35 },
    projection: { type: 'perspective' },
  },
}

export const cloneSurfaceCamera = (camera: SurfaceCamera): SurfaceCamera => ({
  up: { ...camera.up },
  center: { ...camera.center },
  eye: { ...camera.eye },
  projection: { ...camera.projection },
})

export const getSurfaceCameraPreset = (preset: SurfaceViewPreset): SurfaceCamera =>
  cloneSurfaceCamera(surfaceCameraPresets[preset])

const readCameraPoint = (value: unknown): SurfaceCameraPoint | null => {
  if (!isRecord(value)) {
    return null
  }

  const { x, y, z } = value
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    return null
  }

  return { x, y, z }
}

/** 从未知负载（Plotly relayout 事件等）中解析相机，结构不完整时返回 null */
export const readSurfaceCamera = (value: unknown): SurfaceCamera | null => {
  if (!isRecord(value)) {
    return null
  }

  const up = readCameraPoint(value.up)
  const center = readCameraPoint(value.center)
  const eye = readCameraPoint(value.eye)
  const projection = value.projection
  if (
    !up ||
    !center ||
    !eye ||
    !isRecord(projection) ||
    (projection.type !== 'perspective' && projection.type !== 'orthographic')
  ) {
    return null
  }

  return {
    up,
    center,
    eye,
    projection: { type: projection.type },
  }
}

export const easeSurfaceCameraProgress = (progress: number) => {
  const boundedProgress = Math.max(0, Math.min(1, progress))
  return boundedProgress < 0.5 ? 4 * boundedProgress ** 3 : 1 - (-2 * boundedProgress + 2) ** 3 / 2
}

export const getSurfaceCameraBasis = (camera: SurfaceCamera): SurfaceCameraBasis => {
  const forward = normalizeCameraPoint(subtractCameraPoints(camera.center, camera.eye), {
    x: 0,
    y: 0,
    z: 1,
  })
  const right = normalizeCameraPoint(crossCameraPoints(forward, camera.up), {
    x: 1,
    y: 0,
    z: 0,
  })
  const up = normalizeCameraPoint(crossCameraPoints(right, forward), {
    x: 0,
    y: 0,
    z: 1,
  })

  return { right, up, forward }
}

/** 基于四元数球面插值的两相机过渡：朝向平滑旋转，中心线性插值，半径保持连续 */
export const interpolateSurfaceCamera = (
  from: SurfaceCamera,
  to: SurfaceCamera,
  progress: number,
): SurfaceCamera => {
  if (progress <= 0) {
    return cloneSurfaceCamera(from)
  }

  if (progress >= 1) {
    return cloneSurfaceCamera(to)
  }

  const easedProgress = easeSurfaceCameraProgress(progress)
  const fromBasis = getSurfaceCameraBasis(from)
  const toBasis = getSurfaceCameraBasis(to)
  const orientation = slerpQuaternions(
    cameraBasisToQuaternion(fromBasis),
    cameraBasisToQuaternion(toBasis),
    easedProgress,
  )
  const center = interpolateCameraPoint(from.center, to.center, easedProgress)
  const radius =
    getCameraPointLength(subtractCameraPoints(from.eye, from.center)) * (1 - easedProgress) +
    getCameraPointLength(subtractCameraPoints(to.eye, to.center)) * easedProgress
  const forward = normalizeCameraPoint(
    rotateCameraPoint(orientation, { x: 0, y: 0, z: -1 }),
    toBasis.forward,
  )
  const up = normalizeCameraPoint(rotateCameraPoint(orientation, { x: 0, y: 1, z: 0 }), toBasis.up)

  return {
    up,
    center,
    eye: subtractCameraPoints(center, scaleCameraPoint(forward, radius)),
    projection: { ...to.projection },
  }
}

type AnimateSurfaceCameraOptions = {
  from: SurfaceCamera
  to: SurfaceCamera
  duration?: number
  startTime: number
  requestFrame: () => Promise<number>
  applyCamera: (camera: SurfaceCamera) => Promise<void>
  isActive: () => boolean
}

/** 逐帧驱动相机插值；被取消或失活时返回 false，完整播完返回 true */
export const animateSurfaceCamera = async ({
  from,
  to,
  duration = surfaceCameraAnimationDuration,
  startTime,
  requestFrame,
  applyCamera,
  isActive,
}: AnimateSurfaceCameraOptions): Promise<boolean> => {
  while (isActive()) {
    const timestamp = await requestFrame()
    if (!isActive() || !Number.isFinite(timestamp)) {
      return false
    }

    const progress = Math.min(1, Math.max(0, (timestamp - startTime) / duration))
    await applyCamera(interpolateSurfaceCamera(from, to, progress))

    if (!isActive()) {
      return false
    }
    if (progress >= 1) {
      return true
    }
  }

  return false
}

export const matchesSurfaceCameraPreset = (camera: unknown, preset: SurfaceViewPreset) => {
  if (!isRecord(camera)) {
    return false
  }

  const target = surfaceCameraPresets[preset]
  const projection = camera.projection

  return (
    cameraPointMatches(camera.up, target.up) &&
    cameraPointMatches(camera.center, target.center) &&
    cameraPointMatches(camera.eye, target.eye) &&
    isRecord(projection) &&
    projection.type === target.projection.type
  )
}
