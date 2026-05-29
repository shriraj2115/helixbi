import { describe, it, expect } from 'vitest'
import {
  classifyColumnType,
  generateNumericProfileSQL,
  generateStringProfileSQL,
  generateTopValuesSQL,
  generateTemporalProfileSQL,
  generateBooleanProfileSQL,
  generateProfileSQL
} from './profiler'

describe('classifyColumnType', () => {
  it('should classify INTEGER variants as numeric', () => {
    expect(classifyColumnType('INTEGER')).toBe('numeric')
    expect(classifyColumnType('BIGINT')).toBe('numeric')
    expect(classifyColumnType('SMALLINT')).toBe('numeric')
    expect(classifyColumnType('TINYINT')).toBe('numeric')
    expect(classifyColumnType('HUGEINT')).toBe('numeric')
  })

  it('should classify FLOAT/DOUBLE/DECIMAL as numeric', () => {
    expect(classifyColumnType('FLOAT')).toBe('numeric')
    expect(classifyColumnType('DOUBLE')).toBe('numeric')
    expect(classifyColumnType('DECIMAL(10,2)')).toBe('numeric')
    expect(classifyColumnType('NUMERIC')).toBe('numeric')
    expect(classifyColumnType('REAL')).toBe('numeric')
  })

  it('should classify VARCHAR/TEXT as string', () => {
    expect(classifyColumnType('VARCHAR')).toBe('string')
    expect(classifyColumnType('VARCHAR(255)')).toBe('string')
    expect(classifyColumnType('TEXT')).toBe('string')
    expect(classifyColumnType('CHAR(10)')).toBe('string')
  })

  it('should classify DATE/TIMESTAMP as temporal', () => {
    expect(classifyColumnType('DATE')).toBe('temporal')
    expect(classifyColumnType('TIMESTAMP')).toBe('temporal')
    expect(classifyColumnType('TIMESTAMP WITH TIME ZONE')).toBe('temporal')
    expect(classifyColumnType('TIME')).toBe('temporal')
  })

  it('should classify BOOLEAN as boolean', () => {
    expect(classifyColumnType('BOOLEAN')).toBe('boolean')
    expect(classifyColumnType('BOOL')).toBe('boolean')
  })

  it('should classify unknown types as unknown', () => {
    expect(classifyColumnType('JSON')).toBe('unknown')
    expect(classifyColumnType('MAP')).toBe('unknown')
  })
})

describe('generateNumericProfileSQL', () => {
  it('should generate valid aggregate SQL for numeric columns', () => {
    const sql = generateNumericProfileSQL('sales', 'revenue')
    expect(sql).toContain('MIN("revenue")')
    expect(sql).toContain('MAX("revenue")')
    expect(sql).toContain('AVG("revenue")')
    expect(sql).toContain('MEDIAN("revenue")')
    expect(sql).toContain('STDDEV("revenue")')
    expect(sql).toContain('COUNT(DISTINCT "revenue")')
    expect(sql).toContain('FROM sales')
  })
})

describe('generateStringProfileSQL', () => {
  it('should generate valid aggregate SQL for string columns', () => {
    const sql = generateStringProfileSQL('sales', 'category')
    expect(sql).toContain('COUNT(DISTINCT "category")')
    expect(sql).toContain('AVG(LENGTH(CAST("category" AS VARCHAR)))')
    expect(sql).toContain('FROM sales')
  })
})

describe('generateTopValuesSQL', () => {
  it('should generate top N values query with default N=5', () => {
    const sql = generateTopValuesSQL('sales', 'region')
    expect(sql).toContain('GROUP BY "region"')
    expect(sql).toContain('ORDER BY count DESC')
    expect(sql).toContain('LIMIT 5')
  })

  it('should accept custom top N', () => {
    const sql = generateTopValuesSQL('sales', 'region', 10)
    expect(sql).toContain('LIMIT 10')
  })
})

describe('generateTemporalProfileSQL', () => {
  it('should generate valid temporal column profiling SQL', () => {
    const sql = generateTemporalProfileSQL('events', 'created_at')
    expect(sql).toContain('CAST(MIN("created_at") AS VARCHAR)')
    expect(sql).toContain('CAST(MAX("created_at") AS VARCHAR)')
    expect(sql).toContain('COUNT(DISTINCT "created_at")')
    expect(sql).toContain('FROM events')
  })
})

describe('generateBooleanProfileSQL', () => {
  it('should generate valid boolean column profiling SQL', () => {
    const sql = generateBooleanProfileSQL('users', 'is_active')
    expect(sql).toContain('COUNT(DISTINCT "is_active")')
    expect(sql).toContain('FROM users')
  })
})

describe('generateProfileSQL', () => {
  it('should dispatch to numeric profiler for numeric types', () => {
    const sql = generateProfileSQL('t', 'c', 'numeric')
    expect(sql).toContain('MEDIAN')
    expect(sql).toContain('STDDEV')
  })

  it('should dispatch to string profiler for string types', () => {
    const sql = generateProfileSQL('t', 'c', 'string')
    expect(sql).toContain('AVG(LENGTH')
  })

  it('should dispatch to temporal profiler for temporal types', () => {
    const sql = generateProfileSQL('t', 'c', 'temporal')
    expect(sql).toContain('CAST(MIN')
  })

  it('should dispatch to boolean profiler for boolean types', () => {
    const sql = generateProfileSQL('t', 'c', 'boolean')
    expect(sql).not.toContain('AVG(LENGTH')
    expect(sql).toContain('COUNT(DISTINCT')
  })

  it('should fallback to string profiler for unknown types', () => {
    const sql = generateProfileSQL('t', 'c', 'unknown')
    expect(sql).toContain('AVG(LENGTH')
  })
})
