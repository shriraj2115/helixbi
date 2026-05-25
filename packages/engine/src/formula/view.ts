import { CalculatedField } from '@helixbi/types'
import { parseAndCompileFormula } from './compiler'

/**
 * Generates the SQL command to create or replace a DuckDB view
 * that includes all original physical columns plus the calculated fields.
 */
export function generateViewSQL(
  tableName: string,
  fields: CalculatedField[],
  _columns: string[]
): string {
  const viewName = `${tableName}_view`
  
  if (fields.length === 0) {
    return `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM ${tableName}`
  }

  const selectItems: string[] = ['*']
  
  for (const field of fields) {
    // If the calculated field name matches a physical column name, it would conflict in SQL.
    // In standard SQL/DuckDB, projecting "SELECT *, expr AS physical_col" might throw.
    // So we project it using its compileFormula counterpart.
    try {
      const { sqlExpression } = parseAndCompileFormula(field.expression)
      selectItems.push(`${sqlExpression} AS "${field.name}"`)
    } catch (err) {
      // If parsing fails, default to a NULL expression to keep the view valid
      selectItems.push(`NULL AS "${field.name}"`)
    }
  }

  return `CREATE OR REPLACE VIEW ${viewName} AS SELECT ${selectItems.join(', ')} FROM ${tableName}`
}
