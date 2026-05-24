import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { Dashboard } from '@helixbi/types'
import schemaJson from '../../../../schema/dashboard.schema.json'

const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schemaJson)

export function validateDashboardSchema(dashboard: any): boolean {
  const valid = validate(dashboard)
  if (!valid) {
    throw new Error(
      `Dashboard schema validation failed: ${ajv.errorsText(validate.errors)}`
    )
  }
  return true
}

type MigrationFn = (dashboard: any) => any

const migrations: Record<string, MigrationFn> = {
  '1.0.0_to_2.0.0': (d) => {
    // Add deletedAt field if missing
    if (d.deletedAt === undefined) {
      d.deletedAt = null
    }

    // Add semanticModel field if missing
    if (d.semanticModel === undefined) {
      d.semanticModel = { enabled: false, modelFile: null }
    }

    // Rename widget position fields (width/height -> w/h for react-grid-layout)
    if (Array.isArray(d.widgets)) {
      for (const widget of d.widgets) {
        if (widget.position) {
          if (widget.position.width !== undefined) {
            widget.position.w = widget.position.width
            delete widget.position.width
          }
          if (widget.position.height !== undefined) {
            widget.position.h = widget.position.height
            delete widget.position.height
          }
        }
        // Add cardinalityGuard to queries if missing
        if (widget.query) {
          if (widget.query.cardinalityGuard === undefined) {
            widget.query.cardinalityGuard = { enabled: true, maxDistinct: 10000 }
          }
        }
      }
    }

    // Add schemaHistory if missing
    if (!Array.isArray(d.schemaHistory)) {
      d.schemaHistory = []
    }

    d.version = '2.0.0'
    return d
  }
}

const VERSION_ORDER = ['1.0.0', '2.0.0']

export function migrateDashboard(raw: any): Dashboard {
  let current = JSON.parse(JSON.stringify(raw)) // Deep clone to avoid mutating raw input directly
  const currentVersion = current.version || '1.0.0'
  const currentIdx = VERSION_ORDER.indexOf(currentVersion)

  if (currentIdx === -1) {
    throw new Error(`Unknown dashboard schema version: ${currentVersion}`)
  }

  // Apply all migrations in sequence
  for (let i = currentIdx; i < VERSION_ORDER.length - 1; i++) {
    const from = VERSION_ORDER[i]
    const to = VERSION_ORDER[i + 1]
    const key = `${from}_to_${to}`
    if (migrations[key]) {
      current = migrations[key](current)
      current.schemaHistory = current.schemaHistory ?? []
      current.schemaHistory.push({
        version: to,
        migratedAt: new Date().toISOString(),
        migratedBy: 'migration-runner'
      })
    }
  }

  // Validate against current schema
  validateDashboardSchema(current)
  return current as Dashboard
}
