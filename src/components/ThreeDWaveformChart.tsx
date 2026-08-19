import classNames from 'classnames'
import { useFullscreen } from '@vueuse/core'
import { Empty } from 'ant-design-vue'
import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  type PropType,
  ref,
  watch,
} from 'vue'

import type { SurfaceDataset } from '../core/scene'
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
import { formatSliceTime, waitForLayoutFrame } from './chartOptions'
import type { ThreeDWaveformChartError } from './chartTypes'
import { createSurfaceCameraController } from './surfaceCameraController'
import { createSurfacePlotRenderer, type SurfacePlotRenderer } from './surfacePlotRenderer'
import ThreeDWaveformChartTimeline from './ThreeDWaveformChartTimeline'
import ThreeDWaveformChartToolbar from './ThreeDWaveformChartToolbar'
import styles from './ThreeDWaveformChart.module.less'

export type { ThreeDWaveformChartError, ThreeDWaveformChartErrorKind } from './chartTypes'

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
    const chartPanelRef = ref<HTMLElement | null>(null)
    const { toggle, isFullscreen } = useFullscreen(chartPanelRef)

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

    // 相机控制器先创建，通过绑定对象惰性访问后创建的渲染器（避免循环依赖）
    const rendererBinding: { renderer?: SurfacePlotRenderer } = {}
    const requireRenderer = () => {
      const current = rendererBinding.renderer
      if (!current) {
        throw new Error('SurfacePlotRenderer is not initialized yet')
      }

      return current
    }
    const camera = createSurfaceCameraController({
      hasData: () => hasData.value,
      getGraphDiv: () => rendererBinding.renderer?.plotInstanceRef.value ?? null,
      ensurePlotly: () => requireRenderer().ensurePlotly(),
      cleanupPlotListeners: () => rendererBinding.renderer?.cleanupPlotListeners(),
      onError: (kind, message, error) => {
        console.error(message, error)
        emit('error', { kind, message })
      },
    })

    const renderer = createSurfacePlotRenderer({
      isActive: () => props.active,
      hasData: () => hasData.value,
      getView: () => activeSurfaceView.value,
      getColor: () => color.value,
      getShowSlice: () => showSlice.value,
      getQuality: () => quality.value,
      attachGraphDiv: (graphDiv, sceneCamera) => {
        camera.resetToInitialView()
        camera.bindCameraListener(graphDiv)
        camera.logCameraPosition(sceneCamera)
      },
    })
    rendererBinding.renderer = renderer

    const canDownloadCurrentImage = computed(
      () => hasData.value && Boolean(renderer.plotInstanceRef.value) && !imageDownloadLoading.value,
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
    const toolbarControls = computed(() => ({
      smooth: smooth.value,
      downsample: downsample.value,
      quality: quality.value,
      color: color.value,
      showSlice: showSlice.value,
    }))

    const clearPlot = () => {
      camera.cancelCameraAnimation()
      renderer.teardown()
      camera.resetToInitialView()
    }

    const handleControlsPatch = (patch: Partial<SurfaceControls>) => {
      if (patch.smooth !== undefined) smooth.value = patch.smooth
      if (patch.downsample !== undefined) downsample.value = patch.downsample
      if (patch.quality !== undefined) quality.value = patch.quality
      if (patch.color !== undefined) color.value = patch.color
      if (patch.showSlice !== undefined) showSlice.value = patch.showSlice
      if (patch.sliceIndex !== undefined) sliceIndex.value = patch.sliceIndex
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

    const handleDownloadCurrentImage = async () => {
      if (!canDownloadCurrentImage.value) {
        return
      }

      imageDownloadLoading.value = true

      try {
        await nextTick()

        const graphDiv = renderer.plotInstanceRef.value
        if (!hasData.value || !graphDiv) {
          return
        }

        const Plotly = await renderer.ensurePlotly()
        if (!hasData.value || graphDiv !== renderer.plotInstanceRef.value) {
          return
        }

        await Plotly.downloadImage(graphDiv, {
          format: 'png',
          filename: '3d-waveform',
          width: graphDiv.clientWidth,
          height: graphDiv.clientHeight,
        })
      } catch (error) {
        console.error('3D图像下载失败，请重试', error)
        emit('error', { kind: 'download', message: '3D图像下载失败，请重试' })
      } finally {
        imageDownloadLoading.value = false
      }
    }

    const handleFullscreenToggle = async () => {
      const graphDiv = renderer.plotInstanceRef.value
      if (!hasData.value || !graphDiv) {
        await toggle()
        return
      }

      const fullscreenCamera = camera.getActiveCamera()
      const fullscreenPreset = camera.activeViewPreset.value
      const renderGeneration = renderer.renderVersion()

      try {
        await toggle()
        await nextTick()
        await waitForLayoutFrame()

        if (
          !renderer.isRenderVersionCurrent(renderGeneration) ||
          !hasData.value ||
          graphDiv !== renderer.plotInstanceRef.value
        ) {
          return
        }

        const Plotly = await renderer.ensurePlotly()
        if (
          !renderer.isRenderVersionCurrent(renderGeneration) ||
          !hasData.value ||
          graphDiv !== renderer.plotInstanceRef.value
        ) {
          return
        }

        Plotly.Plots.resize(graphDiv)
        await camera.applyCamera(fullscreenCamera)

        if (
          renderer.isRenderVersionCurrent(renderGeneration) &&
          hasData.value &&
          graphDiv === renderer.plotInstanceRef.value
        ) {
          camera.activeViewPreset.value = fullscreenPreset
        }
      } catch (error) {
        console.error('3D全屏切换失败:', error)
      }
    }

    onMounted(() => {
      renderer.bindResizeObserver()
      void renderer.ensurePlotly().catch(() => undefined)
    })

    watch([smooth, downsample, quality, color, showSlice, sliceIndex], () => {
      emitControlsChange()
      if (hasData.value) {
        camera.cancelCameraAnimation(true)
        void renderer.renderPlot('react')
      }
    })

    watch(
      () => props.active,
      async (active) => {
        if (!active) {
          renderer.invalidateRender()
          camera.cancelCameraAnimation(true)
          return
        }

        await renderer.syncActivePlot()
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

        camera.resetToInitialView()
        renderer.markSurfaceReplacement()
        const midpoint = Math.floor(nextDataset.x.length / 2)
        sliceIndex.value = midpoint
        previewSliceIndex.value = midpoint

        await nextTick()
        renderer.bindResizeObserver()
        await renderer.syncActivePlot(true)
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

    return () => (
      <section
        ref={chartPanelRef}
        class={classNames(styles.chartPanel, isFullscreen.value && styles.chartPanelFullscreen)}
      >
        <ThreeDWaveformChartToolbar
          controls={toolbarControls.value}
          activeViewPreset={camera.activeViewPreset.value ?? ''}
          hasData={hasData.value}
          canDownload={canDownloadCurrentImage.value}
          downloadLoading={imageDownloadLoading.value}
          isFullscreen={isFullscreen.value}
          onChange-controls={handleControlsPatch}
          onChange-view-preset={(value) => void camera.handleViewPresetChange(value)}
          onDownload-image={() => void handleDownloadCurrentImage()}
          onToggle-fullscreen={() => void handleFullscreenToggle()}
        />

        <div class={styles.chartCanvas}>
          {hasData.value ? (
            <div
              ref={renderer.plotHostRef}
              class={styles.plotHost}
              data-testid="three-d-plot-host"
            />
          ) : (
            <div class={styles.emptyState} data-testid="three-d-empty-state">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />
              <div class={styles.emptyDescription}>{props.emptyDescription}</div>
            </div>
          )}
        </div>

        {hasData.value && showSlice.value && surfaceTimeRange.value ? (
          <ThreeDWaveformChartTimeline
            timeRange={surfaceTimeRange.value}
            previewIndex={previewSliceIndex.value}
            previewTimeText={previewTimeText.value}
            onPreview-index={(index) => {
              previewSliceIndex.value = index
            }}
            onCommit-index={(index) => {
              previewSliceIndex.value = index
              sliceIndex.value = index
            }}
          />
        ) : null}
      </section>
    )
  },
})
