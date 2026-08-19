import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SurfaceDataset } from '../core/scene'
import ThreeDWaveformChart from './ThreeDWaveformChart'

const newPlotMock = vi.fn(async (host: HTMLElement) => host)
const reactMock = vi.fn(async () => undefined)
const relayoutMock = vi.fn(async () => undefined)
const purgeMock = vi.fn(() => undefined)
const resizeMock = vi.fn(() => undefined)

vi.mock('./plotlyRuntime', () => ({
  loadPlotly: async () => ({
    newPlot: newPlotMock,
    react: reactMock,
    relayout: relayoutMock,
    purge: purgeMock,
    redraw: async () => undefined,
    downloadImage: async () => undefined,
    register: () => undefined,
    Plots: { resize: resizeMock },
  }),
}))

// 渲染链中包含 rAF（waitForLayoutFrame）与多级微任务，需要真实定时器推进
const flushAsync = async (times = 6) => {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const buildDataset = (): SurfaceDataset => ({
  x: [0, 1, 2, 3, 4],
  y: [1, 2],
  z: [
    [0, 1, 2, 3, 4],
    [4, 3, 2, 1, 0],
  ],
  channelLabels: ['CH01', 'CH02'],
  timeUnit: 'ms',
  valueUnit: 'V',
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
})

const mountChart = async () => {
  const wrapper = mount(ThreeDWaveformChart, {
    props: { dataset: buildDataset(), active: true },
    attachTo: document.body,
  })
  await flushAsync()

  return wrapper
}

describe('ThreeDWaveformChart 编排', () => {
  it('空数据集显示空态且不触发 Plotly', async () => {
    const wrapper = mount(ThreeDWaveformChart, {
      props: { dataset: null, active: true },
    })
    await flushAsync()

    expect(wrapper.find('[data-testid="three-d-empty-state"]').exists()).toBe(true)
    expect(newPlotMock).not.toHaveBeenCalled()
  })

  it('有数据集时创建 Plotly 实例并选中默认视图', async () => {
    const wrapper = await mountChart()

    expect(wrapper.find('[data-testid="three-d-plot-host"]').exists()).toBe(true)
    expect(newPlotMock).toHaveBeenCalledTimes(1)
    const selectedTab = wrapper.find('[aria-selected="true"]')
    expect(selectedTab.exists()).toBe(true)
    expect(selectedTab.text()).toBe('默认视图')
  })

  it('数据集引用变化时用 react 重绘并复位切片到中点', async () => {
    const wrapper = await mountChart()
    reactMock.mockClear()

    await wrapper.setProps({ dataset: { ...buildDataset(), y: [1, 2, 3] } })
    await flushAsync()

    expect(reactMock).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="three-d-plot-host"]').exists()).toBe(true)
  })

  it('切回空数据集时清空 Plotly 实例并回到空态', async () => {
    const wrapper = await mountChart()

    await wrapper.setProps({ dataset: null })
    await flushAsync()

    expect(purgeMock).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="three-d-empty-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="three-d-plot-host"]').exists()).toBe(false)
  })

  it('切换视角预设会通过 relayout 应用相机', async () => {
    const wrapper = await mountChart()
    relayoutMock.mockClear()

    await wrapper.find('[role="tablist"] button:nth-child(2)').trigger('click')
    await flushAsync()

    expect(relayoutMock).toHaveBeenCalled()
    const selectedTab = wrapper.find('[aria-selected="true"]')
    expect(selectedTab.text()).toBe('侧视图')
  })
})
