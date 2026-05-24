export { migrateDashboard, validateDashboardSchema } from './migrations/runner'

export function compileFormula(expression: string): string {
  // Pratt Parser placeholder
  return `SELECT ${expression}`
}
