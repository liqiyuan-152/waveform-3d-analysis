# waveform-3d-analysis

3D 波形分析组件库 —— 从 `frontend` 项目「波形分析 → 3D波形分析」标签页抽离的独立组件，
基于 [Plotly.js](https://plotly.com/javascript/) 渲染多通道波形的 3D 曲面（瀑布图）。
项目结构参考 [waveform-analysis](../waveform-analysis)：一个仓库同时包含**可发布的组件库**与**演示应用（demo）**。

## 功能特性

- **3D 曲面渲染**：多通道波形按「通道序号 / 空间位置」排布 Y 轴，时间为 X 轴，幅值为 Z 轴与色阶
- **渲染控制**：平滑窗口（关闭/3/5/9 点）、降采样（原始/每2/5/10点）、渲染质量（流畅/均衡/高清）、配色（Jet/Turbo/Hot/Viridis）
- **时间切片**：切片平面 + 剖面曲线，拖动滑块实时预览时间、松手更新 3D 图形
- **视角预设**：默认/侧/正/俯视图，四元数球面插值的平滑相机动画（尊重 `prefers-reduced-motion`）
- **交互**：轨道旋转、滚轮缩放、全屏（自动恢复相机）、PNG 图像下载
- **数据管道**：后端响应行 → 按坐标排序 → 多通道时间轴取并集 + 插值重采样（Worker / WASM / JS 三级降级）
- **渲染调度**：代际（generation）机制防止过期渲染与相机动画竞态；ResizeObserver 自适应；标签页失活自动暂停

## 安装

```bash
pnpm add waveform-3d-analysis
# 对等依赖（宿主需自行提供）
pnpm add vue@>=3.2.33 ant-design-vue@">=3.2.20 <4"
```

运行时依赖 `plotly.js-dist-min`、`@vueuse/core`、`@ant-design/icons-vue`、`classnames` 会随组件库一并安装。

## 快速上手

```ts
import { createApp } from 'vue'
import 'ant-design-vue/dist/antd.css'
import { ThreeDWaveformChart, buildThreeDSurfaceDataset } from 'waveform-3d-analysis'
import 'waveform-3d-analysis/style.css'
```

```vue
<template>
  <ThreeDWaveformChart
    :dataset="dataset"
    :active="activeTab === 'threeD'"
    empty-description="请先查询波形数据"
    @error="handleChartError"
    @controls-change="handleControlsChange"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  buildThreeDWaveformQueryPayload,
  buildThreeDSurfaceDataset,
  getThreeDSurfaceUnitIssue,
  hasDrawableSurfaceDataset,
} from 'waveform-3d-analysis'
import type { SurfaceDataset, ThreeDChannelRow, ThreeDResponseRow } from 'waveform-3d-analysis'

const dataset = ref<SurfaceDataset | null>(null)

// 1) 构建查询负载（可选工具函数，也可以直接调用宿主自己的接口封装）
const payload = buildThreeDWaveformQueryPayload({
  userName: '724396',
  dev: 4,
  selectedCannons: ['2024001'],
  selectedChannelItems: [{ channelName: 'CH01', channelId: 1, spatialCoordinate: '1.25' }],
  timeStart: 0,
  timeEnd: 100,
  pointCount: 800,
})

// 2) 用宿主的 HTTP 客户端请求接口，拿到 ThreeDResponseRow[]
//    const responseRows = await http.post('/api/...', payload)

// 3) 检查单位一致性并构建数据集
async function query(responseRows: ThreeDResponseRow[], channelRows: ThreeDChannelRow[]) {
  const unitIssue = getThreeDSurfaceUnitIssue(responseRows)
  if (unitIssue?.type === 'time-unit') {
    message.warning(`请选择同时间单位通道，当前包含：${unitIssue.units.join('、')}`)
    return
  }
  if (unitIssue?.type === 'value-unit') {
    message.warning('检测到不同幅值单位，幅值轴将不显示单位')
  }

  const nextDataset = await buildThreeDSurfaceDataset({
    responseRows,
    channelRows,
    coordinateMode: 'z', // 或 'spatial'
  })

  dataset.value = hasDrawableSurfaceDataset(nextDataset) ? nextDataset : null
}
</script>
```

## 组件 API

### Props

| 属性               | 类型                       | 默认值             | 说明                                                                           |
| ------------------ | -------------------------- | ------------------ | ------------------------------------------------------------------------------ |
| `dataset`          | `SurfaceDataset \| null`   | `null`             | 3D 曲面数据集；`null` 或不可绘制时显示空态。数据集引用变化即触发重绘与相机复位 |
| `active`           | `boolean`                  | `true`             | 宿主标签页激活状态；失活时暂停渲染并取消相机动画，激活后自动恢复               |
| `initialControls`  | `Partial<SurfaceControls>` | `{}`               | 初始渲染控制项（仅挂载时生效）                                                 |
| `emptyDescription` | `string`                   | `'暂无3D波形数据'` | 空态描述文案                                                                   |

### Events

| 事件              | 载荷                                                       | 说明                                                     |
| ----------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| `controls-change` | `SurfaceControls`                                          | 任一渲染控制项（含切片索引）变化时触发，可用于会话持久化 |
| `error`           | `{ kind: 'camera-switch' \| 'download'; message: string }` | 视角切换或图像下载失败时触发，由宿主决定提示方式         |

### 暴露方法（模板引用）

| 方法              | 说明                                                     |
| ----------------- | -------------------------------------------------------- |
| `resetControls()` | 将全部渲染控制项恢复为 `initialControls`（缺省为默认值） |

### 组件内部维护的状态

平滑窗口、降采样、渲染质量、配色、切片开关与切片索引均为组件内部状态，工具栏直接可操作；
宿主如需持久化，监听 `controls-change` 保存、下次挂载时通过 `initialControls` 恢复。

## 数据结构

```ts
/** 3D 曲面数据集 */
interface SurfaceDataset {
  x: number[] // 时间轴（并集）
  y: number[] // 通道坐标（按 z 或空间位置排序）
  z: Array<Array<number | null>> // 通道 × 时间 幅值矩阵
  channelLabels?: string[]
  channelColors?: string[]
  coordinateMode?: 'z' | 'spatial'
  timeUnit?: string // 缺省 'ms'
  valueUnit?: string // 幅值单位不一致时不设置
}

/** 后端响应行（一个炮号 × 一个通道），字段与宿主接口模型一致 */
interface ThreeDResponseRow {
  chnl: string
  chnl_id?: number
  dat_unit?: string | null
  data: number[]
  dev: number
  msg?: string | null
  no_data?: boolean
  shot: number
  time: number[]
  time_unit?: string | null
}

/** 3D 的一行通道数据（通道 + 炮号唯一定位一行曲面） */
interface ThreeDChannelRow {
  channelName: string
  channelId?: number
  unit: string
  color: string
  displayPosition: string
  spatialCoordinate?: string
  zCoordinate: string
  cannonNumber: string
  noData?: boolean
  noDataMessage?: string
}
```

## 数据管道与工具函数

| 导出                                                                                                | 说明                                                                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `buildThreeDSurfaceDataset({ responseRows, channelRows, coordinateMode })`                          | 核心：响应行 + 通道行 → `SurfaceDataset`（排序、时间轴并集、插值重采样）      |
| `getThreeDSurfaceUnitIssue(responseRows)`                                                           | 单位一致性检查：`time-unit`（不可绘制）/ `value-unit`（幅值轴无单位）/ `null` |
| `sortThreeDChannelRows(channelRows, mode)`                                                          | 按坐标模式排序通道行                                                          |
| `hasSameThreeDChannelRowIdentities(left, right)`                                                    | 两组通道行「通道×炮号」是否一致                                               |
| `buildThreeDWaveformQueryPayload({...})`                                                            | 构建后端查询请求负载（炮号 × 通道展开）                                       |
| `hasDrawableSurfaceDataset(dataset)`                                                                | 数据集是否可绘制（类型守卫）                                                  |
| `buildSurfaceView` / `defaultSurfaceControls` / `smoothSurfaceSeries` / `buildSurfaceSampleIndexes` | 视图构建（组件内部使用，导出供高级场景）                                      |
| `buildSurfaceScene` / `buildSurfacePlotConfig` / 相机系列函数                                       | Plotly 场景与相机（导出供高级场景）                                           |
| `buildUnionAndResampleRows` / `resampleRowsToUnionTimeValues` / ...                                 | 重采样底层 API                                                                |
| `setWasmResampleLoader(loader)`                                                                     | 注入可选的 WASM 重采样模块加载器（默认关闭，见下节）                          |

### 重采样运行时

多通道时间轴取并集后逐行插值，按以下顺序自动降级：

1. **WASM**（可选）：宿主通过 `setWasmResampleLoader(() => import('...hlscope_resample.js'))` 注入
2. **Worker**：内置 `resample.worker.ts`，后台线程计算（构建时自动打包）
3. **JS**：主线程同步计算兜底

> 注意：CJS 产物（`require('waveform-3d-analysis')`）中 Worker 因 `import.meta.url` 不可用而自动降级为 JS 路径；ESM 产物完整可用。

## 本地开发

```bash
pnpm install
pnpm dev            # 启动 demo（模拟数据宿主）
pnpm test           # 单元测试（vitest）
pnpm typecheck      # vue-tsc 类型检查
pnpm build          # 完整构建：typecheck + build:lib + build:types + build:demo
pnpm build:lib      # 仅构建组件库 → dist/（ESM/CJS + style.css）
pnpm build:types    # 仅生成类型声明 → dist/types/
pnpm build:demo     # 仅构建演示应用 → dist-demo/
pnpm lint           # ESLint
pnpm format         # Prettier 格式化
```

### 工程说明

- **TSX**：组件以 TSX 编写。类型检查使用 `jsx: "preserve"` + `vue/jsx` 全局命名空间（见 `src/env.d.ts`）；
  构建时由 Vite 8（rolldown）的 `oxc.jsx` 按 Vue 的 automatic JSX 运行时（`vue/jsx-runtime`）转换
- **目录结构**：`src/components`（库组件）、`src/core`（纯函数核心）、`src/types`（公共类型）、
  `src/data` + `src/demo` + `App.vue`（demo 专用，不进入库产物）、`src/index.ts`（库入口）
- **demo 即消费方**：demo 通过 `src/index.ts` 公共入口使用组件库，模拟数据走与生产一致的数据管道

## 从原 `ThreeDDisplay` 迁移的对应关系

| 原项目（frontend）                                                                                      | 本库                                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `views/hlscope/analysis/components/ThreeDDisplay/index.tsx`                                             | `ThreeDWaveformChart` 组件 + 宿主侧查询编排                                                                                     |
| `ThreeDDisplay/queryAdapter.ts`                                                                         | `core/queryAdapter.ts`（`AnalysisPreviewRow` → `ThreeDChannelRow`，`WaveformAnalysisSearchResponseItem` → `ThreeDResponseRow`） |
| `ThreeDDisplay/scene.ts` / `surfaceView.ts` / `resample.ts` / `resample.worker.ts`                      | `core/` 同名模块（WASM 路径改为 `setWasmResampleLoader` 注入）                                                                  |
| `ThreeDDisplay/components/Segmented`                                                                    | `components/Segmented.tsx`                                                                                                      |
| `plotlyRuntime.ts` + `plotlyLocales/zh-CN.ts`                                                           | `components/plotlyRuntime.ts` + `components/plotlyLocales/`                                                                     |
| API 调用（`analysisDataSearch`）、`useUserStore`、查询侧边栏（`AnalysisQuerySidebar`）、`SidebarLayout` | **保留在宿主**：宿主负责查询与布局，通过 `dataset` prop 注入数据                                                                |

宿主集成时：保留原页面中的查询侧边栏与接口调用，查询成功后调用 `buildThreeDSurfaceDataset`
构建数据集传给 `ThreeDWaveformChart`，原 `ThreeDDisplay` 中约 300 行的编排逻辑可全部移除。
