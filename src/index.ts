/**
 * 3D 波形分析组件库主入口
 * @packageDocumentation
 */

// Vue 组件
export { default as ThreeDWaveformChart } from './components/ThreeDWaveformChart'
export type {
  ThreeDWaveformChartError,
  ThreeDWaveformChartErrorKind,
} from './components/ThreeDWaveformChart'
export type { ThreeDSegmentedOption } from './components/Segmented'

// 公共数据类型
export type {
  ThreeDCoordinateMode,
  ThreeDChannelRow,
  ThreeDResponseRow,
  ThreeDSelectedChannelItem,
  ThreeDWaveformQueryRequest,
  ThreeDWaveformQueryRequestItem,
} from './types'

// 场景与数据集类型
export type { SurfaceDataset, SurfaceScene } from './core/scene'

// 相机类型与常量
export type { SurfaceCamera, SurfaceCameraBasis, SurfaceViewPreset } from './core/camera'

// 视图与控制类型
export type {
  SurfaceControls,
  SurfaceView,
  SurfaceSmoothWindow,
  SurfaceDownsample,
  SurfaceRenderQuality,
  SurfaceColorScale,
} from './core/surfaceView'

// 数据管道类型
export type { ThreeDSurfaceUnitIssue } from './core/queryAdapter'
export type {
  SurfaceResampleResult,
  SurfaceUnionResampleResult,
  TimeDataPair,
  WasmResampleModule,
} from './core/resample'

// 数据管道：响应行 → 3D 曲面数据集
export {
  buildThreeDSurfaceDataset,
  buildThreeDWaveformQueryPayload,
  getThreeDSurfaceUnitIssue,
  hasSameThreeDChannelRowIdentities,
  sortThreeDChannelRows,
} from './core/queryAdapter'

// 相机控制
export {
  animateSurfaceCamera,
  cloneSurfaceCamera,
  easeSurfaceCameraProgress,
  getSurfaceCameraBasis,
  getSurfaceCameraPreset,
  interpolateSurfaceCamera,
  matchesSurfaceCameraPreset,
  readSurfaceCamera,
  surfaceCameraAnimationDuration,
  surfaceDefaultCamera,
  surfaceSideCamera,
} from './core/camera'

// 场景构建
export { buildSurfacePlotConfig, buildSurfaceScene, matlabJet } from './core/scene'

// 视图构建
export {
  buildSurfaceSampleIndexes,
  buildSurfaceView,
  defaultSurfaceControls,
  hasDrawableSurfaceDataset,
  smoothSurfaceSeries,
} from './core/surfaceView'

// 时间轴并集与重采样
export {
  buildTimeDataPairs,
  buildUnionAndResampleRows,
  buildUnionTimeValues,
  normalizeSurfaceValue,
  resampleDataToUnionTimeValues,
  resampleRowsToUnionTimeValues,
  setWasmResampleLoader,
} from './core/resample'
