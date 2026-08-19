import type {
  SurfaceColorScale,
  SurfaceDownsample,
  SurfaceRenderQuality,
  SurfaceSmoothWindow,
} from '../core/surfaceView'

/** 工具栏选项与布局辅助（无组件状态） */

const sliceTimeNumberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

export const formatSliceTime = (value: number) => sliceTimeNumberFormatter.format(value)

export const isDisplayedPlotHost = (host: HTMLDivElement | null) => {
  if (!host?.isConnected) {
    return false
  }

  const rect = host.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export const waitForLayoutFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve())
      return
    }

    resolve()
  })

export const smoothOptions: Array<{ label: string; value: SurfaceSmoothWindow }> = [
  { label: '关闭', value: 1 },
  { label: '3 点', value: 3 },
  { label: '5 点', value: 5 },
  { label: '9 点', value: 9 },
]

export const downsampleOptions: Array<{ label: string; value: SurfaceDownsample }> = [
  { label: '原始返回数据', value: 1 },
  { label: '每 2 点', value: 2 },
  { label: '每 5 点', value: 5 },
  { label: '每 10 点', value: 10 },
]

export const qualityOptions: Array<{ label: string; value: SurfaceRenderQuality }> = [
  { label: '流畅', value: 1 },
  { label: '均衡', value: 1.5 },
  { label: '高清', value: 2 },
]

export const colorOptions: Array<{ label: string; value: SurfaceColorScale }> = [
  'Jet',
  'Turbo',
  'Hot',
  'Viridis',
].map((value) => ({ label: value, value: value as SurfaceColorScale }))

export const viewPresetOptionDefs: Array<{ label: string; value: string }> = [
  { label: '默认视图', value: 'default' },
  { label: '侧视图', value: 'side' },
  { label: '正视图', value: 'front' },
  { label: '俯视图', value: 'top' },
]
