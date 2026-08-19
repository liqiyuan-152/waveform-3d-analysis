/**
 * 3D 波形分析组件库公共数据类型
 * @packageDocumentation
 */

/** 3D 曲面 Y 轴坐标模式：`z` 按通道 Z 坐标排布，`spatial` 按空间位置排布 */
export type ThreeDCoordinateMode = 'z' | 'spatial'

/** 查询选中的通道（用于构建后端查询负载） */
export type ThreeDSelectedChannelItem = {
  channelName: string
  channelId: number
  spatialCoordinate?: string
}

/**
 * 3D 波形分析的一行通道数据（通道 + 炮号唯一定位一行曲面）。
 * 对应原项目中的 `AnalysisPreviewRow`。
 */
export type ThreeDChannelRow = {
  channelName: string
  channelId?: number
  unit: string
  color: string
  displayPosition: string
  spatialCoordinate?: string
  zCoordinate: string
  cannonNumber: string
  noData?: boolean
  noDataMessage?: string
}

/**
 * 后端波形查询返回的单行数据（一个炮号 × 一个通道）。
 * 对应原项目接口模型 `WaveformAnalysisSearchResponseItem`。
 */
export interface ThreeDResponseRow {
  chnl: string
  chnl_id?: number
  dat_unit?: string | null
  data: number[]
  dev: number
  msg?: string | null
  no_data?: boolean
  shot: number
  time: number[]
  time_unit?: string | null
}

/** 波形查询请求中的单项（炮号 × 通道） */
export interface ThreeDWaveformQueryRequestItem {
  shot: number
  chnl_id?: number
  chnl_name?: string
}

/** 波形查询请求负载 */
export interface ThreeDWaveformQueryRequest {
  user_name: string
  dev: number
  list: ThreeDWaveformQueryRequestItem[]
  start_time: string
  end_time: string
  point_count?: number
}
