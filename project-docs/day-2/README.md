# Day 2

## Goals
Build the visual dashboard canvas with live chart rendering, implement Bar Chart and Line Chart visual plugins with SVG rendering, add a KPI Card plugin, set up Yjs collaborative document sync, create the visual query compiler that translates widget configurations to DuckDB SQL, implement semantic models with cell display formatting, build dashboard import/export system, add cross-filtering between widgets, implement global dashboard filters, enable datagrid export (CSV/Parquet), and add cardinality guards to prevent rendering overload.

## Work Done

### Visual Dashboard Canvas & Chart Plugins (`@helixbi/visuals`, `@helixbi/sdk`)
- Defined `VisualPlugin` interface in `@helixbi/sdk` — `type`, `name`, `render(element, widget, data)`, optional `destroy`.
- Created `VisualRegistry` class in `@helixbi/visuals` with `register()` and `get()` methods.
- Implemented **Bar Chart** plugin (`builtin.bar_chart`): Pure DOM rendering with animated bar heights using CSS transitions, gradient fills (`#6366f1` → `#4f46e5`), value labels above bars, truncated x-axis labels with tooltips.
- Implemented **Line Chart** plugin (`builtin.line_chart`): SVG polyline with area gradient fill, grid lines, dot circles at data points, responsive axis labels.
- Implemented **KPI Card** plugin (`builtin.kpi_card`): Large centered value display with JetBrains Mono font, text shadow, uppercase label subtitle.
- All three plugins read `columnFormats` from the dashboard store for semantic value formatting.

### Yjs Collaborative Canvas (`@helixbi/canvas`)
- Created `CanvasManager` class wrapping a `Y.Doc` with a shared `Y.Array<Widget>` named `'widgets'`.
- `syncStateToYjs(widgets)`: Serializes Zustand widget array into Yjs using transacted delete+push.
- `syncYjsToState(onUpdate)`: Subscribes to Yjs array observations and calls back with the updated widget list.
- Implemented `isApplyingUpdate` guard to prevent infinite sync loops between Zustand → Yjs → Zustand.

### Visual Query Compiler (`@helixbi/engine`)
- Created `compileVisualQueryToSQL()` in `formula/query.ts`: Translates `VisualQuery` configurations (dimensions, measures with aggregations, filters, orderBy, limit) into DuckDB SQL.
- Handles `DISTINCT` projection for dimension-only queries.
- Compiles `FilterNode` objects with operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `IN`, `CONTAINS`.
- Generates `GROUP BY` clauses automatically when both dimensions and measures are present.
- Wrote 5 comprehensive unit tests in `query.test.ts`.

### Semantic Models & Cell Display Formatting (`@helixbi/semantic`)
- Implemented `formatValue(value, format)` — formats raw database values based on semantic display metadata.
- Supports `currency` (USD via `Intl.NumberFormat`), `percentage`, `number` (with thousands separators), and `default` formats.
- Handles edge cases: null/undefined, booleans, non-numeric strings.
- Wrote 4 unit tests in `formatter.test.ts`.

### Dashboard State Expansion (`@helixbi/state`)
- Extended `useDashboardStore` with:
  - `widgets`, `addWidget()`, `removeWidget()`, `updateWidgetPosition()`, `setWidgets()`
  - `columnFormats`, `columnLabels`, `setColumnFormat()`, `setColumnLabel()`
  - `globalFilters`, `addGlobalFilter()`, `removeGlobalFilter()`, `clearGlobalFilters()`
  - `crossFilters`, `setCrossFilter()`, `clearCrossFilters()`
  - `crossFilterExclusions`, `toggleCrossFilterExclusion()`
  - `loadDashboard()` — bulk state restoration for import
- Wrote 2 state integration tests in `state.test.ts`.

### Types Expansion (`@helixbi/types`)
- Added `Widget`, `WidgetPosition`, `VisualQuery`, `MeasureExpr`, `FilterNode`, `OrderByExpr`, `CardinalityGuardConfig`, `WidgetCacheConfig`, `WidgetAccessibilityConfig`, `GlobalFilter`, `CrossFilterLink`, `DashboardLayout`, `TableSchema`, `ColumnInfo`, `SemanticModelConfig`, `DataSource`.
- Full Dashboard type with all nested references for schema v2.0.0 compliance.

### Web Application (`apps/web`)
- **Widget Composer** (Section 4): Form to create visual widgets with title, chart type (bar/line/KPI), dimension/measure selectors from available columns, aggregation selector (SUM/AVG/COUNT/MIN/MAX), and result limit (Top N).
- **Semantic Formatting Panel** (Section 5): Per-column display label override and value format selector (Default/Currency/Percentage/Number).
- **Cross-Filtering Exclusions** (Section 6): Checkbox list to exclude specific widgets from cross-filter interactions.
- **Dashboard Visual Canvas** (Section 9): Grid layout rendering all widgets with live DuckDB queries, cardinality warnings, and delete buttons.
- **Global Filter Bar**: Column/value selector with active filter badges and clear buttons.
- **Dashboard Import/Export**: Export to JSON (v2.0.0 schema), import with validation, canvas image export to PNG via SVG foreignObject.
- **Datagrid Export**: Export current SQL query results to CSV or Parquet format via DuckDB's `COPY TO` command.
- **Cross-Filtering**: Clicking a bar/line chart data point sets a cross-filter that propagates to all non-excluded widgets. Visual feedback with opacity dimming on non-selected bars/points.
- **Cardinality Guards**: Widgets display warning banner when result count reaches the `maxDistinct` threshold.
- **Dashboard Title/Description Editing**: Inline editing with click-to-edit and Enter-to-save.
- **Theme Toggle**: Dark/Light mode switch with full CSS variable system.
- Added ~350 lines of new CSS covering widget cards, canvas grid, semantic panel, global filter bar, autocomplete, light theme overrides.

## Issues Faced
1. **Yjs Infinite Loop**: Setting Zustand state from a Yjs observer triggered a Zustand subscription which re-synced to Yjs, creating an infinite loop.
2. **Arrow Table BigInt**: DuckDB WASM returns `BigInt` values for COUNT aggregates, which can't be serialized to JSON or displayed directly.
3. **SVG foreignObject Export**: Canvas image export failed because CSS custom properties (`var(--bg-color)`) were not resolved inside the SVG foreignObject context.
4. **Cross-Filter State Leaking**: Cross-filters from one widget were being applied back to the source widget itself, creating self-referencing filter loops.
5. **ESLint `exhaustive-deps` Warning**: React `useEffect` hooks depending on `loadFilterOptions` triggered exhaustive-deps warnings.

## Root Cause
1. No guard existed to prevent re-entrant sync between the two state systems.
2. JavaScript `BigInt` is not supported by `JSON.stringify` or string interpolation without explicit conversion.
3. The SVG foreignObject clones the DOM but doesn't inherit the page's CSS cascade for custom properties.
4. The cross-filter composition loop iterated all entries including the current widget's own ID.
5. `loadFilterOptions` was defined inside the component body and recreated on every render.

## Solutions Tried
1. Added `isApplyingUpdate` boolean guard in `CanvasManager` — blocks observer callbacks during programmatic Yjs writes and vice versa.
2. Added `typeof val === 'bigint' ? val.toString() : val` conversion in the Arrow-to-JS row mapper.
3. Inlined all stylesheet rules into the SVG `<style>` tag and added explicit fallback colors.
4. Added `otherWidgetId !== widget.id` check in the cross-filter composition loop.
5. Suppressed with appropriate effect dependency arrays; `loadFilterOptions` is conditionally called.

## Final Solution
All 5 issues resolved. 34 tests pass across all packages with zero TypeScript compile errors.

## Tradeoffs
- Bar/Line charts use pure DOM/SVG rather than a charting library (D3, Chart.js) — gives full control and zero bundle bloat but requires manual layout math.
- Cross-filtering is widget-to-widget rather than schema-level — simpler to implement but doesn't support column mapping between different data sources.
- Dashboard export captures widget config but not the underlying CSV data — users must re-import their data file.

## Technical Debt
- Canvas widget layout uses CSS Grid `auto-fill` rather than a proper drag-and-drop grid system (e.g., react-grid-layout).
- The `CanvasManager` uses a local-only Yjs `Y.Doc` without a WebRTC or WebSocket sync provider — collaboration is local-only for now.
- `apps/web/App.tsx` has grown to 1440 lines — should be decomposed into component files.

## Risks
- The monolithic `App.tsx` is becoming difficult to navigate. Component decomposition should be prioritized.
- Canvas image export via SVG foreignObject has known cross-browser inconsistencies (especially in Safari).

## Learnings
- Yjs's transacted array operations (`doc.transact()`) are essential for batching multiple mutations to avoid intermediate observer fires.
- DuckDB WASM's `COPY TO` command can generate Parquet files entirely in-browser — a powerful feature for data engineering workflows.
- CSS custom properties in SVG foreignObject require explicit fallback values since the SVG context may not inherit the page's `:root` declarations.
- Cross-filtering UX benefits enormously from opacity dimming — users instantly understand which data points are "active" vs "filtered out".

## Next Day Plan
1. Implement automated data column profiling (min/max/mean/stddev for numerics, top-5 values for strings).
2. Build a snapshot-based undo/redo state machine.
3. Add new visual plugins: Donut Chart, Scatter Plot, Sparkline.
4. Implement drag-and-drop widget reordering.
5. Create a query history panel with click-to-rerun.
