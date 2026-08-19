import { describe, expect, it } from 'vitest'

import type { ThreeDChannelRow, ThreeDResponseRow } from '../types'
import {
  buildThreeDSurfaceDataset,
  buildThreeDWaveformQueryPayload,
  getThreeDSurfaceUnitIssue,
  hasSameThreeDChannelRowIdentities,
  sortThreeDChannelRows,
} from './queryAdapter'

const buildChannelRow = (overrides: Partial<ThreeDChannelRow> = {}): ThreeDChannelRow => ({
  channelName: 'CH01',
  channelId: 1,
  unit: 'V',
  color: '#1677FF',
  displayPosition: '图框1',
  zCoordinate: '2',
  cannonNumber: '2024001',
  ...overrides,
})

const buildResponseRow = (overrides: Partial<ThreeDResponseRow> = {}): ThreeDResponseRow => ({
  chnl: 'CH01',
  chnl_id: 1,
  dat_unit: 'V',
  data: [1, 2, 3],
  dev: 4,
  shot: 2024001,
  time: [0, 1, 2],
  time_unit: 'ms',
  ...overrides,
})

describe('sortThreeDChannelRows', () => {
  it('sorts by z coordinate while keeping stable order for equal values', () => {
    const sorted = sortThreeDChannelRows(
      [
        buildChannelRow({ channelName: 'A', zCoordinate: '3' }),
        buildChannelRow({ channelName: 'B', zCoordinate: '1' }),
        buildChannelRow({ channelName: 'C', zCoordinate: '2' }),
      ],
      'z',
    )

    expect(sorted.map((row) => row.channelName)).toEqual(['B', 'C', 'A'])
  })

  it('uses spatial coordinates in spatial mode and falls back to index order', () => {
    const sorted = sortThreeDChannelRows(
      [
        buildChannelRow({ channelName: 'A', zCoordinate: '1', spatialCoordinate: '2.5' }),
        buildChannelRow({ channelName: 'B', zCoordinate: '2', spatialCoordinate: 'invalid' }),
      ],
      'spatial',
    )

    expect(sorted.map((row) => row.zValue)).toEqual([2, 2.5])
  })
})

describe('hasSameThreeDChannelRowIdentities', () => {
  it('compares channel × cannon identities regardless of order', () => {
    const left = [
      buildChannelRow({ channelName: 'A', cannonNumber: '1' }),
      buildChannelRow({ channelName: 'B', cannonNumber: '2' }),
    ]
    const right = [
      buildChannelRow({ channelName: 'B', cannonNumber: '2' }),
      buildChannelRow({ channelName: 'A', cannonNumber: '1' }),
    ]

    expect(hasSameThreeDChannelRowIdentities(left, right)).toBe(true)
    expect(
      hasSameThreeDChannelRowIdentities(left, [
        buildChannelRow({ channelName: 'A', cannonNumber: '2' }),
        buildChannelRow({ channelName: 'B', cannonNumber: '2' }),
      ]),
    ).toBe(false)
  })
})

describe('getThreeDSurfaceUnitIssue', () => {
  it('reports conflicting time units first', () => {
    const issue = getThreeDSurfaceUnitIssue([
      buildResponseRow({ time_unit: 'ms' }),
      buildResponseRow({ time_unit: 's', dat_unit: 'V' }),
    ])
    expect(issue).toEqual({ type: 'time-unit', units: ['ms', 's'] })
  })

  it('reports conflicting value units', () => {
    const issue = getThreeDSurfaceUnitIssue([
      buildResponseRow(),
      buildResponseRow({ chnl: 'CH02', dat_unit: 'kV' }),
    ])
    expect(issue).toEqual({ type: 'value-unit', units: ['V', 'kV'] })
  })

  it('returns null when units are consistent', () => {
    expect(getThreeDSurfaceUnitIssue([buildResponseRow()])).toBeNull()
  })
})

describe('buildThreeDSurfaceDataset', () => {
  it('orders rows by coordinate and fills missing channels with nulls', async () => {
    const dataset = await buildThreeDSurfaceDataset({
      responseRows: [
        buildResponseRow({ chnl: 'CH02', chnl_id: 2, data: [10, 20, 30] }),
        buildResponseRow(),
      ],
      channelRows: [
        buildChannelRow({ channelName: 'CH02', channelId: 2, zCoordinate: '1' }),
        buildChannelRow({ channelName: 'CH03', channelId: 3, zCoordinate: '0' }),
        buildChannelRow({ zCoordinate: '2' }),
      ],
    })

    expect(dataset.y).toEqual([0, 1, 2])
    expect(dataset.channelLabels).toEqual(['CH03', 'CH02', 'CH01'])
    expect(dataset.z[0]).toEqual([null, null, null])
    expect(dataset.z[1]).toEqual([10, 20, 30])
    expect(dataset.z[2]).toEqual([1, 2, 3])
    expect(dataset.timeUnit).toBe('ms')
    expect(dataset.valueUnit).toBe('V')
  })

  it('resamples rows onto the union time axis', async () => {
    const dataset = await buildThreeDSurfaceDataset({
      responseRows: [
        buildResponseRow({ time: [0, 1], data: [0, 10] }),
        buildResponseRow({ chnl: 'CH02', chnl_id: 2, time: [0.5, 1.5], data: [5, 15] }),
      ],
      channelRows: [
        buildChannelRow(),
        buildChannelRow({ channelName: 'CH02', channelId: 2, zCoordinate: '1' }),
      ],
    })

    expect(dataset.x).toEqual([0, 0.5, 1, 1.5])
    expect(dataset.z[0]).toEqual([null, 5, 10, 15])
    expect(dataset.z[1]).toEqual([0, 5, 10, null])
  })
})

describe('buildThreeDWaveformQueryPayload', () => {
  it('expands shots × channels and serializes times', () => {
    const payload = buildThreeDWaveformQueryPayload({
      userName: 'tester',
      dev: 4,
      selectedCannons: ['2024001', '2024002'],
      selectedChannelItems: [
        { channelName: 'CH01', channelId: 1 },
        { channelName: 'CH02', channelId: 2 },
      ],
      timeStart: 0,
      timeEnd: 100,
      pointCount: 800,
    })

    expect(payload).toEqual({
      user_name: 'tester',
      dev: 4,
      list: [
        { shot: 2024001, chnl_id: 1 },
        { shot: 2024001, chnl_id: 2 },
        { shot: 2024002, chnl_id: 1 },
        { shot: 2024002, chnl_id: 2 },
      ],
      start_time: '0',
      end_time: '100',
      point_count: 800,
    })
  })

  it('omits point_count when invalid', () => {
    const payload = buildThreeDWaveformQueryPayload({
      userName: 'tester',
      dev: 4,
      selectedCannons: ['1'],
      selectedChannelItems: [{ channelName: 'CH01', channelId: 1 }],
      timeStart: undefined,
      timeEnd: undefined,
      pointCount: Number.NaN,
    })

    expect(payload.start_time).toBe('')
    expect(payload.point_count).toBeUndefined()
  })
})
