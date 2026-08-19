/** 图表内部交互错误类型（宿主可通过 `error` 事件接收并提示） */
export type ThreeDWaveformChartErrorKind = 'camera-switch' | 'download'

export type ThreeDWaveformChartError = {
  kind: ThreeDWaveformChartErrorKind
  message: string
}

export type ThreeDWaveformChartErrorSink = (
  kind: ThreeDWaveformChartErrorKind,
  message: string,
  error: unknown,
) => void
