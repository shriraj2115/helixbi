import { parseAndCompileFormula } from './formula/compiler'

export { migrateDashboard, validateDashboardSchema } from './migrations/runner'
export { parseAndCompileFormula, compileASTToSQL, extractASTDependencies } from './formula/compiler'
export { Lexer } from './formula/lexer'
export { Parser } from './formula/parser'
export { generateViewSQL } from './formula/view'
export { compileVisualQueryToSQL } from './formula/query'

export function compileFormula(expression: string): string {
  const { sqlExpression } = parseAndCompileFormula(expression)
  return sqlExpression
}

