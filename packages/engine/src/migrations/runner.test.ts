import { describe, it, expect } from 'vitest'
import { migrateDashboard, validateDashboardSchema } from './runner'

describe('Dashboard Migration Runner', () => {
  const v1Dashboard = {
    version: '1.0.0',
    id: 'd9b04f7b-607a-4ef3-a3d8-11f84cdb1234',
    title: 'Sales Overview V1',
    description: 'V1 sales data',
    createdAt: '2026-05-24T12:00:00Z',
    updatedAt: '2026-05-24T12:00:00Z',
    createdBy: 'user-123',
    orgId: 'org-456',
    isPublic: false,
    dataSources: [
      {
        id: 'ds_001',
        name: 'Orders CSV',
        type: 'duckdb_local',
        config: {
          file: 'orders.csv',
          format: 'csv',
          storageMode: 'opfs',
          encoding: 'utf-8',
          hasHeader: true
        },
        schema: {
          version: 1,
          columns: [
            {
              name: 'ORDER_ID',
              type: 'VARCHAR',
              role: 'dimension',
              nullable: false
            },
            {
              name: 'AMOUNT',
              type: 'DOUBLE',
              role: 'measure',
              nullable: false
            }
          ]
        },
        lastRefreshedAt: '2026-05-24T12:00:00Z'
      }
    ],
    calculatedFields: [
      {
        id: 'cf_001',
        name: 'Profit Margin',
        expression: '[AMOUNT] * 0.1',
        dependsOn: ['AMOUNT'],
        dataSource: 'ds_001',
        outputType: 'DOUBLE',
        validated: true,
        validatedAt: '2026-05-24T12:00:00Z'
      }
    ],
    widgets: [
      {
        id: 'w_001',
        type: 'builtin.bar_chart',
        title: 'Revenue by Category',
        position: {
          x: 0,
          y: 0,
          width: 6, // Old field
          height: 4, // Old field
          minW: 2,
          minH: 2
        },
        dataSource: 'ds_001',
        query: {
          dimensions: ['CATEGORY'],
          measures: [
            { column: 'AMOUNT', aggregation: 'SUM', alias: 'total_amount' }
          ],
          filters: []
        },
        config: {
          orientation: 'vertical'
        }
      }
    ],
    globalFilters: [
      {
        id: 'gf_001',
        type: 'date_range',
        column: 'ORDER_DATE',
        dataSource: 'ds_001',
        value: { from: null, to: null },
        label: 'Date Range'
      }
    ],
    crossFilterLinks: [
      {
        id: 'cfl_001',
        sourceWidget: 'w_001',
        targetWidgets: ['w_002'],
        bidirectional: false,
        columnMapping: {
          CATEGORY: 'PRODUCT_CATEGORY'
        }
      }
    ],
    layout: {
      cols: 12,
      rowHeight: 80,
      margin: [8, 8],
      containerPadding: [16, 16],
      canvasBackground: 'default',
      snapToGrid: true,
      theme: 'helixbi.dark',
      responsive: { lg: 12, md: 10 }
    }
  }

  it('should successfully migrate a v1.0.0 dashboard to v2.0.0', () => {
    const migrated = migrateDashboard(v1Dashboard)

    // Verify version upgrade
    expect(migrated.version).toBe('2.0.0')

    // Verify added fields
    expect(migrated.deletedAt).toBeNull()
    expect(migrated.semanticModel).toEqual({ enabled: false, modelFile: null })

    // Verify renamed layout dimensions
    const widget = migrated.widgets[0]
    expect(widget).toBeDefined()
    expect(widget!.position.w).toBe(6)
    expect(widget!.position.h).toBe(4)
    expect((widget!.position as any).width).toBeUndefined()
    expect((widget!.position as any).height).toBeUndefined()

    // Verify default cardinality guard addition
    expect(widget!.query.cardinalityGuard).toEqual({
      enabled: true,
      maxDistinct: 10000
    })

    // Verify migration history
    expect(migrated.schemaHistory).toBeDefined()
    expect(migrated.schemaHistory.length).toBe(1)
    expect(migrated.schemaHistory[0]!.version).toBe('2.0.0')
    expect(migrated.schemaHistory[0]!.migratedBy).toBe('migration-runner')

    // Verify final schema validation succeeds
    expect(() => validateDashboardSchema(migrated)).not.toThrow()
  })

  it('should throw an error for unsupported dashboard version', () => {
    const invalidDashboard = { ...v1Dashboard, version: '999.0.0' }
    expect(() => migrateDashboard(invalidDashboard)).toThrow(
      'Unknown dashboard schema version: 999.0.0'
    )
  })
})
