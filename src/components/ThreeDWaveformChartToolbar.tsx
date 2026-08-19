import { DownloadOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons-vue'
import { Button, Checkbox, Select, Tooltip } from 'ant-design-vue'
import { computed, defineComponent, type PropType, type VNode } from 'vue'

import {
  colorOptions,
  downsampleOptions,
  qualityOptions,
  smoothOptions,
  viewPresetOptionDefs,
} from './chartOptions'
import type {
  SurfaceColorScale,
  SurfaceControls,
  SurfaceDownsample,
  SurfaceRenderQuality,
  SurfaceSmoothWindow,
} from '../core/surfaceView'
import Segmented from './Segmented'
import styles from './ThreeDWaveformChart.module.less'

/** 图表工具栏（展示组件）：渲染控制项 + 视角预设 + 下载/全屏 */
export default defineComponent({
  name: 'ThreeDWaveformChartToolbar',
  props: {
    controls: {
      type: Object as PropType<
        Pick<SurfaceControls, 'smooth' | 'downsample' | 'quality' | 'color' | 'showSlice'>
      >,
      required: true,
    },
    activeViewPreset: {
      type: String,
      default: '',
    },
    hasData: {
      type: Boolean,
      default: false,
    },
    canDownload: {
      type: Boolean,
      default: false,
    },
    downloadLoading: {
      type: Boolean,
      default: false,
    },
    isFullscreen: {
      type: Boolean,
      default: false,
    },
  },
  emits: {
    'change-controls': (patch: Partial<SurfaceControls>) => !!patch,
    'change-view-preset': (value: string) => !!value,
    'download-image': () => true,
    'toggle-fullscreen': () => true,
  },
  setup(props, { emit }) {
    const viewPresetOptions = computed(() =>
      viewPresetOptionDefs.map((option) => ({ ...option, disabled: !props.hasData })),
    )

    const renderControlGroup = (label: string, control: VNode) => (
      <div class={styles.controlGroup}>
        <span class={styles.toolbarControlLabel}>{label}:</span>
        {control}
      </div>
    )

    return () => (
      <div class={styles.chartToolbar} data-testid="three-d-chart-toolbar">
        <div class={styles.toolbarControls}>
          {renderControlGroup(
            '平滑窗口',
            <Select
              size="small"
              value={props.controls.smooth}
              options={smoothOptions}
              class={styles.controlSelect}
              onChange={(value) =>
                emit('change-controls', { smooth: value as SurfaceSmoothWindow })
              }
            />,
          )}
          {renderControlGroup(
            '降采样',
            <Select
              size="small"
              value={props.controls.downsample}
              options={downsampleOptions}
              class={styles.controlSelectWide}
              onChange={(value) =>
                emit('change-controls', { downsample: value as SurfaceDownsample })
              }
            />,
          )}
          {renderControlGroup(
            '渲染质量',
            <Select
              size="small"
              value={props.controls.quality}
              options={qualityOptions}
              class={styles.controlSelect}
              onChange={(value) =>
                emit('change-controls', { quality: value as SurfaceRenderQuality })
              }
            />,
          )}
          {renderControlGroup(
            '配色',
            <Select
              size="small"
              value={props.controls.color}
              options={colorOptions}
              class={styles.controlSelect}
              onChange={(value) => emit('change-controls', { color: value as SurfaceColorScale })}
            />,
          )}
          <Checkbox
            checked={props.controls.showSlice}
            class={styles.sliceToggle}
            onChange={(event) => emit('change-controls', { showSlice: event.target.checked })}
          >
            显示切片
          </Checkbox>
        </div>

        <div class={styles.viewPresetControl} data-testid="three-d-view-presets">
          <Segmented
            value={props.activeViewPreset}
            options={viewPresetOptions.value}
            onChange={(value) => emit('change-view-preset', value)}
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
              disabled={!props.canDownload}
              loading={props.downloadLoading}
              onClick={() => emit('download-image')}
              icon={<DownloadOutlined />}
            />
          </span>
        </Tooltip>

        <Button
          size="small"
          type="default"
          class={styles.toolbarIconButton}
          data-testid="three-d-fullscreen-toggle"
          aria-label={props.isFullscreen ? '退出全屏' : '全屏'}
          onClick={() => emit('toggle-fullscreen')}
          icon={props.isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
        />
      </div>
    )
  },
})
