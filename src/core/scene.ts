import type { Config, Data, Layout } from 'plotly.js'

import { getSurfaceCameraPreset } from './camera'
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

/** 由渲染视图构建 Plotly 的 data（曲面 + 可选切片轨迹）与 layout（场景/轴/色标） */
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
