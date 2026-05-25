import { VisualQuery } from '@helixbi/types'

function compileFilterNode(node: { column: string; operator: string; value: any }): string {
  const col = `"${node.column}"`
  const val = node.value

  const formatValueForSQL = (v: any): string => {
    if (typeof v === 'string') {
      return `'${v.replace(/'/g, "''")}'`
    }
    if (v === null || v === undefined) {
      return 'NULL'
    }
    return String(v)
  }

  switch (node.operator) {
    case 'EQUALS':
      return val === null ? `${col} IS NULL` : `${col} = ${formatValueForSQL(val)}`
    case 'NOT_EQUALS':
      return val === null ? `${col} IS NOT NULL` : `${col} != ${formatValueForSQL(val)}`
    case 'GREATER_THAN':
      return `${col} > ${formatValueForSQL(val)}`
    case 'LESS_THAN':
      return `${col} < ${formatValueForSQL(val)}`
    case 'IN':
      if (Array.isArray(val)) {
        if (val.length === 0) return 'FALSE'
        return `${col} IN (${val.map(formatValueForSQL).join(', ')})`
      }
      return `${col} = ${formatValueForSQL(val)}`
    case 'CONTAINS':
      return `${col} LIKE '%${String(val).replace(/'/g, "''")}%'`
    default:
      return 'TRUE'
  }
}

/**
 * Compiles a structured VisualQuery configuration into a DuckDB SQL string.
 * Automatically handles dimensions, aggregations, groupings, ordering, and limits.
 */
export function compileVisualQueryToSQL(tableName: string, query: VisualQuery): string {
  const selectItems: string[] = []
  const quote = (col: string) => `"${col}"`

  // 1. Project Dimensions
  const dimsSQL = query.dimensions.map(quote)
  selectItems.push(...dimsSQL)

  // 2. Project Measures with Aggregations
  const measSQL = query.measures.map(m => {
    return `${m.aggregation}(${quote(m.column)}) AS "${m.alias}"`
  })
  selectItems.push(...measSQL)

  if (selectItems.length === 0) {
    throw new Error('VisualQuery must contain at least one dimension or measure.')
  }

  let sql = `SELECT `
  // If we only have dimensions, we want unique values
  if (query.dimensions.length > 0 && query.measures.length === 0) {
    sql += `DISTINCT `
  }

  sql += selectItems.join(', ')
  sql += ` FROM ${tableName}`

  // 2.5. Filters/WHERE clause
  if (query.filters && query.filters.length > 0) {
    const filterClauses = query.filters.map(compileFilterNode)
    sql += ` WHERE ${filterClauses.join(' AND ')}`
  }

  // 3. GROUP BY clauses for OLAP aggregation
  if (query.dimensions.length > 0 && query.measures.length > 0) {
    sql += ` GROUP BY ${dimsSQL.join(', ')}`
  }

  // 4. ORDER BY clauses
  if (query.orderBy) {
    sql += ` ORDER BY ${quote(query.orderBy.column)} ${query.orderBy.direction}`
  } else if (query.dimensions.length > 0) {
    sql += ` ORDER BY ${dimsSQL[0]} ASC`
  }

  // 5. Query limit guard
  if (query.limit) {
    sql += ` LIMIT ${query.limit}`
  } else {
    sql += ` LIMIT 1000`
  }

  return sql
}
