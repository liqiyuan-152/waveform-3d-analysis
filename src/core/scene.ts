import type { Config, Data, Layout } from 'plotly.js'

import type { ThreeDCoordinateMode } from '../types'
import type { SurfaceColorScale, SurfaceRenderQuality, SurfaceView } from './surfaceView'

/** 3D 曲面数据集：x 为时间轴，y 为通道坐标轴，z 为通道 × 时间 的幅值矩阵 */
export type SurfaceDataset = {
  x: number[]
  y: number[]
  z: Array<Array<number | null>>
  channelLabels?: string[]
  channelColors?: string[]
  coordinateMode?: ThreeDCoordinateMode
  timeUnit?: string
  valueUnit?: string
}

export type SurfaceScene = {
  data: Data[]
  layout: Partial<Layout>
}

export type SurfaceViewPreset = 'default' | 'side' | 'front' | 'top'

export const surfaceCameraAnimationDuration = 300

type SurfaceCameraPoint = {
  x: number
  y: number
  z: number
}

export type SurfaceCameraBasis = {
  right: SurfaceCameraPoint
  up: SurfaceCameraPoint
  forward: SurfaceCameraPoint
}

type SurfaceQuaternion = {
  x: number
  y: number
  z: number
  w: number
}

export type SurfaceCamera = {
  up: SurfaceCameraPoint
  center: SurfaceCameraPoint
  eye: SurfaceCameraPoint
  projection: {
    type: 'orthographic' | 'perspective'
  }
}

type BuildSurfaceSceneOptions = {
  view: SurfaceView
  color: SurfaceColorScale
  showSlice: boolean
}

export const matlabJet: Array<[number, string]> = [
  [0, '#000080'],
  [0.125, '#0000ff'],
  [0.375, '#00ffff'],
  [0.625, '#ffff00'],
  [0.78, '#ff8c00'],
  [0.9, '#ff0000'],
  [1, '#b00000'],
]

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

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

const addCameraPoints = (first: SurfaceCameraPoint, second: SurfaceCameraPoint) => ({
  x: first.x + second.x,
  y: first.y + second.y,
  z: first.z + second.z,
})

const subtractCameraPoints = (first: SurfaceCameraPoint, second: SurfaceCameraPoint) => ({
  x: first.x - second.x,
  y: first.y - second.y,
  z: first.z - second.z,
})

const scaleCameraPoint = (point: SurfaceCameraPoint, scale: number) => ({
  x: point.x * scale,
  y: point.y * scale,
  z: point.z * scale,
})

const crossCameraPoints = (first: SurfaceCameraPoint, second: SurfaceCameraPoint) => ({
  x: first.y * second.z - first.z * second.y,
  y: first.z * second.x - first.x * second.z,
  z: first.x * second.y - first.y * second.x,
})

const normalizeCameraPoint = (
  point: SurfaceCameraPoint,
  fallback: SurfaceCameraPoint,
): SurfaceCameraPoint => {
  const length = Math.hypot(point.x, point.y, point.z)
  if (length < 1e-9) {
    return { ...fallback }
  }

  return scaleCameraPoint(point, 1 / length)
}

const getCameraPointLength = (point: SurfaceCameraPoint) => Math.hypot(point.x, point.y, point.z)

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

const cameraBasisToQuaternion = (basis: SurfaceCameraBasis): SurfaceQuaternion => {
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

const slerpQuaternions = (
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

const rotateCameraPoint = (
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

const interpolateCameraPoint = (
  from: SurfaceCameraPoint,
  to: SurfaceCameraPoint,
  progress: number,
): SurfaceCameraPoint => ({
  x: from.x + (to.x - from.x) * progress,
  y: from.y + (to.y - from.y) * progress,
  z: from.z + (to.z - from.z) * progress,
})

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

const cameraPointMatches = (value: unknown, target: SurfaceCameraPoint) => {
  if (!isRecord(value)) {
    return false
  }

  return (['x', 'y', 'z'] as const).every((key) => {
    const coordinate = value[key]
    return typeof coordinate === 'number' && Math.abs(coordinate - target[key]) < 1e-6
  })
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

export const buildSurfacePlotConfig = (quality: SurfaceRenderQuality): Partial<Config> => ({
  displayModeBar: false,
  displaylogo: false,
  locale: 'zh-CN',
  responsive: true,
  scrollZoom: true,
  plotGlPixelRatio: quality,
})

const getColorScale = (color: SurfaceColorScale) => (color === 'Jet' ? matlabJet : color)

const expandExtent = (min: number, max: number, ratio = 0.04): [number, number] => {
  if (min !== max) {
    const padding = (max - min) * ratio
    return [min - padding, max + padding]
  }

  const padding = Math.max(Math.abs(min) * ratio, 1)
  return [min - padding, max + padding]
}

const getAxisRange = (values: number[]): [number, number] | undefined => {
  if (values.length === 0) {
    return undefined
  }

  return expandExtent(Math.min(...values), Math.max(...values), 0.02)
}

const getColorRange = (min: number, max: number): [number, number] =>
  min === max ? expandExtent(min, max) : [min, max]

export const buildSurfaceScene = ({
  view,
  color,
  showSlice,
}: BuildSurfaceSceneOptions): SurfaceScene => {
  const font = {
    family: 'Inter, "Microsoft YaHei", system-ui',
    color: '#172235',
  }
  const traces: Data[] = []
  const [colorMin, colorMax] = getColorRange(view.colorMin, view.colorMax)
  const valueRange = expandExtent(view.valueMin, view.valueMax)
  const yRange = getAxisRange(view.y)
  const timeRange = getAxisRange(view.fullTimeRange)
  const valueTitle = view.valueUnit ? `幅值 (${view.valueUnit})` : '幅值'
  const channelCoordinateTitle = view.coordinateMode === 'spatial' ? '空间位置' : '通道序号'
  const channelTickLabels =
    view.coordinateMode === 'spatial'
      ? view.y.map((coordinate) => String(coordinate))
      : view.channelLabels

  if (view.time.length > 1 && view.y.length > 0) {
    traces.push({
      type: 'surface',
      x: view.time,
      y: view.y,
      z: view.z,
      colorscale: getColorScale(color),
      cmin: colorMin,
      cmax: colorMax,
      showscale: true,
      colorbar: {
        orientation: 'v',
        thicknessmode: 'pixels',
        thickness: 14,
        lenmode: 'fraction',
        len: 0.72,
        x: 1.02,
        xanchor: 'left',
        y: 0.5,
        yanchor: 'middle',
        nticks: 5,
        outlinecolor: '#9aa4b2',
        outlinewidth: 1,
        title: { text: valueTitle, side: 'top' },
      },
      hovertemplate: `时间 %{x:.6g} ${view.timeUnit}<br>${channelCoordinateTitle} %{y}<br>${valueTitle} %{z:.6g}<extra></extra>`,
      contours: {
        x: { show: false },
        y: { show: false },
        z: { show: false },
      },
      lighting: {
        ambient: 0.96,
        diffuse: 0.36,
        specular: 0,
        roughness: 1,
        fresnel: 0,
      },
      lightposition: { x: 0, y: 0, z: 1000 },
    } as unknown as Data)
  }

  if (showSlice && yRange) {
    traces.push(
      {
        type: 'surface',
        x: [
          [view.sliceTime, view.sliceTime],
          [view.sliceTime, view.sliceTime],
        ],
        y: [
          [yRange[0], yRange[1]],
          [yRange[0], yRange[1]],
        ],
        z: [
          [valueRange[0], valueRange[0]],
          [valueRange[1], valueRange[1]],
        ],
        surfacecolor: [
          [0, 0],
          [0, 0],
        ],
        colorscale: [
          [0, '#ef5b34'],
          [1, '#ef5b34'],
        ],
        cmin: 0,
        cmax: 1,
        opacity: 0.22,
        showscale: false,
        hoverinfo: 'skip',
        lighting: {
          ambient: 1,
          diffuse: 0,
          specular: 0,
          roughness: 1,
          fresnel: 0,
        },
      } as unknown as Data,
      {
        type: 'scatter3d',
        mode: 'lines+markers',
        x: view.y.map(() => view.sliceTime),
        y: view.y,
        z: view.sliceValues,
        connectgaps: false,
        line: { color: '#172235', width: 8 },
        marker: {
          color: '#fff',
          line: { color: '#172235', width: 1 },
          size: 3.5,
        },
        hovertemplate: `${channelCoordinateTitle} %{y}<br>${valueTitle} %{z:.6g}<extra>时间切片</extra>`,
        showlegend: false,
      } as unknown as Data,
    )
  }

  return {
    data: traces,
    layout: {
      font: { ...font, size: 11 },
      paper_bgcolor: '#fff',
      margin: { l: 0, r: 80, t: 8, b: 32 },
      scene: {
        bgcolor: '#fff',
        camera: getSurfaceCameraPreset('default'),
        dragmode: 'orbit',
        aspectmode: 'manual',
        aspectratio: { x: 1.7, y: 1, z: 0.72 },
        xaxis: {
          title: { text: `Time (${view.timeUnit})` },
          range: timeRange,
          nticks: 5,
          gridcolor: '#d7dce2',
          zeroline: false,
          showspikes: false,
          showbackground: true,
          backgroundcolor: '#fff',
        },
        yaxis: {
          title: { text: view.coordinateMode === 'spatial' ? '空间位置' : '通道序号' },
          range: yRange,
          tickmode: 'array',
          tickvals: view.y,
          ticktext: channelTickLabels,
          tickfont: { size: 10 },
          gridcolor: '#d7dce2',
          zeroline: false,
          showspikes: false,
          showbackground: true,
          backgroundcolor: '#fff',
        },
        zaxis: {
          title: { text: valueTitle },
          range: valueRange,
          nticks: 4,
          gridcolor: '#d7dce2',
          zeroline: false,
          showspikes: false,
          showbackground: true,
          backgroundcolor: '#fff',
        },
      },
      uirevision: 'three-d-query',
    },
  }
}
