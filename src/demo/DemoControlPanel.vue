<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Button, Checkbox, InputNumber, Radio, RadioGroup } from 'ant-design-vue'

import type { ThreeDCoordinateMode } from '../types'
import {
  defaultSimulatedThreeDWaveformOptions,
  type SimulatedThreeDWaveformOptions,
} from '../data/simulatedThreeDWaveforms'

const emit = defineEmits<{
  (event: 'query', options: SimulatedThreeDWaveformOptions): void
}>()

const props = defineProps<{
  loading: boolean
}>()

const defaults = defaultSimulatedThreeDWaveformOptions()

const formState = reactive({
  channelCount: defaults.channelCount,
  pointCount: defaults.pointCount,
  shotCount: defaults.shots.length,
  coordinateMode: defaults.coordinateMode as ThreeDCoordinateMode,
  mixedTimeBases: defaults.mixedTimeBases,
})

const options = computed<SimulatedThreeDWaveformOptions>(() => ({
  channelCount: formState.channelCount,
  pointCount: formState.pointCount,
  shots: Array.from(
    { length: formState.shotCount },
    (_, index) => `2024${String(30 + index).padStart(3, '0')}`,
  ),
  coordinateMode: formState.coordinateMode,
  mixedTimeBases: formState.mixedTimeBases,
  seed: defaults.seed,
}))

const handleQuery = () => {
  emit('query', options.value)
}
</script>

<template>
  <section class="demo-panel">
    <h2 class="demo-panel-title">模拟查询条件</h2>

    <label class="demo-field">
      <span>通道数量</span>
      <InputNumber v-model:value="formState.channelCount" :min="1" :max="12" />
    </label>

    <label class="demo-field">
      <span>每通道点数</span>
      <InputNumber v-model:value="formState.pointCount" :min="50" :max="4000" :step="50" />
    </label>

    <label class="demo-field">
      <span>炮号数量</span>
      <InputNumber v-model:value="formState.shotCount" :min="1" :max="3" />
    </label>

    <label class="demo-field">
      <span>坐标模式</span>
      <RadioGroup v-model:value="formState.coordinateMode" size="small">
        <Radio value="z">通道序号</Radio>
        <Radio value="spatial">空间位置</Radio>
      </RadioGroup>
    </label>

    <label class="demo-field demo-field-inline">
      <Checkbox v-model:checked="formState.mixedTimeBases" />
      <span>混合时间基（触发并集重采样）</span>
    </label>

    <Button type="primary" block :loading="props.loading" @click="handleQuery"> 生成并查询 </Button>

    <p class="demo-panel-hint">
      demo 使用种子随机数模拟后端响应行（ThreeDResponseRow），并通过 buildThreeDSurfaceDataset
      走真实数据管道构建曲面数据集。生产环境请替换为真实接口调用。
    </p>
  </section>
</template>
