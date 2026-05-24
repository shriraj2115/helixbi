import { Dashboard } from '@helixbi/types'

export function compileFormula(expression: string): string {
  // Pratt Parser placeholder
  return `SELECT ${expression}`
}

export function migrateDashboard(dashboard: Dashboard): Dashboard {
  return dashboard
}
