import { defineComponent, type PropType } from 'vue'

import { formatSliceTime } from './chartOptions'
import styles from './ThreeDWaveformChart.module.less'

export type SurfaceTimeRange = {
  start: number
  end: number
  pointCount: number
}

/** 时间切片轴（展示组件）：拖动实时预览时间，松手更新 3D 图形 */
export default defineComponent({
  name: 'ThreeDWaveformChartTimeline',
  props: {
    timeRange: {
      type: Object as PropType<SurfaceTimeRange>,
      required: true,
    },
    previewIndex: {
      type: Number,
      required: true,
    },
    previewTimeText: {
      type: String,
      required: true,
    },
  },
  emits: {
    'preview-index': (index: number) => Number.isFinite(index),
    'commit-index': (index: number) => Number.isFinite(index),
  },
  setup(props, { emit }) {
    return () => (
      <section class={styles.timeline} data-testid="three-d-slice-timeline">
        <div class={styles.timelineHeader}>
          <div>
            <span class={styles.controlLabel}>时间切片</span>
            <strong>{props.previewTimeText}</strong>
          </div>
          <span class={styles.timelineHint}>拖动实时显示时间，松开后更新3D图形</span>
        </div>
        <div class={styles.sliderRow}>
          <span>{formatSliceTime(props.timeRange.start)}</span>
          <input
            type="range"
            min="0"
            max={props.timeRange.pointCount - 1}
            value={props.previewIndex}
            aria-label="时间切片"
            onInput={(event) =>
              emit('preview-index', Number((event.target as HTMLInputElement).value))
            }
            onChange={(event) =>
              emit('commit-index', Number((event.target as HTMLInputElement).value))
            }
          />
          <span>{formatSliceTime(props.timeRange.end)}</span>
        </div>
      </section>
    )
  },
})
