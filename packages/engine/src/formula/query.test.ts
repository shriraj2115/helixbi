import { describe, it, expect } from 'vitest'
import { compileVisualQueryToSQL } from './query'
import { VisualQuery } from '@helixbi/types'

describe('compileVisualQueryToSQL', () => {
  it('should compile dimension only visual query with DISTINCT and default ordering', () => {
    const query: VisualQuery = {
      dimensions: ['REGION'],
      measures: [],
      filters: []
    }
    const sql = compileVisualQueryToSQL('data_table_view', query)
    expect(sql).toBe(
      'SELECT DISTINCT "REGION" FROM data_table_view ORDER BY "REGION" ASC LIMIT 1000'
    )
  })

  it('should compile dimension and measure query with GROUP BY and default ordering', () => {
    const query: VisualQuery = {
      dimensions: ['CATEGORY'],
      measures: [
        { column: 'AMOUNT', aggregation: 'SUM', alias: 'Total_Sales' }
      ],
      filters: []
    }
    const sql = compileVisualQueryToSQL('data_table_view', query)
    expect(sql).toBe(
      'SELECT "CATEGORY", SUM("AMOUNT") AS "Total_Sales" FROM data_table_view GROUP BY "CATEGORY" ORDER BY "CATEGORY" ASC LIMIT 1000'
    )
  })

  it('should support custom ordering and limits', () => {
    const query: VisualQuery = {
      dimensions: ['PRODUCT'],
      measures: [
        { column: 'QTY', aggregation: 'AVG', alias: 'Average_Quantity' }
      ],
      filters: [],
      orderBy: { column: 'Average_Quantity', direction: 'DESC' },
      limit: 10
    }
    const sql = compileVisualQueryToSQL('data_table_view', query)
    expect(sql).toBe(
      'SELECT "PRODUCT", AVG("QTY") AS "Average_Quantity" FROM data_table_view GROUP BY "PRODUCT" ORDER BY "Average_Quantity" DESC LIMIT 10'
    )
  })

  it('should throw error when no dimension or measure is projected', () => {
    const query: VisualQuery = {
      dimensions: [],
      measures: [],
      filters: []
    }
    expect(() => compileVisualQueryToSQL('data_table_view', query)).toThrow(
      'VisualQuery must contain at least one dimension or measure.'
    )
  })
})
