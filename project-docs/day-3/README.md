# Day 3

## Goals
Implement automated data column profiling in the engine, build a snapshot-based undo/redo state machine, add three new visual chart plugins (donut chart, scatter plot, sparkline), implement drag-and-drop widget reordering with Yjs sync, create a collapsible query history panel, and build a glassmorphism drill-down modal for raw data inspection.

## Work Done
- Added `ColumnProfile`, `ProfileResult`, `QueryHistoryEntry`, and `DashboardSnapshot` types to `@helixbi/types`.
- Created `profiler.ts` in `@helixbi/engine` — a DuckDB SQL generator that classifies columns by type (numeric, string, temporal, boolean) and produces appropriate aggregate queries (min/max/mean/median/stddev for numerics, distinct count/avg length/top-5 values for strings, min/max date for temporals).
- Added 17 comprehensive unit tests for the profiler in `profiler.test.ts` — all passing.
- Built `useHistoryStore` in `@helixbi/state` — snapshot-based undo/redo with a 50-deep stack, `captureDashboardSnapshot()` and `restoreDashboardSnapshot()` helper functions, and query history tracking (last 100 entries).
- Registered 3 new visual plugins in `@helixbi/visuals`:
  - **Donut Chart** (`builtin.donut_chart`): SVG arc segments with cross-filtering, center label showing formatted total, percentage tooltips, and 10-color palette.
  - **Scatter Plot** (`builtin.scatter_plot`): SVG dots with animated entrance, grid lines with value labels, cross-filter on click, and hover tooltips.
  - **Sparkline** (`builtin.sparkline`): Compact inline SVG trend line with gradient fill, min/max circle indicators, and trend arrow (↑/↓) with color coding.
- Added `reorderWidgets(fromIndex, toIndex)` to `CanvasManager` in `@helixbi/canvas` for drag-and-drop widget reordering with Yjs transacted sync.
- Major `apps/web` App.tsx update:
  - Undo/Redo toolbar buttons with `Ctrl+Z` / `Ctrl+Shift+Z` keyboard shortcuts.
  - Data Profiler panel (Section 10) with progress bar and per-column statistics cards showing mini distribution bars for categorical columns.
  - Query History panel — collapsible list of past queries with timestamps, execution time, row count, and click-to-rerun.
  - Drag-and-drop widget reordering with visual ghost/placeholder effects.
  - Drill-down modal with glassmorphism backdrop — clicking the 🔎 button on a widget opens a modal showing filtered raw data rows.
  - 3 new chart types (Donut Chart, Scatter Plot, Sparkline) in the Widget Composer dropdown.
  - All mutations (add/delete field, add/delete widget, import config, reorder, add filter, rename) now push undo snapshots before executing.
- Added ~470 lines of new CSS: profiler cards, query history panel, drag-and-drop effects, drill-down modal, undo/redo toolbar, and all corresponding light theme overrides.
- All 51 tests pass (8 test files), TypeScript typecheck passes with zero errors.

## Issues Faced
1. **Undo/Redo with Yjs Sync**: Restoring a snapshot needed to also sync the restored widget array back to Yjs to avoid the canvas showing stale data.
2. **Sparkline dimension handling**: Sparklines need a dimension for trend data even though they display like KPI cards, requiring special handling in the widget composer.
3. **Profiler column type detection**: DuckDB type strings like `DECIMAL(10,2)` or `TIMESTAMP WITH TIME ZONE` needed substring matching rather than exact matching.

## Root Cause
1. The undo/redo functions only called `loadDashboard()` on the Zustand store but didn't call `canvasManager.syncStateToYjs()`. Yjs kept the old widget array.
2. The widget composer disabled dimension selection for KPI cards, but sparklines also need dimension-free configuration while still accepting an optional dimension.
3. DuckDB returns verbose type names with parameters; `classifyColumnType` needed `includes()` checks rather than `===` comparisons.

## Solutions Tried
1. Added `canvasManager.syncStateToYjs(snapshot.widgets)` call after every `undo()` and `redo()` invocation.
2. Updated the widget composer form to allow sparklines alongside KPI cards in the "measure-only" conditional branch, with optional dimension support.
3. Used `toUpperCase().includes()` pattern matching for type classification, covering all DuckDB type variants.

## Final Solution
All solutions were applied directly. 51 tests pass, zero TypeScript errors, all visual plugins register correctly.

## Tradeoffs
- Undo/redo uses full JSON snapshots (deep clone) rather than operation-based diffing — simpler to implement but uses more memory for large dashboards. Mitigated by capping at 50 entries.
- Data profiler runs queries sequentially per column rather than in parallel — simpler but slower for 100+ column tables. Progress bar provides user feedback.
- Drill-down is single-level (dimension → raw rows) rather than multi-level chaining — sufficient for Day 3 scope.

## Technical Debt
- The profiler progress bar uses React state updates inside a loop, which could batch updates in strict mode. Works correctly in production builds.
- The `@helixbi/state` package still has compiled `.d.ts` and `.js` artifacts checked in alongside `.ts` source files.

## Risks
- Large CSV files (1M+ rows) may cause the profiler to run slowly since it computes full-table aggregates. Future optimization: sample-based profiling.

## Learnings
- Snapshot-based undo/redo is significantly simpler to implement than command-pattern undo/redo for complex state trees with multiple interdependent stores.
- SVG donut charts require careful arc path computation — the `large-arc-flag` in SVG arc commands must be set when the arc angle exceeds π radians.
- DuckDB WASM's `MEDIAN()` aggregate is a convenient built-in that doesn't exist in most SQL engines — excellent for data profiling use cases.

## Next Day Plan
1. Implement real-time collaborative editing with WebRTC + Yjs sync provider.
2. Add column sorting and filtering to the output datagrid.
3. Build a natural language query interface using LLM-generated SQL.
4. Add dashboard versioning and auto-save to IndexedDB.
