import type { PlotlyHTMLElement } from 'plotly.js'
import { nextTick, ref, shallowRef } from 'vue'

import { buildSurfacePlotConfig, buildSurfaceScene } from '../core/scene'
import type { SurfaceColorScale, SurfaceRenderQuality, SurfaceView } from '../core/surfaceView'
import { isDisplayedPlotHost, waitForLayoutFrame } from './chartOptions'
import { loadPlotly, type PlotlyRuntime } from './plotlyRuntime'

export type SurfacePlotRendererHost = {
  isActive: () => boolean
  hasData: () => boolean
  getView: () => SurfaceView | null
  getColor: () => SurfaceColorScale
  getShowSlice: () => boolean
  getQuality: () => SurfaceRenderQuality
  /** 新图建立后的回调（相机复位 + 事件绑定 + 相机日志） */
  attachGraphDiv: (graphDiv: PlotlyHTMLElement, sceneCamera: unknown) => void
}

/**
 * 渲染器：拥有 Plotly 实例、渲染队列与 ResizeObserver。
 * 通过代际（generation）校验丢弃过期渲染；相机相关动作由 attachGraphDiv 回调交给相机控制器。
 */
export const createSurfacePlotRenderer = (host: SurfacePlotRendererHost) => {
  const plotHostRef = ref<HTMLDivElement | null>(null)
  const plotInstanceRef = shallowRef<PlotlyHTMLElement | null>(null)
  const resizeObserverRef = shallowRef<ResizeObserver | null>(null)
  let plotlyModule: PlotlyRuntime | null = null
  let plotRenderGeneration = 0
  let plotRenderQueue = Promise.resolve()
  let pendingSurfaceReplacement = false

  const ensurePlotly = async () => {
    if (!plotlyModule) {
      plotlyModule = await loadPlotly()
    }

    return plotlyModule
  }

  const disconnectResizeObserver = () => {
    resizeObserverRef.value?.disconnect()
    resizeObserverRef.value = null
  }

  const cleanupPlotListeners = () => {
    plotInstanceRef.value?.removeAllListeners?.('plotly_relayout')
    plotInstanceRef.value?.removeAllListeners?.('plotly_relayouting')
  }

  const bindResizeObserver = () => {
    const hostElement = plotHostRef.value

    if (typeof ResizeObserver !== 'function' || !hostElement) {
      return
    }

    disconnectResizeObserver()
    resizeObserverRef.value = new ResizeObserver(() => {
      const Plotly = plotlyModule
      const graphDiv = plotInstanceRef.value ?? plotHostRef.value

      if (Plotly && graphDiv && isDisplayedPlotHost(hostElement)) {
        Plotly.Plots.resize(graphDiv)
      }
    })
    resizeObserverRef.value.observe(hostElement)
  }

  /** 图表清理（不含相机状态；相机由组件组合控制器完成） */
  const teardown = () => {
    plotRenderGeneration += 1
    pendingSurfaceReplacement = false
    const Plotly = plotlyModule

    disconnectResizeObserver()
    cleanupPlotListeners()

    const graphDiv = plotInstanceRef.value ?? plotHostRef.value
    if (Plotly && graphDiv) {
      Plotly.purge(graphDiv)
    }

    plotInstanceRef.value = null
  }

  /** 使所有进行中的渲染失效（标签页失活等场景） */
  const invalidateRender = () => {
    plotRenderGeneration += 1
  }

  const markSurfaceReplacement = () => {
    pendingSurfaceReplacement = true
  }

  const renderVersion = () => plotRenderGeneration

  const isRenderVersionCurrent = (version: number) => version === plotRenderGeneration

  const canRenderPlot = (hostElement: HTMLDivElement) =>
    host.isActive() &&
    host.hasData() &&
    Boolean(host.getView()) &&
    hostElement === plotHostRef.value &&
    isDisplayedPlotHost(hostElement)

  const renderPlot = (mode: 'new' | 'react') => {
    const hostElement = plotHostRef.value

    if (!hostElement || !canRenderPlot(hostElement)) {
      return Promise.resolve()
    }

    const renderGeneration = plotRenderGeneration + 1
    plotRenderGeneration = renderGeneration
    plotRenderQueue = plotRenderQueue
      .catch(() => undefined)
      .then(async () => {
        if (renderGeneration !== plotRenderGeneration || !canRenderPlot(hostElement)) {
          return
        }

        const view = host.getView()
        if (!view) {
          return
        }

        if (renderGeneration !== plotRenderGeneration || !canRenderPlot(hostElement)) {
          return
        }

        const Plotly = await ensurePlotly()
        if (renderGeneration !== plotRenderGeneration || !canRenderPlot(hostElement)) {
          return
        }

        const latestView = host.getView()
        if (!latestView) {
          return
        }

        const scene = buildSurfaceScene({
          view: latestView,
          color: host.getColor(),
          showSlice: host.getShowSlice(),
        })
        const config = buildSurfacePlotConfig(host.getQuality())

        if (mode === 'new' || !plotInstanceRef.value) {
          const nextPlot = await Plotly.newPlot(hostElement, scene.data, scene.layout, config)

          if (renderGeneration !== plotRenderGeneration || !canRenderPlot(hostElement)) {
            Plotly.purge((nextPlot ?? hostElement) as unknown as PlotlyHTMLElement)
            return
          }

          const graphDiv = (nextPlot ?? hostElement) as unknown as PlotlyHTMLElement
          plotInstanceRef.value = graphDiv
          host.attachGraphDiv(graphDiv, scene.layout.scene?.camera)
          return
        }

        await Plotly.react(hostElement, scene.data, scene.layout, config)
        if (renderGeneration !== plotRenderGeneration || !canRenderPlot(hostElement)) {
          Plotly.purge(hostElement)
          plotInstanceRef.value = null
        }
      })

    return plotRenderQueue
  }

  const resizeActivePlot = () => {
    const Plotly = plotlyModule
    const graphDiv = plotInstanceRef.value
    const hostElement = plotHostRef.value
    if (Plotly && graphDiv && hostElement && canRenderPlot(hostElement)) {
      Plotly.Plots.resize(graphDiv)
    }
  }

  const syncActivePlot = async (forceReact = false) => {
    await nextTick()
    await waitForLayoutFrame()

    const hostElement = plotHostRef.value
    if (!hostElement || !canRenderPlot(hostElement)) {
      return
    }

    if (forceReact || pendingSurfaceReplacement) {
      await renderPlot('react')
      if (plotInstanceRef.value && canRenderPlot(hostElement)) {
        pendingSurfaceReplacement = false
      }
    } else if (!plotInstanceRef.value) {
      await renderPlot('new')
    }

    resizeActivePlot()
  }

  return {
    plotHostRef,
    plotInstanceRef,
    ensurePlotly,
    bindResizeObserver,
    disconnectResizeObserver,
    cleanupPlotListeners,
    teardown,
    invalidateRender,
    markSurfaceReplacement,
    renderVersion,
    isRenderVersionCurrent,
    renderPlot,
    syncActivePlot,
    resizeActivePlot,
  }
}

export type SurfacePlotRenderer = ReturnType<typeof createSurfacePlotRenderer>
