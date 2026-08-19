# AGENTS.md

3D 波形分析组件库（waveform-3d-analysis）。从 `frontend` 项目 `views/hlscope/analysis/components/ThreeDDisplay` 抽离，
参考 `waveform-analysis` 的「库 + demo」架构。

## 行为契约

- `src/index.ts` 是库的唯一公共入口：新增导出一律从这里出，并保持向后兼容。
- demo（`App.vue`、`src/demo/`、`src/data/`）只能通过 `src/index.ts` 消费组件库，不得反向引用库内部模块。
- 库不依赖任何后端：数据一律经 `dataset` prop 注入；查询、消息提示、布局归属宿主。
- 数据不可变：更新数据集必须替换 `dataset` 引用，禁止原地修改数组。
- 纯函数放 `src/core/`（场景、视图、重采样、数据管道），组件只做编排与渲染。
- 渲染与相机动画必须经过代际（generation）校验，过期结果一律丢弃。

## 常用命令

```bash
pnpm dev            # demo 开发服务器
pnpm test           # vitest 单测（测试与源码同目录 *.test.ts）
pnpm typecheck      # vue-tsc
pnpm build          # typecheck + build:lib + build:types + build:demo
pnpm lint           # eslint
pnpm format         # prettier
```

## 工程约定

- `src/` 下所有源文件不超过 400 行（`pnpm lint` 的 `max-lines` 与 `pnpm check:file-length` 双重把关）；超出时按职责拆分模块，而不是调高限制。
- 组件为 TSX：类型检查依赖 `src/env.d.ts` 中的 `vue/jsx` 全局命名空间引用；
  构建转换由 `vite.config.ts` / `vite.lib.config.ts` 的 `oxc.jsx`（automatic + `vue`）完成，两处需同步修改。
- 大组件按「编排壳 + 控制器/渲染器工厂 + 展示子组件」拆分（参考 `ThreeDWaveformChart` 的拆分方式）；
  控制器与渲染器之间通过 host 回调/绑定对象惰性解耦，禁止循环依赖。
- 样式使用 CSS Modules（`*.module.less`），新增类名须与组件内 `styles` 引用一致。
- `plotly.js-dist-min`、`vue`、`ant-design-vue`、`@ant-design/icons-vue`、`@vueuse/core` 在库构建中外部化。
- 版本发布：打 tag 触发（参考 waveform-analysis 的发布流程），tag 与 package.json 版本一致。
- 提交信息遵循 Conventional Commits。
