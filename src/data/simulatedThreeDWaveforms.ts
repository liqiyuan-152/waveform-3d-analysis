import type { ThreeDChannelRow, ThreeDCoordinateMode, ThreeDResponseRow } from '../types'
import type { SurfaceDataset } from '../core/scene'
import { buildThreeDSurfaceDataset } from '../core/queryAdapter'

/** 模拟数据生成选项 */
export type SimulatedThreeDWaveformOptions = {
  /** 通道数量（每炮号每通道一行曲面） */
  channelCount: number
  /** 每通道采样点数 */
  pointCount: number
  /** 炮号列表 */
  shots: string[]
  /** Y 轴坐标模式 */
  coordinateMode: ThreeDCoordinateMode
  /** 各通道是否使用略有差异的时间基（触发并集重采样） */
  mixedTimeBases: boolean
  /** 随机种子 */
  seed: number
}

export const defaultSimulatedThreeDWaveformOptions = (): SimulatedThreeDWaveformOptions => ({
  channelCount: 8,
  pointCount: 600,
  shots: ['2024036'],
  coordinateMode: 'z',
  mixedTimeBases: true,
  seed: 20260819,
})

/** 与 mulberry32 等价的种子随机数生成器，保证同种子数据可复现 */
const createSeededRandom = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const channelPalette = [
  '#1677FF',
  '#52C41A',
  '#FA8C16',
  '#722ED1',
  '#13C2C2',
  '#EB2F96',
  '#FADB14',
  '#FA541C',
  '#2F54EB',
  '#A0D911',
  '#FAAD14',
  '#FF7A45',
]

const CHANNEL_NAME_PREFIX = 'CH'

const buildChannelRows = (
  options: SimulatedThreeDWaveformOptions,
): { channelRows: ThreeDChannelRow[]; names: string[] } => {
  const random = createSeededRandom(options.seed)
  const rows: ThreeDChannelRow[] = []
  const names: string[] = []

  options.shots.forEach((shot) => {
    for (let channelIndex = 0; channelIndex < options.channelCount; channelIndex += 1) {
      const channelName = `${CHANNEL_NAME_PREFIX}${String(channelIndex + 1).padStart(2, '0')}`
      names.push(channelName)
      rows.push({
        channelName,
        channelId: channelIndex + 1,
        unit: 'V',
        color: channelPalette[channelIndex % channelPalette.length],
        displayPosition: '图框1',
        spatialCoordinate: String(Number((channelIndex * 1.25).toFixed(2))),
        zCoordinate: String(channelIndex),
        cannonNumber: shot,
      })
    }
  })

  // 打乱顺序以演示按坐标排序的效果
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[rows[index], rows[swapIndex]] = [rows[swapIndex], rows[index]]
  }

  return { channelRows: rows, names }
}

const buildResponseRows = (
  options: SimulatedThreeDWaveformOptions,
  names: string[],
): ThreeDResponseRow[] => {
  const random = createSeededRandom(options.seed + 1)
  const duration = 10
  const rows: ThreeDResponseRow[] = []

  names.forEach((channelName, channelIndex) => {
    // 混合时间基：每个通道的时间步长与起点略有差异，验证并集重采样
    const baseStep = duration / options.pointCount
    const step = options.mixedTimeBases ? baseStep * (0.96 + random() * 0.08) : baseStep
    const startTimeOffset = options.mixedTimeBases ? random() * baseStep : 0
    const amplitude = 1 + 1.6 * Math.exp(-(channelIndex % 6) / 2.5)
    const frequency = 0.8 + ((channelIndex * 37) % 11) * 0.22
    const phase = (channelIndex * 0.7) % (Math.PI * 2)
    const decay = duration * (0.45 + ((channelIndex * 13) % 7) * 0.08)

    const time: number[] = []
    const data: number[] = []
    for (let pointIndex = 0; pointIndex < options.pointCount; pointIndex += 1) {
      const t = startTimeOffset + pointIndex * step
      const envelope = Math.exp(-t / decay)
      const value =
        amplitude *
          envelope *
          (Math.sin(2 * Math.PI * frequency * t + phase) +
            0.18 * Math.sin(2 * Math.PI * frequency * 3.3 * t + phase * 1.7)) +
        (random() - 0.5) * 0.06
      time.push(Number(t.toFixed(6)))
      data.push(Number(value.toFixed(6)))
    }

    rows.push({
      chnl: channelName,
      chnl_id: (channelIndex % options.channelCount) + 1,
      dat_unit: 'V',
      data,
      dev: 4,
      shot: Number(options.shots[Math.floor(channelIndex / options.channelCount)]),
      time,
      time_unit: 'ms',
    })
  })

  return rows
}

export type SimulatedThreeDWaveformResult = {
  dataset: SurfaceDataset
  responseRows: ThreeDResponseRow[]
  channelRows: ThreeDChannelRow[]
}

/** 生成模拟的多通道波形并走真实数据管道构建 3D 曲面数据集 */
export const buildSimulatedSurfaceDataset = async (
  options: SimulatedThreeDWaveformOptions,
): Promise<SimulatedThreeDWaveformResult> => {
  const { channelRows, names } = buildChannelRows(options)
  const responseRows = buildResponseRows(options, names)
  const dataset = await buildThreeDSurfaceDataset({
    responseRows,
    channelRows,
    coordinateMode: options.coordinateMode,
  })

  return { dataset, responseRows, channelRows }
}
