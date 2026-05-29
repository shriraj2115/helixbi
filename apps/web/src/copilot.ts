export interface CopilotResult {
  sql: string
  explanation: string
}

/**
 * Parses plain English questions into a valid DuckDB SQL query.
 * Extracts:
 *  - Aggregations (AVG, SUM, COUNT, MIN, MAX)
 *  - Matches target column names dynamically (case-insensitive)
 *  - Grouping (GROUP BY)
 *  - Filtering (WHERE conditions for numeric and categorical)
 *  - Sorting (ORDER BY DESC/ASC)
 *  - Limits (LIMIT N)
 */
export function localTranslateNLToSQL(
  prompt: string,
  columns: string[],
  columnTypes: Record<string, string>
): CopilotResult {
  const cleanPrompt = prompt.toLowerCase().trim()

  // Find columns mentioned in the prompt
  const mentionedCols: string[] = []
  columns.forEach((col) => {
    const colLower = col.toLowerCase()
    if (cleanPrompt.includes(colLower)) {
      mentionedCols.push(col)
    }
  })

  let selectClause = ''
  let groupbyClause = ''
  let orderbyClause = ''
  let limitClause = ''
  let whereClause = ''
  let aggType: 'AVG' | 'SUM' | 'COUNT' | 'MIN' | 'MAX' | null = null
  let aggCol: string | null = null

  // Aggregation keywords detection
  if (cleanPrompt.includes('average') || cleanPrompt.includes('avg') || cleanPrompt.includes('mean')) {
    aggType = 'AVG'
  } else if (cleanPrompt.includes('sum') || cleanPrompt.includes('total')) {
    aggType = 'SUM'
  } else if (
    cleanPrompt.includes('count') ||
    cleanPrompt.includes('number of') ||
    cleanPrompt.includes('how many')
  } {
    aggType = 'COUNT'
  } else if (cleanPrompt.includes('min') || cleanPrompt.includes('lowest') || cleanPrompt.includes('smallest')) {
    aggType = 'MIN'
  } else if (cleanPrompt.includes('max') || cleanPrompt.includes('highest') || cleanPrompt.includes('largest')) {
    aggType = 'MAX'
  }

  // Find aggregate column: first numeric column mentioned, or first column overall
  if (aggType && aggType !== 'COUNT') {
    const numericCols = mentionedCols.filter((col) => {
      const type = (columnTypes[col] || '').toUpperCase()
      return (
        type.includes('INT') ||
        type.includes('DOUBLE') ||
        type.includes('FLOAT') ||
        type.includes('DECIMAL') ||
        type.includes('NUMBER')
      )
    })

    if (numericCols.length > 0) {
      aggCol = numericCols[0]!
    } else if (mentionedCols.length > 0) {
      aggCol = mentionedCols[0]!
    } else {
      // Default to first numeric column if none mentioned
      const allNumeric = columns.filter((col) => {
        const type = (columnTypes[col] || '').toUpperCase()
        return (
          type.includes('INT') ||
          type.includes('DOUBLE') ||
          type.includes('FLOAT') ||
          type.includes('DECIMAL') ||
          type.includes('NUMBER')
        )
      })
      aggCol = allNumeric.length > 0 ? allNumeric[0]! : columns[0]!
    }
  }

  // Group by column: usually after "by", "per", or "grouped by"
  let groupbyCol: string | null = null
  const byMatch = cleanPrompt.match(/(?:by|per|group\s+by)\s+([a-z0-9_\s]+)/i)
  if (byMatch && byMatch[1]) {
    const targetWord = byMatch[1].trim()
    const matchingCol = columns.find(
      (col) => targetWord.includes(col.toLowerCase()) || col.toLowerCase().includes(targetWord)
    )
    if (matchingCol) {
      groupbyCol = matchingCol
    }
  }

  // Fallback: If grouping is implied but "by" isn't explicitly used
  if (!groupbyCol && aggType) {
    const nonNumericCols = mentionedCols.filter(
      (col) => col.toLowerCase() !== (aggCol || '').toLowerCase()
    )
    if (nonNumericCols.length > 0) {
      groupbyCol = nonNumericCols[0]!
    }
  }

  // Construct SELECT & GROUP BY
  if (aggType) {
    const aggExpression = aggType === 'COUNT' ? 'COUNT(*)' : `${aggType}("${aggCol || columns[0]}")`
    const alias = `${aggType.toLowerCase()}_${aggCol || 'rows'}`

    if (groupbyCol) {
      selectClause = `SELECT "${groupbyCol}", ${aggExpression} AS "${alias}"`
      groupbyClause = `GROUP BY "${groupbyCol}"`
      orderbyClause = `ORDER BY "${alias}" DESC`
    } else {
      selectClause = `SELECT ${aggExpression} AS "${alias}"`
    }
  } else {
    // Select specific columns mentioned, or SELECT *
    if (mentionedCols.length > 0) {
      // Avoid duplicate select items
      const uniqueCols = Array.from(new Set(mentionedCols))
      selectClause = `SELECT ` + uniqueCols.map((c) => `"${c}"`).join(', ')
    } else {
      selectClause = `SELECT *`
    }
  }

  // Filter clauses parsing (WHERE)
  const whereConditions: string[] = []
  columns.forEach((col) => {
    const colLower = col.toLowerCase()
    const colType = (columnTypes[col] || '').toUpperCase()
    const isNumeric =
      colType.includes('INT') ||
      colType.includes('DOUBLE') ||
      colType.includes('FLOAT') ||
      colType.includes('DECIMAL') ||
      colType.includes('NUMBER')

    if (isNumeric) {
      const gtRegex = new RegExp(`${colLower}\\s*(?:>|greater\\s+than)\\s*(\\d+(?:\\.\\d+)?)`, 'i')
      const ltRegex = new RegExp(`${colLower}\\s*(?:<|less\\s+than)\\s*(\\d+(?:\\.\\d+)?)`, 'i')
      const eqRegex = new RegExp(`${colLower}\\s*(?:=|equals|is)\\s*(\\d+(?:\\.\\d+)?)`, 'i')

      const gtMatch = cleanPrompt.match(gtRegex)
      const ltMatch = cleanPrompt.match(ltRegex)
      const eqMatch = cleanPrompt.match(eqRegex)

      if (gtMatch && gtMatch[1]) {
        whereConditions.push(`"${col}" > ${gtMatch[1]}`)
      } else if (ltMatch && ltMatch[1]) {
        whereConditions.push(`"${col}" < ${ltMatch[1]}`)
      } else if (eqMatch && eqMatch[1]) {
        whereConditions.push(`"${col}" = ${eqMatch[1]}`)
      }
    } else {
      // String filter matching
      const eqStrRegex = new RegExp(`${colLower}\\s*(?:=|equals|is)\\s*['"]?([a-z0-9_\\s-]+)['"]?`, 'i')
      const eqStrMatch = cleanPrompt.match(eqStrRegex)
      if (eqStrMatch && eqStrMatch[1]) {
        whereConditions.push(`LOWER("${col}") = '${eqStrMatch[1].trim().toLowerCase()}'`)
      }
    }
  })

  if (whereConditions.length > 0) {
    whereClause = `WHERE ` + whereConditions.join(' AND ')
  }

  // Limit clause
  const limitMatch = cleanPrompt.match(/(?:limit|top|first)\s+(\d+)/i)
  if (limitMatch && limitMatch[1]) {
    limitClause = `LIMIT ${limitMatch[1]}`
  } else if (cleanPrompt.includes('top 5')) {
    limitClause = 'LIMIT 5'
  } else if (cleanPrompt.includes('top 10')) {
    limitClause = 'LIMIT 10'
  }

  // Order sorting overrides
  if (cleanPrompt.includes('asc') || cleanPrompt.includes('ascending') || cleanPrompt.includes('lowest first')) {
    if (orderbyClause) {
      orderbyClause = orderbyClause.replace('DESC', 'ASC')
    } else if (groupbyCol) {
      const alias = `${aggType?.toLowerCase() || 'count'}_${aggCol || 'rows'}`
      orderbyClause = `ORDER BY "${alias}" ASC`
    } else if (mentionedCols.length > 0) {
      orderbyClause = `ORDER BY "${mentionedCols[0]}" ASC`
    }
  }

  // Construct complete SQL query
  const parts = [
    selectClause,
    'FROM data_table_view',
    whereClause,
    groupbyClause,
    orderbyClause,
    limitClause,
  ].filter(Boolean)

  const sql = parts.join('\n')

  // Generate plain English explanation
  let explanation = ''
  if (aggType) {
    explanation += `Calculates the ${aggType.toLowerCase()} of "${aggCol || 'rows'}"`
    if (groupbyCol) {
      explanation += ` grouped by "${groupbyCol}" (highest first)`
    }
    if (whereClause) {
      explanation += ` filtered by ${whereConditions.join(' and ')}`
    }
    if (limitClause) {
      explanation += `, returning the ${limitClause.toLowerCase()}`
    }
  } else {
    explanation += `Retrieves columns: ${mentionedCols.length > 0 ? mentionedCols.join(', ') : 'all'}`
    if (whereClause) {
      explanation += ` filtered by ${whereConditions.join(' and ')}`
    }
    if (limitClause) {
      explanation += ` showing only the ${limitClause.toLowerCase()}`
    }
  }

  return { sql, explanation }
}

/**
 * Fetch LLM generated SQL from Gemini API
 */
export async function translateNLToSQLGemini(
  prompt: string,
  columns: string[],
  columnTypes: Record<string, string>,
  apiKey: string
): Promise<CopilotResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `You are an expert SQL query generator for DuckDB. 
Given the database schema of "data_table_view", translate the natural language request into a single valid DuckDB SQL query.
Do NOT output any markdown tags or backticks. Return ONLY the raw SQL string.
If a column name has spaces or is case-sensitive, wrap it in double quotes (e.g. "Revenue").

Table schema columns and types:
${JSON.stringify(columnTypes, null, 2)}

List of all columns:
${columns.join(', ')}

English Request: "${prompt}"

Generated DuckDB SQL:`,
              },
            ],
          },
        ],
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API Error (${response.status}): ${errText}`)
  }

  const result = await response.json()
  const sql = result.candidates?.[0]?.content?.parts?.[0]?.text
    ?.trim()
    ?.replace(/^```sql\n?|```$/g, '') || ''
  
  return {
    sql,
    explanation: `Gemini AI Generated Query — translated directly from your natural language prompt.`
  }
}

/**
 * Fetch LLM generated SQL from OpenAI API
 */
export async function translateNLToSQLOpenAI(
  prompt: string,
  columns: string[],
  columnTypes: Record<string, string>,
  apiKey: string
): Promise<CopilotResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert SQL query generator for DuckDB. Given the schema of "data_table_view", return ONLY the raw SQL query. Do not wrap in markdown or backticks. Wrap column names in double quotes if needed.`,
        },
        {
          role: 'user',
          content: `Table Columns and Types: ${JSON.stringify(columnTypes)}
Available Columns: ${columns.join(', ')}
Request: "${prompt}"`,
        },
      ],
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI API Error (${response.status}): ${errText}`)
  }

  const result = await response.json()
  const sql = result.choices?.[0]?.message?.content
    ?.trim()
    ?.replace(/^```sql\n?|```$/g, '') || ''

  return {
    sql,
    explanation: `OpenAI GPT Generated Query — translated directly from your natural language prompt.`
  }
}
