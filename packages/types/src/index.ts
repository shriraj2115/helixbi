export interface Dashboard {
  version: string
  id: string
  title: string
  description: string
  createdAt: string
  updatedAt: string
  createdBy: string
  orgId: string
  isPublic: boolean
  deletedAt: string | null
  dataSources: DataSource[]
  semanticModel: SemanticModelConfig
  calculatedFields: CalculatedField[]
  widgets: Widget[]
  globalFilters: GlobalFilter[]
  crossFilterLinks: CrossFilterLink[]
  layout: DashboardLayout
  schemaHistory: SchemaMigrationEntry[]
}

export interface DataSource {
  id: string
  name: string
  type: string
  config: Record<string, any>
  schema?: TableSchema
  lastRefreshedAt: string
}

export interface TableSchema {
  version: number
  columns: ColumnInfo[]
}

export interface ColumnInfo {
  name: string
  type: string
  role: 'dimension' | 'measure'
  nullable: boolean
  distinctCount?: number
  sampleValues?: string[]
  min?: number
  max?: number
  mean?: number
}

export interface SemanticModelConfig {
  enabled: boolean
  modelFile: string | null
}

export interface CalculatedField {
  id: string
  name: string
  expression: string
  dependsOn: string[]
  dataSource: string
  outputType: string
  sqlExpression?: string | null
  validated: boolean
  validatedAt: string
}

export interface Widget {
  id: string
  type: string
  title: string
  position: WidgetPosition
  dataSource: string
  query: VisualQuery
  config: Record<string, any>
  cache?: WidgetCacheConfig
  accessibility?: WidgetAccessibilityConfig
}

export interface WidgetPosition {
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

export interface VisualQuery {
  dimensions: string[]
  measures: MeasureExpr[]
  filters: FilterNode[]
  orderBy?: OrderByExpr
  limit?: number
  cardinalityGuard?: CardinalityGuardConfig
}

export interface MeasureExpr {
  column: string
  aggregation: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'
  alias: string
}

export interface FilterNode {
  column: string
  operator: 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN' | 'IN' | 'CONTAINS'
  value: any
}

export interface OrderByExpr {
  column: string
  direction: 'ASC' | 'DESC'
}

export interface CardinalityGuardConfig {
  enabled: boolean
  maxDistinct: number
}

export interface WidgetCacheConfig {
  ttlSeconds: number
  isRealtime: boolean
}

export interface WidgetAccessibilityConfig {
  ariaLabel: string
  altText: string
}

export interface GlobalFilter {
  id: string
  type: string
  column: string
  dataSource: string
  value: any
  label: string
}

export interface CrossFilterLink {
  id: string
  sourceWidget: string
  targetWidgets: string[]
  bidirectional: boolean
  columnMapping: Record<string, string>
}

export interface DashboardLayout {
  cols: number
  rowHeight: number
  margin: [number, number]
  containerPadding: [number, number]
  canvasBackground: string
  snapToGrid: boolean
  theme: string
  responsive: Record<string, number>
}

export interface SchemaMigrationEntry {
  version: string
  migratedAt: string
  migratedBy: string
}
