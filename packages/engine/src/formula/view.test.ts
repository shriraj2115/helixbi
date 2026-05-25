import { describe, it, expect } from 'vitest'
import { generateViewSQL } from './view'
import { CalculatedField } from '@helixbi/types'

describe('generateViewSQL', () => {
  const mockColumns = ['ORDER_ID', 'AMOUNT', 'QTY']

  it('should generate a simple SELECT * view when no calculated fields are defined', () => {
    const sql = generateViewSQL('data_table', [], mockColumns)
    expect(sql).toBe('CREATE OR REPLACE VIEW data_table_view AS SELECT * FROM data_table')
  })

  it('should generate a SELECT with compiled calculated fields', () => {
    const fields: CalculatedField[] = [
      {
        id: 'cf_1',
        name: 'Total_Cost',
        expression: '[AMOUNT] * [QTY]',
        dependsOn: ['AMOUNT', 'QTY'],
        dataSource: 'ds_001',
        outputType: 'DOUBLE',
        validated: true,
        validatedAt: new Date().toISOString()
      }
    ]

    const sql = generateViewSQL('data_table', fields, mockColumns)
    expect(sql).toBe(
      'CREATE OR REPLACE VIEW data_table_view AS SELECT *, ("AMOUNT" * "QTY") AS "Total_Cost" FROM data_table'
    )
  })

  it('should generate multiple calculated fields separated by commas', () => {
    const fields: CalculatedField[] = [
      {
        id: 'cf_1',
        name: 'Total_Cost',
        expression: '[AMOUNT] * [QTY]',
        dependsOn: ['AMOUNT', 'QTY'],
        dataSource: 'ds_001',
        outputType: 'DOUBLE',
        validated: true,
        validatedAt: new Date().toISOString()
      },
      {
        id: 'cf_2',
        name: 'Discount_Cost',
        expression: '[AMOUNT] - 5',
        dependsOn: ['AMOUNT'],
        dataSource: 'ds_001',
        outputType: 'DOUBLE',
        validated: true,
        validatedAt: new Date().toISOString()
      }
    ]

    const sql = generateViewSQL('data_table', fields, mockColumns)
    expect(sql).toBe(
      'CREATE OR REPLACE VIEW data_table_view AS SELECT *, ("AMOUNT" * "QTY") AS "Total_Cost", ("AMOUNT" - 5) AS "Discount_Cost" FROM data_table'
    )
  })

  it('should fall back to NULL AS column when the expression is invalid', () => {
    const fields: CalculatedField[] = [
      {
        id: 'cf_invalid',
        name: 'Error_Column',
        expression: '[AMOUNT +', // Syntax error: missing bracket
        dependsOn: [],
        dataSource: 'ds_001',
        outputType: 'DOUBLE',
        validated: false,
        validatedAt: new Date().toISOString()
      }
    ]

    const sql = generateViewSQL('data_table', fields, mockColumns)
    expect(sql).toBe(
      'CREATE OR REPLACE VIEW data_table_view AS SELECT *, NULL AS "Error_Column" FROM data_table'
    )
  })
})
