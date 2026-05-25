export class SemanticCompiler {
  compileModel(rawModel: string): any {
    console.warn('[HelixSemantic] Compiling semantic model...', rawModel)
    return {}
  }

  translateQuery(semanticQuery: any): any {
    return semanticQuery
  }
}

export const semanticCompiler = new SemanticCompiler()

/**
 * Formats a raw database value based on semantic display metadata configurations.
 */
export function formatValue(value: any, format: string): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const num = Number(value)
  // Prevent formatting booleans or non-numeric strings as numbers
  if (isNaN(num) || typeof value === 'boolean') {
    return String(value)
  }

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(num)

    case 'percentage':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 2
      }).format(num)

    case 'number':
      return new Intl.NumberFormat('en-US', {
        style: 'decimal'
      }).format(num)

    default:
      return String(value)
  }
}
