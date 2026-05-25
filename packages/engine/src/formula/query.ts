import { VisualQuery } from '@helixbi/types'

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
