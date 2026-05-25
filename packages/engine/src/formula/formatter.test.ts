import { describe, it, expect } from 'vitest'
import { formatValue } from '../../../semantic/src/index'

describe('Semantic Formatter', () => {
  it('should format currency correctly', () => {
    expect(formatValue(1250.5, 'currency')).toBe('$1,250.50')
    expect(formatValue('1250.5', 'currency')).toBe('$1,250.50')
    expect(formatValue(0, 'currency')).toBe('$0.00')
  })

  it('should format percentage correctly', () => {
    expect(formatValue(0.856, 'percentage')).toBe('85.6%')
    expect(formatValue('0.052', 'percentage')).toBe('5.2%')
  })

  it('should format standard numbers with commas', () => {
    expect(formatValue(1000000, 'number')).toBe('1,000,000')
    expect(formatValue('1250.75', 'number')).toBe('1,250.75')
  })

  it('should pass through non-numeric values and boolean flags', () => {
    expect(formatValue('unformatted', 'currency')).toBe('unformatted')
    expect(formatValue(true, 'currency')).toBe('true')
    expect(formatValue('', 'currency')).toBe('')
    expect(formatValue(null, 'currency')).toBe('')
  })
})
