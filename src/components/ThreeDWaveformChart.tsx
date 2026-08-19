import classNames from 'classnames'
import { DownloadOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons-vue'
import { useFullscreen } from '@vueuse/core'
import { Button, Checkbox, Empty, Select, Tooltip } from 'ant-design-vue'
import type { Layout as PlotlyLayout, PlotlyHTMLElement, PlotRelayoutEvent } from 'plotly.js'
import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  type PropType,
  ref,
  shallowRef,
  type VNode,
  watch,
} from 'vue'

import {
  animateSurfaceCamera,
  buildSurfacePlotConfig,
  buildSurfaceScene,
  cloneSurfaceCamera,
  getSurfaceCameraPreset,
  matchesSurfaceCameraPreset,
  readSurfaceCamera,
  surfaceCameraAnimationDuration,
  type SurfaceCamera,
  type SurfaceDataset,
  type SurfaceViewPreset,
} from '../core/scene'
import {
  buildSurfaceView,
  defaultSurfaceControls,
  hasDrawableSurfaceDataset,
  type SurfaceColorScale,
  type SurfaceControls,
  type SurfaceDownsample,
  type SurfaceRenderQuality,
  type SurfaceSmoothWindow,
} from '../core/surfaceView'
import { loadPlotly, type PlotlyRuntime } from './plotlyRuntime'
import Segmented from './Segmented'
import styles from './ThreeDWaveformChart.module.less'

/** 图表内部交互错误类型（宿主可通过 `error` 事件接收并提示） */
export type ThreeDWaveformChartErrorKind = 'camera-switch' | 'download'

export type ThreeDWaveformChartError = {
  kind: ThreeDWaveformChartErrorKind
  message: string
}

const reducedMotionMediaQuery = '(prefers-reduced-motion: reduce)'
const sliceTimeNumberFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

const formatSliceTime = (value: number) => sliceTimeNumberFormatter.format(value)

const isDisplayedPlotHost = (host: HTMLDivElement | null) => {
  if (!host?.isConnected) {
    return false
  }

  const rect = host.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

const waitForLayoutFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve())
      return
    }

    resolve()
  })

export default defineComponent({
  name: 'ThreeDWaveformChart',
  props: {
    /** 3D 曲面数据集；传 null（或不可绘制）时显示空态 */
    dataset: {
      type: Object as PropType<SurfaceDataset | null>,
      default: null,
    },
    /** 宿主标签页激活状态；非激活时暂停渲染，激活后自动恢复 */
    active: {
      type: Boolean,
      default: true,
    },
    /** 初始渲染控制项（仅挂载时生效，可通过暴露的 resetControls 恢复） */
    initialControls: {
      type: Object as PropType<Partial<SurfaceControls>>,
      default: () => ({}),
    },
    /** 空态描述文案 */
    emptyDescription: {
      type: String,
      default: '暂无3D波形数据',
    },
  },
  emits: {
    'controls-change': (controls: SurfaceControls) => !!controls,
    error: (error: ThreeDWaveformChartError) => !!error,
  },
  setup(props, { emit, expose }) {
    const plotHostRef = ref<HTMLDivElement | null>(null)
    const plotInstanceRef = shallowRef<PlotlyHTMLElement | null>(null)
    const resizeObserverRef = shallowRef<ResizeObserver | null>(null)
    const chartPanelRef = ref<HTMLElement | null>(null)
    const { toggle, isFullscreen } = useFullscreen(chartPanelRef)
    let plotlyModule: PlotlyRuntime | null = null
    let plotRenderGeneration = 0
    let plotRenderQueue = Promise.resolve()
    let pendingSurfaceReplacement = false
    let cameraAnimationGeneration = 0
    let cameraAnimationFrameId: number | null = null
    let cameraAnimationFrameResolve: ((timestamp: number) => void) | null = null
    let activeCameraAnimationGeneration: number | null = null
    let programmaticCameraUpdateCount = 0
    let currentSurfaceCamera = getSurfaceCameraPreset('default')

    const initialDefaults: SurfaceControls = {
      ...defaultSurfaceControls(),
      ...props.initialControls,
    }
    const smooth = ref<SurfaceSmoothWindow>(initialDefaults.smooth)
    const downsample = ref<SurfaceDownsample>(initialDefaults.downsample)
    const quality = ref<SurfaceRenderQuality>(initialDefaults.quality)
    const color = ref<SurfaceColorScale>(initialDefaults.color)
    const showSlice = ref(initialDefaults.showSlice)
    const sliceIndex = ref(initialDefaults.sliceIndex)
    const previewSliceIndex = ref(initialDefaults.sliceIndex)
    const imageDownloadLoading = ref(false)
    const activeViewPreset = ref<SurfaceViewPreset | ''>('default')

    const hasData = computed(() => hasDrawableSurfaceDataset(props.dataset ?? null))
    const activeSurfaceView = computed(() =>
      props.dataset
        ? buildSurfaceView(props.dataset, {
            smooth: smooth.value,
            downsample: downsample.value,
            showSlice: showSlice.value,
            sliceIndex: sliceIndex.value,
          })
        : null,
    )
    const canDownloadCurrentImage = computed(
      () => hasData.value && Boolean(plotInstanceRef.value) && !imageDownloadLoading.value,
    )
    const previewTimeText = computed(() => {
      const dataset = props.dataset
      if (!dataset?.x.length) {
        return '--'
      }

      const activeIndex = Math.max(
        0,
        Math.min(dataset.x.length - 1, Math.round(previewSliceIndex.value)),
      )
      return `${formatSliceTime(dataset.x[activeIndex])} ${dataset.timeUnit || 'ms'}`
    })
    const surfaceTimeRange = computed(() => {
      const time = props.dataset?.x
      if (!time?.length) {
        return null
      }

      return {
        start: time[0],
        end: time[time.length - 1],
        pointCount: time.length,
      }
    })

    const smoothOptions = [
      { label: '关闭', value: 1 },
      { label: '3 点', value: 3 },
      { label: '5 点', value: 5 },
      { label: '9 点', value: 9 },
    ]
    const downsampleOptions = [
      { label: '原始返回数据', value: 1 },
      { label: '每 2 点', value: 2 },
      { label: '每 5 点', value: 5 },
      { label: '每 10 点', value: 10 },
    ]
    const qualityOptions = [
      { label: '流畅', value: 1 },
      { label: '均衡', value: 1.5 },
      { label: '高清', value: 2 },
    ]
    const colorOptions = ['Jet', 'Turbo', 'Hot', 'Viridis'].map((value) => ({
      label: value,
      value,
    }))
    const viewPresetOptions = computed(() =>
      [
        { label: '默认视图', value: 'default' },
        { label: '侧视图', value: 'side' },
        { label: '正视图', value: 'front' },
        { label: '俯视图', value: 'top' },
      ].map((option) => ({ ...option, disabled: !hasData.value })),
    )

    const emitError = (kind: ThreeDWaveformChartErrorKind, message: string, error: unknown) => {
      console.error(message, error)
      emit('error', { kind, message })
    }

    const emitControlsChange = () => {
      emit('controls-change', {
        smooth: smooth.value,
        downsample: downsample.value,
        quality: quality.value,
        color: color.value,
        showSlice: showSlice.value,
        sliceIndex: sliceIndex.value,
      })
    }

    const ensurePlotly = async () => {
      if (!plotlyModule) {
        plotlyModule = await loadPlotly()
      }

      return plotlyModule
    }

    const cancelCameraAnimation = (clearPreset = false) => {
      cameraAnimationGeneration += 1
      activeCameraAnimationGeneration = null

      if (cameraAnimationFrameId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(cameraAnimationFrameId)
      }
      cameraAnimationFrameId = null

      const resolvePendingFrame = cameraAnimationFrameResolve
      cameraAnimationFrameResolve = null
      resolvePendingFrame?.(Number.NaN)

      if (clearPreset) {
        activeViewPreset.value = ''
      }
    }

    const requestCameraAnimationFrame = () =>
      new Promise<number>((resolve) => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
          resolve(Number.NaN)
          return
        }

        cameraAnimationFrameResolve = resolve
        cameraAnimationFrameId = window.requestAnimationFrame((timestamp) => {
          cameraAnimationFrameId = null
          cameraAnimationFrameResolve = null
          resolve(timestamp)
        })
      })

    const prefersReducedMotion = () =>
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      window.matchMedia(reducedMotionMediaQuery).matches

    const resetSurfaceCameraToInitialView = () => {
      currentSurfaceCamera = getSurfaceCameraPreset('default')
      activeViewPreset.value = 'default'
    }

    const applySurfaceCamera = async (
      Plotly: PlotlyRuntime,
      graphDiv: PlotlyHTMLElement,
      camera: SurfaceCamera,
    ) => {
      programmaticCameraUpdateCount += 1
      currentSurfaceCamera = cloneSurfaceCamera(camera)

      try {
        await Plotly.relayout(graphDiv, {
          'scene.camera': camera,
        } as unknown as Partial<PlotlyLayout>)
      } finally {
        programmaticCameraUpdateCount -= 1
      }
    }

    const disconnectResizeObserver = () => {
      resizeObserverRef.value?.disconnect()
      resizeObserverRef.value = null
    }

    const cleanupPlotListeners = () => {
      plotInstanceRef.value?.removeAllListeners?.('plotly_relayout')
      plotInstanceRef.value?.removeAllListeners?.('plotly_relayouting')
    }

    const logCameraPosition = (camera: unknown) => {
      if (camera) {
        console.info('[ThreeDWaveformChart] camera position:', camera)
      }
    }

    const bindCameraListener = (graphDiv: PlotlyHTMLElement) => {
      cleanupPlotListeners()

      graphDiv.on?.('plotly_relayouting', (payload: PlotRelayoutEvent) => {
        const record = payload as unknown as Record<string, unknown>
        if (!Object.keys(record).some((key) => key.startsWith('scene.camera'))) {
          return
        }
        if (programmaticCameraUpdateCount > 0) {
          return
        }

        const camera =
          readSurfaceCamera(record['scene.camera']) ??
          readSurfaceCamera(graphDiv.layout.scene?.camera)
        if (camera) {
          currentSurfaceCamera = camera
        }

        cancelCameraAnimation(true)
      })

      graphDiv.on?.('plotly_relayout', (payload: PlotRelayoutEvent) => {
        const record = payload as unknown as Record<string, unknown>
        const camera = record['scene.camera']
        logCameraPosition(camera)

        const nextCamera = readSurfaceCamera(camera)
        if (nextCamera) {
          currentSurfaceCamera = nextCamera
        }

        if (programmaticCameraUpdateCount > 0 || activeCameraAnimationGeneration !== null) {
          return
        }

        if (camera) {
          const selectedPreset = activeViewPreset.value
          if (selectedPreset && matchesSurfaceCameraPreset(camera, selectedPreset)) {
            return
          }

          activeViewPreset.value = ''
          return
        }

        if (Object.keys(record).some((key) => key.startsWith('scene.camera'))) {
          activeViewPreset.value = ''
        }
      })
    }

    const handleViewPresetChange = async (value: string) => {
      if (!['default', 'side', 'front', 'top'].includes(value)) {
        return
      }

      const preset = value as SurfaceViewPreset
      const graphDiv = plotInstanceRef.value
      if (!hasData.value || !graphDiv) {
        return
      }

      cancelCameraAnimation()
      const animationGeneration = cameraAnimationGeneration

      const Plotly = await ensurePlotly()
      if (
        animationGeneration !== cameraAnimationGeneration ||
        !hasData.value ||
        graphDiv !== plotInstanceRef.value
      ) {
        return
      }

      const previousPreset = activeViewPreset.value
      const previousCamera = cloneSurfaceCamera(currentSurfaceCamera)
      const targetCamera = getSurfaceCameraPreset(preset)
      activeCameraAnimationGeneration = animationGeneration
      activeViewPreset.value = preset

      try {
        if (prefersReducedMotion()) {
          await applySurfaceCamera(Plotly, graphDiv, targetCamera)
        } else {
          const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
          const completed = await animateSurfaceCamera({
            from: previousCamera,
            to: targetCamera,
            duration: surfaceCameraAnimationDuration,
            startTime,
            requestFrame: requestCameraAnimationFrame,
            applyCamera: (camera) => applySurfaceCamera(Plotly, graphDiv, camera),
            isActive: () =>
              animationGeneration === cameraAnimationGeneration &&
              hasData.value &&
              graphDiv === plotInstanceRef.value,
          })
          if (!completed) {
            return
          }
        }

        if (
          animationGeneration !== cameraAnimationGeneration ||
          !hasData.value ||
          graphDiv !== plotInstanceRef.value
        ) {
          return
        }

        await Plotly.redraw(graphDiv)

        if (graphDiv === plotInstanceRef.value) {
          activeCameraAnimationGeneration = null
          activeViewPreset.value = preset
        }
      } catch (error) {
        if (
          animationGeneration !== cameraAnimationGeneration ||
          graphDiv !== plotInstanceRef.value
        ) {
          return
        }

        cancelCameraAnimation()
        const rollbackGeneration = cameraAnimationGeneration
        try {
          await applySurfaceCamera(Plotly, graphDiv, previousCamera)
          if (
            rollbackGeneration !== cameraAnimationGeneration ||
            graphDiv !== plotInstanceRef.value
          ) {
            return
          }
          await Plotly.redraw(graphDiv)
          if (
            rollbackGeneration === cameraAnimationGeneration &&
            graphDiv === plotInstanceRef.value
          ) {
            activeViewPreset.value = previousPreset
          }
        } catch (rollbackError) {
          if (
            rollbackGeneration !== cameraAnimationGeneration ||
            graphDiv !== plotInstanceRef.value
          ) {
            return
          }

          activeViewPreset.value = ''
          console.error('3D视角恢复失败:', rollbackError)
        }

        emitError('camera-switch', '3D视角切换失败，请重试', error)
      }
    }

    const bindResizeObserver = () => {
      const host = plotHostRef.value

      if (typeof ResizeObserver !== 'function' || !host) {
        return
      }

      disconnectResizeObserver()
      resizeObserverRef.value = new ResizeObserver(() => {
        const Plotly = plotlyModule
        const graphDiv = plotInstanceRef.value ?? plotHostRef.value

        if (Plotly && graphDiv && isDisplayedPlotHost(host)) {
          Plotly.Plots.resize(graphDiv)
        }
      })
      resizeObserverRef.value.observe(host)
    }

    const clearPlot = () => {
      plotRenderGeneration += 1
      pendingSurfaceReplacement = false
      cancelCameraAnimation()
      const Plotly = plotlyModule

      disconnectResizeObserver()
      cleanupPlotListeners()

      const graphDiv = plotInstanceRef.value ?? plotHostRef.value
      if (Plotly && graphDiv) {
        Plotly.purge(graphDiv)
      }

      plotInstanceRef.value = null
      resetSurfaceCameraToInitialView()
    }

    const canRenderPlot = (host: HTMLDivElement) =>
      props.active &&
      hasData.value &&
      Boolean(activeSurfaceView.value) &&
      host === plotHostRef.value &&
      isDisplayedPlotHost(host)

    const renderPlot = (mode: 'new' | 'react') => {
      const host = plotHostRef.value

      if (!host || !canRenderPlot(host)) {
        return Promise.resolve()
      }

      const renderGeneration = plotRenderGeneration + 1
      plotRenderGeneration = renderGeneration
      plotRenderQueue = plotRenderQueue
        .catch(() => undefined)
        .then(async () => {
          if (renderGeneration !== plotRenderGeneration || !canRenderPlot(host)) {
            return
          }

          const view = activeSurfaceView.value
          if (!view) {
            return
          }

          if (renderGeneration !== plotRenderGeneration || !canRenderPlot(host)) {
            return
          }

          const Plotly = await ensurePlotly()
          if (renderGeneration !== plotRenderGeneration || !canRenderPlot(host)) {
            return
          }

          const latestView = activeSurfaceView.value
          if (!latestView) {
            return
          }

          const scene = buildSurfaceScene({
            view: latestView,
            color: color.value,
            showSlice: showSlice.value,
          })
          const config = buildSurfacePlotConfig(quality.value)

          if (mode === 'new' || !plotInstanceRef.value) {
            const nextPlot = await Plotly.newPlot(host, scene.data, scene.layout, config)

            if (renderGeneration !== plotRenderGeneration || !canRenderPlot(host)) {
              Plotly.purge((nextPlot ?? host) as unknown as PlotlyHTMLElement)
              return
            }

            const graphDiv = (nextPlot ?? host) as unknown as PlotlyHTMLElement
            plotInstanceRef.value = graphDiv
            resetSurfaceCameraToInitialView()
            bindCameraListener(graphDiv)
            logCameraPosition(scene.layout.scene?.camera)
            return
          }

          await Plotly.react(host, scene.data, scene.layout, config)
          if (renderGeneration !== plotRenderGeneration || !canRenderPlot(host)) {
            Plotly.purge(host)
            plotInstanceRef.value = null
          }
        })

      return plotRenderQueue
    }

    const syncActivePlot = async (forceReact = false) => {
      await nextTick()
      await waitForLayoutFrame()

      const host = plotHostRef.value
      if (!host || !canRenderPlot(host)) {
        return
      }

      if (forceReact || pendingSurfaceReplacement) {
        await renderPlot('react')
        if (plotInstanceRef.value && canRenderPlot(host)) {
          pendingSurfaceReplacement = false
        }
      } else if (!plotInstanceRef.value) {
        await renderPlot('new')
      }

      const Plotly = plotlyModule
      const graphDiv = plotInstanceRef.value
      if (Plotly && graphDiv && canRenderPlot(host)) {
        Plotly.Plots.resize(graphDiv)
      }
    }

    const handleDownloadCurrentImage = async () => {
      if (!canDownloadCurrentImage.value) {
        return
      }

      imageDownloadLoading.value = true

      try {
        await nextTick()

        const graphDiv = plotInstanceRef.value
        if (!hasData.value || !graphDiv) {
          return
        }

        const Plotly = await ensurePlotly()
        if (!hasData.value || graphDiv !== plotInstanceRef.value) {
          return
        }

        await Plotly.downloadImage(graphDiv, {
          format: 'png',
          filename: '3d-waveform',
          width: graphDiv.clientWidth,
          height: graphDiv.clientHeight,
        })
      } catch (error) {
        emitError('download', '3D图像下载失败，请重试', error)
      } finally {
        imageDownloadLoading.value = false
      }
    }

    const handleFullscreenToggle = async () => {
      const graphDiv = plotInstanceRef.value
      if (!hasData.value || !graphDiv) {
        await toggle()
        return
      }

      const fullscreenCamera = cloneSurfaceCamera(currentSurfaceCamera)
      const fullscreenPreset = activeViewPreset.value
      const renderGeneration = plotRenderGeneration

      try {
        await toggle()
        await nextTick()
        await waitForLayoutFrame()

        if (
          renderGeneration !== plotRenderGeneration ||
          !hasData.value ||
          graphDiv !== plotInstanceRef.value
        ) {
          return
        }

        const Plotly = await ensurePlotly()
        if (
          renderGeneration !== plotRenderGeneration ||
          !hasData.value ||
          graphDiv !== plotInstanceRef.value
        ) {
          return
        }

        Plotly.Plots.resize(graphDiv)
        await applySurfaceCamera(Plotly, graphDiv, fullscreenCamera)

        if (
          renderGeneration === plotRenderGeneration &&
          hasData.value &&
          graphDiv === plotInstanceRef.value
        ) {
          activeViewPreset.value = fullscreenPreset
        }
      } catch (error) {
        console.error('3D全屏切换失败:', error)
      }
    }

    onMounted(() => {
      bindResizeObserver()
      void ensurePlotly().catch(() => undefined)
    })

    watch([smooth, downsample, quality, color, showSlice, sliceIndex], () => {
      emitControlsChange()
      if (hasData.value) {
        cancelCameraAnimation(true)
        void renderPlot('react')
      }
    })

    watch(
      () => props.active,
      async (active) => {
        if (!active) {
          plotRenderGeneration += 1
          cancelCameraAnimation(true)
          return
        }

        await syncActivePlot()
      },
    )

    watch(
      () => props.dataset,
      async (nextDataset) => {
        if (!nextDataset || !hasDrawableSurfaceDataset(nextDataset)) {
          clearPlot()
          const resetDefaults = defaultSurfaceControls()
          sliceIndex.value = resetDefaults.sliceIndex
          previewSliceIndex.value = resetDefaults.sliceIndex
          return
        }

        resetSurfaceCameraToInitialView()
        pendingSurfaceReplacement = true
        const midpoint = Math.floor(nextDataset.x.length / 2)
        sliceIndex.value = midpoint
        previewSliceIndex.value = midpoint

        await nextTick()
        bindResizeObserver()
        await syncActivePlot(true)
      },
      { immediate: true },
    )

    onBeforeUnmount(() => {
      clearPlot()
    })

    const resetControls = () => {
      const resetDefaults: SurfaceControls = {
        ...defaultSurfaceControls(),
        ...props.initialControls,
      }

      smooth.value = resetDefaults.smooth
      downsample.value = resetDefaults.downsample
      quality.value = resetDefaults.quality
      color.value = resetDefaults.color
      showSlice.value = resetDefaults.showSlice
      sliceIndex.value = resetDefaults.sliceIndex
      previewSliceIndex.value = resetDefaults.sliceIndex
    }

    expose({ resetControls })

    const renderControlGroup = (label: string, control: VNode) => (
      <div class={styles.controlGroup}>
        <span class={styles.toolbarControlLabel}>{label}:</span>
        {control}
      </div>
    )

    return () => (
      <section
        ref={chartPanelRef}
        class={classNames(styles.chartPanel, isFullscreen.value && styles.chartPanelFullscreen)}
      >
        <div class={styles.chartToolbar} data-testid="three-d-chart-toolbar">
          <div class={styles.toolbarControls}>
            {renderControlGroup(
              '平滑窗口',
              <Select
                size="small"
                value={smooth.value}
                options={smoothOptions}
                class={styles.controlSelect}
                onChange={(value) => {
                  smooth.value = value as SurfaceSmoothWindow
                }}
              />,
            )}
            {renderControlGroup(
              '降采样',
              <Select
                size="small"
                value={downsample.value}
                options={downsampleOptions}
                class={styles.controlSelectWide}
                onChange={(value) => {
                  downsample.value = value as SurfaceDownsample
                }}
              />,
            )}
            {renderControlGroup(
              '渲染质量',
              <Select
                size="small"
                value={quality.value}
                options={qualityOptions}
                class={styles.controlSelect}
                onChange={(value) => {
                  quality.value = value as SurfaceRenderQuality
                }}
              />,
            )}
            {renderControlGroup(
              '配色',
              <Select
                size="small"
                value={color.value}
                options={colorOptions}
                class={styles.controlSelect}
                onChange={(value) => {
                  color.value = value as SurfaceColorScale
                }}
              />,
            )}
            <Checkbox
              checked={showSlice.value}
              class={styles.sliceToggle}
              onChange={(event) => {
                showSlice.value = event.target.checked
              }}
            >
              显示切片
            </Checkbox>
          </div>

          <div class={styles.viewPresetControl} data-testid="three-d-view-presets">
            <Segmented
              value={activeViewPreset.value}
              options={viewPresetOptions.value}
              onChange={(value) => {
                void handleViewPresetChange(value)
              }}
            />
          </div>

          <Tooltip title="下载当前图像">
            <span class={styles.toolbarButtonWrapper}>
              <Button
                size="small"
                type="default"
                class={styles.toolbarIconButton}
                data-testid="three-d-image-download"
                aria-label="下载当前图像"
                disabled={!canDownloadCurrentImage.value}
                loading={imageDownloadLoading.value}
                onClick={() => void handleDownloadCurrentImage()}
                icon={<DownloadOutlined />}
              />
            </span>
          </Tooltip>

          <Button
            size="small"
            type="default"
            class={styles.toolbarIconButton}
            data-testid="three-d-fullscreen-toggle"
            aria-label={isFullscreen.value ? '退出全屏' : '全屏'}
            onClick={() => void handleFullscreenToggle()}
            icon={isFullscreen.value ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          />
        </div>

        <div class={styles.chartCanvas}>
          {hasData.value ? (
            <div ref={plotHostRef} class={styles.plotHost} data-testid="three-d-plot-host" />
          ) : (
            <div class={styles.emptyState} data-testid="three-d-empty-state">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />
              <div class={styles.emptyDescription}>{props.emptyDescription}</div>
            </div>
          )}
        </div>

        {hasData.value && showSlice.value && surfaceTimeRange.value ? (
          <section class={styles.timeline} data-testid="three-d-slice-timeline">
            <div class={styles.timelineHeader}>
              <div>
                <span class={styles.controlLabel}>时间切片</span>
                <strong>{previewTimeText.value}</strong>
              </div>
              <span class={styles.timelineHint}>拖动实时显示时间，松开后更新3D图形</span>
            </div>
            <div class={styles.sliderRow}>
              <span>{formatSliceTime(surfaceTimeRange.value.start)}</span>
              <input
                type="range"
                min="0"
                max={surfaceTimeRange.value.pointCount - 1}
                value={previewSliceIndex.value}
                aria-label="时间切片"
                onInput={(event) => {
                  previewSliceIndex.value = Number((event.target as HTMLInputElement).value)
                }}
                onChange={(event) => {
                  const nextIndex = Number((event.target as HTMLInputElement).value)
                  previewSliceIndex.value = nextIndex
                  sliceIndex.value = nextIndex
                }}
              />
              <span>{formatSliceTime(surfaceTimeRange.value.end)}</span>
            </div>
          </section>
        ) : null}
      </section>
    )
  },
})
