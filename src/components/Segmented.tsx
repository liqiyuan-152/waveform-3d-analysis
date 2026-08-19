import classNames from 'classnames'
import { defineComponent, type PropType } from 'vue'

import styles from './Segmented.module.less'

export interface ThreeDSegmentedOption {
  disabled?: boolean
  label: string
  value: string
}

export default defineComponent({
  name: 'ThreeDSegmented',
  props: {
    options: {
      type: Array as PropType<ThreeDSegmentedOption[]>,
      default: () => [],
    },
    value: {
      type: String,
      default: '',
    },
  },
  emits: ['update:value', 'change'],
  setup(props, { emit }) {
    const handleSelect = (nextValue: string, disabled?: boolean) => {
      if (disabled || nextValue === props.value) {
        return
      }

      emit('update:value', nextValue)
      emit('change', nextValue)
    }

    return () => (
      <div class={styles.segmented} role="tablist" aria-label="3D视角切换">
        {props.options.map((option) => {
          const active = option.value === props.value

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-disabled={option.disabled ? 'true' : 'false'}
              disabled={option.disabled}
              class={classNames(styles.option, active && styles.optionActive)}
              onClick={() => handleSelect(option.value, option.disabled)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  },
})
