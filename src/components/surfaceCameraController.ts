import type { Layout as PlotlyLayout, PlotlyHTMLElement, PlotRelayoutEvent } from 'plotly.js'
import { ref, type Ref } from 'vue'

import {
  animateSurfaceCamera,
  cloneSurfaceCamera,
  getSurfaceCameraPreset,
  matchesSurfaceCameraPreset,
  readSurfaceCamera,
  surfaceCameraAnimationDuration,
  type SurfaceCamera,
  type SurfaceViewPreset,
} from '../core/camera'
import type { ThreeDWaveformChartErrorSink } from './chartTypes'
import type { PlotlyRuntime } from './plotlyRuntime'

const reducedMotionMediaQuery = '(prefers-reduced-motion: reduce)'

export type SurfaceCameraControllerHost = {
  hasData: () => boolean
  getGraphDiv: () => PlotlyHTMLElement | null
  ensurePlotly: () => Promise<PlotlyRuntime>
  cleanupPlotListeners: () => void
  onError: ThreeDWaveformChartErrorSink
}

export type SurfaceCameraController = {
  activeViewPreset: Ref<SurfaceViewPreset | ''>
  cancelCameraAnimation: (clearPreset?: boolean) => void
  resetToInitialView: () => void
  bindCameraListener: (graphDiv: PlotlyHTMLElement) => void
  handleViewPresetChange: (value: string) => Promise<void>
  applyCamera: (camera: SurfaceCamera) => Promise<void>
  getActiveCamera: () => SurfaceCamera
  logCameraPosition: (camera: unknown) => void
}

/**
 * 相机控制器：拥有视角预设与相机动画状态（代际校验、程序式更新计数、帧请求管理），
 * 通过 host 惰性访问图表实例，避免与渲染器循环依赖。
 */
export const createSurfaceCameraController = (
  host: SurfaceCameraControllerHost,
): SurfaceCameraController => {
  const activeViewPreset = ref<SurfaceViewPreset | ''>('default')
  let cameraAnimationGeneration = 0
  let cameraAnimationFrameId: number | null = null
  let cameraAnimationFrameResolve: ((timestamp: number) => void) | null = null
  let activeCameraAnimationGeneration: number | null = null
  let programmaticCameraUpdateCount = 0
  let currentSurfaceCamera = getSurfaceCameraPreset('default')

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

  const resetToInitialView = () => {
    currentSurfaceCamera = getSurfaceCameraPreset('default')
    activeViewPreset.value = 'default'
  }

  const applyCameraTo = async (
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

  const applyCamera = async (camera: SurfaceCamera) => {
    const graphDiv = host.getGraphDiv()
    if (!graphDiv) {
      return
    }

    await applyCameraTo(await host.ensurePlotly(), graphDiv, camera)
  }

  const logCameraPosition = (camera: unknown) => {
    if (camera) {
      console.info('[ThreeDWaveformChart] camera position:', camera)
    }
  }

  const bindCameraListener = (graphDiv: PlotlyHTMLElement) => {
    host.cleanupPlotListeners()

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
    const graphDiv = host.getGraphDiv()
    if (!host.hasData() || !graphDiv) {
      return
    }

    cancelCameraAnimation()
    const animationGeneration = cameraAnimationGeneration

    const Plotly = await host.ensurePlotly()
    if (
      animationGeneration !== cameraAnimationGeneration ||
      !host.hasData() ||
      graphDiv !== host.getGraphDiv()
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
        await applyCameraTo(Plotly, graphDiv, targetCamera)
      } else {
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const completed = await animateSurfaceCamera({
          from: previousCamera,
          to: targetCamera,
          duration: surfaceCameraAnimationDuration,
          startTime,
          requestFrame: requestCameraAnimationFrame,
          applyCamera: (camera) => applyCameraTo(Plotly, graphDiv, camera),
          isActive: () =>
            animationGeneration === cameraAnimationGeneration &&
            host.hasData() &&
            graphDiv === host.getGraphDiv(),
        })
        if (!completed) {
          return
        }
      }

      if (
        animationGeneration !== cameraAnimationGeneration ||
        !host.hasData() ||
        graphDiv !== host.getGraphDiv()
      ) {
        return
      }

      await Plotly.redraw(graphDiv)

      if (graphDiv === host.getGraphDiv()) {
        activeCameraAnimationGeneration = null
        activeViewPreset.value = preset
      }
    } catch (error) {
      if (animationGeneration !== cameraAnimationGeneration || graphDiv !== host.getGraphDiv()) {
        return
      }

      cancelCameraAnimation()
      const rollbackGeneration = cameraAnimationGeneration
      try {
        await applyCameraTo(Plotly, graphDiv, previousCamera)
        if (rollbackGeneration !== cameraAnimationGeneration || graphDiv !== host.getGraphDiv()) {
          return
        }
        await Plotly.redraw(graphDiv)
        if (rollbackGeneration === cameraAnimationGeneration && graphDiv === host.getGraphDiv()) {
          activeViewPreset.value = previousPreset
        }
      } catch (rollbackError) {
        if (rollbackGeneration !== cameraAnimationGeneration || graphDiv !== host.getGraphDiv()) {
          return
        }

        activeViewPreset.value = ''
        console.error('3D视角恢复失败:', rollbackError)
      }

      host.onError('camera-switch', '3D视角切换失败，请重试', error)
    }
  }

  return {
    activeViewPreset,
    cancelCameraAnimation,
    resetToInitialView,
    bindCameraListener,
    handleViewPresetChange,
    applyCamera,
    getActiveCamera: () => cloneSurfaceCamera(currentSurfaceCamera),
    logCameraPosition,
  }
}
