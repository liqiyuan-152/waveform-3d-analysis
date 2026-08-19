import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import Segmented from './Segmented'

const options = [
  { label: '默认视图', value: 'default' },
  { label: '侧视图', value: 'side' },
  { label: '俯视图', value: 'top', disabled: true },
]

describe('Segmented', () => {
  it('renders options and marks the active one', () => {
    const wrapper = mount(Segmented, {
      props: { options, value: 'side' },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[1].attributes('aria-selected')).toBe('true')
    expect(buttons[2].attributes('aria-disabled')).toBe('true')
  })

  it('emits update:value and change when selecting another option', async () => {
    const wrapper = mount(Segmented, {
      props: { options, value: 'default' },
    })

    await wrapper.findAll('button')[1].trigger('click')

    expect(wrapper.emitted('update:value')).toEqual([['side']])
    expect(wrapper.emitted('change')).toEqual([['side']])
  })

  it('ignores clicks on disabled or active options', async () => {
    const wrapper = mount(Segmented, {
      props: { options, value: 'default' },
    })

    await wrapper.findAll('button')[2].trigger('click')
    await wrapper.findAll('button')[0].trigger('click')

    expect(wrapper.emitted('update:value')).toBeUndefined()
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
