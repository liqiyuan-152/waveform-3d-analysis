import { describe, expect, it } from 'vitest'

import {
  buildTimeDataPairs,
  buildUnionAndResampleRows,
  buildUnionTimeValues,
  normalizeSurfaceValue,
  resampleDataToUnionTimeValues,
} from './resample'

describe('normalizeSurfaceValue', () => {
  it('keeps finite numbers and maps everything else to null', () => {
    expect(normalizeSurfaceValue(1.5)).toBe(1.5)
    expect(normalizeSurfaceValue(Number.NaN)).toBeNull()
    expect(normalizeSurfaceValue(null)).toBeNull()
    expect(normalizeSurfaceValue(undefined)).toBeNull()
  })
})

describe('buildUnionTimeValues', () => {
  it('merges, deduplicates and sorts time rows', () => {
    expect(
      buildUnionTimeValues([
        [3, 1],
        [2, 1],
      ]),
    ).toEqual([1, 2, 3])
  })

  it('ignores non-finite times', () => {
    expect(buildUnionTimeValues([[1, Number.NaN, 3]])).toEqual([1, 3])
  })
})

describe('buildTimeDataPairs', () => {
  it('drops non-finite times and sorts by time', () => {
    expect(buildTimeDataPairs([2, 1, Number.NaN], [20, 10, 30])).toEqual([
      { time: 1, value: 10 },
      { time: 2, value: 20 },
    ])
  })
})

describe('resampleDataToUnionTimeValues', () => {
  it('interpolates linearly between neighbors', () => {
    const values = resampleDataToUnionTimeValues([0, 0.5, 1], [0, 1], [0, 10])
    expect(values).toEqual([0, 5, 10])
  })

  it('returns null outside the covered time range', () => {
    const values = resampleDataToUnionTimeValues([0, 1, 2], [0.5, 1.5], [1, 2])
    expect(values).toEqual([null, 1.5, null])
  })

  it('returns nulls when the row is empty', () => {
    expect(resampleDataToUnionTimeValues([0, 1], [], [])).toEqual([null, null])
  })

  it('does not interpolate across null anchors', () => {
    const values = resampleDataToUnionTimeValues([0, 1], [0, 1], [null, null])
    expect(values).toEqual([null, null])
  })
})

describe('buildUnionAndResampleRows', () => {
  it('resamples all rows onto the union time axis (js fallback when worker unavailable)', async () => {
    const result = await buildUnionAndResampleRows(
      [
        [0, 1],
        [0.5, 1.5],
      ],
      [
        [0, 10],
        [5, 15],
      ],
    )

    expect(result.unionTimeValues).toEqual([0, 0.5, 1, 1.5])
    expect(result.values).toHaveLength(2)
    expect(result.values[0]).toEqual([0, 5, 10, null])
    expect(result.values[1]).toEqual([null, 5, 10, 15])
  })

  it('keeps empty rows aligned as nulls', async () => {
    const result = await buildUnionAndResampleRows([[0, 1], []], [[1, 2], []])
    expect(result.values[1]).toEqual([null, null])
  })
})
