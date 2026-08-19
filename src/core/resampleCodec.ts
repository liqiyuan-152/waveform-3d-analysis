import { normalizeSurfaceValue } from './resampleMath'

/**
 * 行式数据与平坦 TypedArray 之间的编解码：
 * Worker 与 WASM 都以 Float64Array/Uint32Array 传输（可转移、零拷贝）。
 */

export const flattenRows = (timeRows: number[][], dataRows: Array<Array<number | null>>) => {
  const totalLength = timeRows.reduce((sum, row) => sum + row.length, 0)
  const flatTimeValues = new Float64Array(totalLength)
  const flatDataValues = new Float64Array(totalLength)
  const offsets = new Uint32Array(timeRows.length)
  const lengths = new Uint32Array(timeRows.length)
  let offset = 0

  timeRows.forEach((timeRow, rowIndex) => {
    const dataRow = dataRows[rowIndex] || []
    offsets[rowIndex] = offset
    lengths[rowIndex] = timeRow.length

    timeRow.forEach((time, valueIndex) => {
      flatTimeValues[offset + valueIndex] = time
      flatDataValues[offset + valueIndex] = normalizeSurfaceValue(dataRow[valueIndex]) ?? Number.NaN
    })

    offset += timeRow.length
  })

  return {
    flatTimeValues,
    flatDataValues,
    offsets,
    lengths,
  }
}

export const unflattenRowsResult = (
  flatResult: Float64Array,
  rowCount: number,
  unionLength: number,
) =>
  Array.from({ length: rowCount }, (_, rowIndex) => {
    const start = rowIndex * unionLength

    return Array.from(flatResult.slice(start, start + unionLength), (value) =>
      Number.isFinite(value) ? value : null,
    )
  })

/** 解析 WASM `build_union_and_resample` 的输出：[unionLength, rowCount, ...union, ...values] */
export const parseUnionAndResampleResult = (
  result: Float64Array,
  fallbackRowCount: number,
): {
  unionTimeValues: number[]
  values: Array<Array<number | null>>
} => {
  const unionLength = Number(result[0])
  const rowCount = Number(result[1])

  if (
    !Number.isInteger(unionLength) ||
    !Number.isInteger(rowCount) ||
    unionLength < 0 ||
    rowCount < 0
  ) {
    return {
      unionTimeValues: [],
      values: Array.from({ length: fallbackRowCount }, () => []),
    }
  }

  const unionStart = 2
  const valuesStart = unionStart + unionLength
  const unionTimeValues = Array.from(result.slice(unionStart, valuesStart))
  const flatValues = result.slice(valuesStart)

  return {
    unionTimeValues,
    values: unflattenRowsResult(flatValues, rowCount, unionLength),
  }
}
