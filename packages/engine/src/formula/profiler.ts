import { ColumnProfile } from '@helixbi/types'

/**
 * DuckDB type classification — maps raw DuckDB column types to our simplified categories.
 */
export function classifyColumnType(duckdbType: string): ColumnProfile['dataType'] {
  const t = duckdbType.toUpperCase()
  if (
    t.includes('INT') ||
    t.includes('FLOAT') ||
    t.includes('DOUBLE') ||
    t.includes('DECIMAL') ||
    t.includes('NUMERIC') ||
    t.includes('REAL') ||
    t.includes('BIGINT') ||
    t.includes('SMALLINT') ||
    t.includes('TINYINT') ||
    t.includes('HUGEINT')
  ) {
    return 'numeric'
  }
  if (
    t.includes('DATE') ||
    t.includes('TIMESTAMP') ||
    t.includes('TIME') ||
    t.includes('INTERVAL')
  ) {
    return 'temporal'
  }
  if (t.includes('BOOL')) {
    return 'boolean'
  }
  if (
    t.includes('VARCHAR') ||
    t.includes('TEXT') ||
    t.includes('CHAR') ||
    t.includes('STRING') ||
    t.includes('BLOB')
  ) {
    return 'string'
  }
  return 'unknown'
}

/**
 * Generates DuckDB SQL to compute numeric column statistics.
 */
export function generateNumericProfileSQL(tableName: string, columnName: string): string {
  const col = `"${columnName}"`
  return [
    `SELECT`,
    `  COUNT(*) AS total_rows,`,
    `  COUNT(*) - COUNT(${col}) AS null_count,`,
    `  COUNT(DISTINCT ${col}) AS distinct_count,`,
    `  MIN(${col}) AS min_val,`,
    `  MAX(${col}) AS max_val,`,
    `  AVG(${col}) AS mean_val,`,
    `  MEDIAN(${col}) AS median_val,`,
    `  STDDEV(${col}) AS stddev_val`,
    `FROM ${tableName}`
  ].join('\n')
}

/**
 * Generates DuckDB SQL to compute string/categorical column statistics.
 */
export function generateStringProfileSQL(tableName: string, columnName: string): string {
  const col = `"${columnName}"`
  return [
    `SELECT`,
    `  COUNT(*) AS total_rows,`,
    `  COUNT(*) - COUNT(${col}) AS null_count,`,
    `  COUNT(DISTINCT ${col}) AS distinct_count,`,
    `  AVG(LENGTH(CAST(${col} AS VARCHAR))) AS avg_length`,
    `FROM ${tableName}`
  ].join('\n')
}

/**
 * Generates DuckDB SQL to fetch the top N most frequent values for a column.
 */
export function generateTopValuesSQL(tableName: string, columnName: string, topN = 5): string {
  const col = `"${columnName}"`
  return [
    `SELECT CAST(${col} AS VARCHAR) AS value, COUNT(*) AS count`,
    `FROM ${tableName}`,
    `WHERE ${col} IS NOT NULL`,
    `GROUP BY ${col}`,
    `ORDER BY count DESC`,
    `LIMIT ${topN}`
  ].join('\n')
}

/**
 * Generates DuckDB SQL to compute temporal column statistics.
 */
export function generateTemporalProfileSQL(tableName: string, columnName: string): string {
  const col = `"${columnName}"`
  return [
    `SELECT`,
    `  COUNT(*) AS total_rows,`,
    `  COUNT(*) - COUNT(${col}) AS null_count,`,
    `  COUNT(DISTINCT ${col}) AS distinct_count,`,
    `  CAST(MIN(${col}) AS VARCHAR) AS min_date,`,
    `  CAST(MAX(${col}) AS VARCHAR) AS max_date`,
    `FROM ${tableName}`
  ].join('\n')
}

/**
 * Generates DuckDB SQL to compute boolean column statistics.
 */
export function generateBooleanProfileSQL(tableName: string, columnName: string): string {
  const col = `"${columnName}"`
  return [
    `SELECT`,
    `  COUNT(*) AS total_rows,`,
    `  COUNT(*) - COUNT(${col}) AS null_count,`,
    `  COUNT(DISTINCT ${col}) AS distinct_count`,
    `FROM ${tableName}`
  ].join('\n')
}

/**
 * Returns the appropriate profile SQL generator based on column type.
 */
export function generateProfileSQL(
  tableName: string,
  columnName: string,
  dataType: ColumnProfile['dataType']
): string {
  switch (dataType) {
    case 'numeric':
      return generateNumericProfileSQL(tableName, columnName)
    case 'string':
      return generateStringProfileSQL(tableName, columnName)
    case 'temporal':
      return generateTemporalProfileSQL(tableName, columnName)
    case 'boolean':
      return generateBooleanProfileSQL(tableName, columnName)
    default:
      return generateStringProfileSQL(tableName, columnName)
  }
}
