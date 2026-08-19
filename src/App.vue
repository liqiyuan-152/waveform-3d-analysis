<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'

import { ThreeDWaveformChart } from './index'
import type { SurfaceControls, SurfaceDataset, ThreeDWaveformChartError } from './index'
import {
  buildSimulatedSurfaceDataset,
  defaultSimulatedThreeDWaveformOptions,
  type SimulatedThreeDWaveformOptions,
} from './data/simulatedThreeDWaveforms'
import DemoControlPanel from './demo/DemoControlPanel.vue'

const dataset = ref<SurfaceDataset | null>(null)
const queryLoading = ref(false)
const datasetSummary = ref('')
const lastControls = ref<SurfaceControls | null>(null)

const handleQuery = async (options: SimulatedThreeDWaveformOptions) => {
  queryLoading.value = true
  try {
    // 模拟网络延迟；生产环境中这里应调用真实接口获取 ThreeDResponseRow[]
    await new Promise((resolve) => setTimeout(resolve, 240))
    const result = await buildSimulatedSurfaceDataset(options)
    dataset.value = result.dataset
    datasetSummary.value = `${result.dataset.y.length} 行 × ${result.dataset.x.length} 点`
  } catch (error) {
    console.error('模拟查询失败:', error)
    message.error('模拟查询失败，请重试')
  } finally {
    queryLoading.value = false
  }
}

const handleChartError = (error: ThreeDWaveformChartError) => {
  message.error(error.message)
}

const handleControlsChange = (controls: SurfaceControls) => {
  lastControls.value = controls
}

handleQuery(defaultSimulatedThreeDWaveformOptions())
</script>

<template>
  <div class="demo-shell">
    <header class="demo-header">
      <h1>3D 波形分析</h1>
      <p>
        基于 Plotly.js 的多通道波形 3D 曲面组件：平滑窗口 / 降采样 / 渲染质量 / 配色 / 时间切片 /
        视角预设 / 全屏与图像下载
      </p>
    </header>

    <main class="demo-workspace">
      <aside class="demo-sidebar">
        <DemoControlPanel :loading="queryLoading" @query="handleQuery" />
        <section v-if="datasetSummary" class="demo-panel demo-summary">
          <h2 class="demo-panel-title">当前数据集</h2>
          <p>{{ datasetSummary }}</p>
          <p v-if="lastControls">
            平滑 {{ lastControls.smooth }} · 降采样 {{ lastControls.downsample }} ·
            {{ lastControls.showSlice ? `切片 #${lastControls.sliceIndex}` : '切片关闭' }}
          </p>
        </section>
      </aside>

      <section class="demo-chart-area">
        <ThreeDWaveformChart
          :dataset="dataset"
          :active="true"
          empty-description="请先生成波形数据"
          @error="handleChartError"
          @controls-change="handleControlsChange"
        />
      </section>
    </main>
  </div>
</template>
