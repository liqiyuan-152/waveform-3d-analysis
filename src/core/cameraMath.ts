/** 相机向量与四元数数学内核：供 camera.ts 组合为相机预设、插值与动画 */

export type SurfaceCameraPoint = {
  x: number
  y: number
  z: number
}

export type SurfaceCameraBasis = {
  right: SurfaceCameraPoint
  up: SurfaceCameraPoint
  forward: SurfaceCameraPoint
}

export type SurfaceQuaternion = {
  x: number
  y: number
  z: number
  w: number
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const addCameraPoints = (first: SurfaceCameraPoint, second: SurfaceCameraPoint) => ({
  x: first.x + second.x,
  y: first.y + second.y,
  z: first.z + second.z,
})

export const subtractCameraPoints = (first: SurfaceCameraPoint, second: SurfaceCameraPoint) => ({
  x: first.x - second.x,
  y: first.y - second.y,
  z: first.z - second.z,
})

export const scaleCameraPoint = (point: SurfaceCameraPoint, scale: number) => ({
  x: point.x * scale,
  y: point.y * scale,
  z: point.z * scale,
})

export const crossCameraPoints = (first: SurfaceCameraPoint, second: SurfaceCameraPoint) => ({
  x: first.y * second.z - first.z * second.y,
  y: first.z * second.x - first.x * second.z,
  z: first.x * second.y - first.y * second.x,
})

export const normalizeCameraPoint = (
  point: SurfaceCameraPoint,
  fallback: SurfaceCameraPoint,
): SurfaceCameraPoint => {
  const length = Math.hypot(point.x, point.y, point.z)
  if (length < 1e-9) {
    return { ...fallback }
  }

  return scaleCameraPoint(point, 1 / length)
}

export const getCameraPointLength = (point: SurfaceCameraPoint) =>
  Math.hypot(point.x, point.y, point.z)

const normalizeQuaternion = (quaternion: SurfaceQuaternion): SurfaceQuaternion => {
  const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
  if (length < 1e-9) {
    return { x: 0, y: 0, z: 0, w: 1 }
  }

  return {
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
    w: quaternion.w / length,
  }
}

/** 由相机正交基构造表示其朝向的单位四元数 */
export const cameraBasisToQuaternion = (basis: SurfaceCameraBasis): SurfaceQuaternion => {
  const { right, up, forward } = basis
  const backward = scaleCameraPoint(forward, -1)
  const trace = right.x + up.y + backward.z
  let quaternion: SurfaceQuaternion

  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2
    quaternion = {
      x: (up.z - backward.y) / scale,
      y: (backward.x - right.z) / scale,
      z: (right.y - up.x) / scale,
      w: 0.25 * scale,
    }
  } else if (right.x > up.y && right.x > backward.z) {
    const scale = Math.sqrt(1 + right.x - up.y - backward.z) * 2
    quaternion = {
      x: 0.25 * scale,
      y: (up.x + right.y) / scale,
      z: (backward.x + right.z) / scale,
      w: (up.z - backward.y) / scale,
    }
  } else if (up.y > backward.z) {
    const scale = Math.sqrt(1 + up.y - right.x - backward.z) * 2
    quaternion = {
      x: (up.x + right.y) / scale,
      y: 0.25 * scale,
      z: (backward.y + up.z) / scale,
      w: (backward.x - right.z) / scale,
    }
  } else {
    const scale = Math.sqrt(1 + backward.z - right.x - up.y) * 2
    quaternion = {
      x: (backward.x + right.z) / scale,
      y: (backward.y + up.z) / scale,
      z: 0.25 * scale,
      w: (right.y - up.x) / scale,
    }
  }

  return normalizeQuaternion(quaternion)
}

const scaleQuaternion = (quaternion: SurfaceQuaternion, scale: number): SurfaceQuaternion => ({
  x: quaternion.x * scale,
  y: quaternion.y * scale,
  z: quaternion.z * scale,
  w: quaternion.w * scale,
})

const addQuaternions = (first: SurfaceQuaternion, second: SurfaceQuaternion) => ({
  x: first.x + second.x,
  y: first.y + second.y,
  z: first.z + second.z,
  w: first.w + second.w,
})

/** 两单位四元数之间的球面线性插值 */
export const slerpQuaternions = (
  from: SurfaceQuaternion,
  to: SurfaceQuaternion,
  progress: number,
): SurfaceQuaternion => {
  let target = to
  let cosine = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w

  if (cosine < 0) {
    target = { x: -to.x, y: -to.y, z: -to.z, w: -to.w }
    cosine = -cosine
  }

  if (cosine > 0.9995) {
    return normalizeQuaternion(
      addQuaternions(scaleQuaternion(from, 1 - progress), scaleQuaternion(target, progress)),
    )
  }

  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)))
  const sine = Math.sin(angle)
  return normalizeQuaternion(
    addQuaternions(
      scaleQuaternion(from, Math.sin((1 - progress) * angle) / sine),
      scaleQuaternion(target, Math.sin(progress * angle) / sine),
    ),
  )
}

/** 用单位四元数旋转一个相机空间向量（Rodrigues 公式） */
export const rotateCameraPoint = (
  quaternion: SurfaceQuaternion,
  point: SurfaceCameraPoint,
): SurfaceCameraPoint => {
  const vector = { x: quaternion.x, y: quaternion.y, z: quaternion.z }
  const twiceCross = scaleCameraPoint(crossCameraPoints(vector, point), 2)

  return addCameraPoints(
    point,
    addCameraPoints(
      scaleCameraPoint(twiceCross, quaternion.w),
      crossCameraPoints(vector, twiceCross),
    ),
  )
}

export const interpolateCameraPoint = (
  from: SurfaceCameraPoint,
  to: SurfaceCameraPoint,
  progress: number,
): SurfaceCameraPoint => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress,
  z: from.z + (to.z - from.z) * progress,
})

export const cameraPointMatches = (value: unknown, target: SurfaceCameraPoint) => {
  if (!isRecord(value)) {
    return false
  }

  return (['x', 'y', 'z'] as const).every((key) => {
    const coordinate = value[key]
    return typeof coordinate === 'number' && Math.abs(coordinate - target[key]) < 1e-6
  })
}
