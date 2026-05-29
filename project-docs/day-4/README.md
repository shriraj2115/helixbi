# Day 4

## Goals
Implement real-time collaborative editing using Yjs and WebRTC, add column sorting and search filtering to the output datagrid, build an AI Analytical Query Copilot that generates SQL from natural language (via a local parser or cloud Gemini/OpenAI APIs), and create a dashboard version history and auto-save engine using IndexedDB.

## Work Done
- **Real-Time Collaboration**:
  - Integrated `y-webrtc` into the collaborative `@helixbi/canvas` package.
  - Built a global polyfill in `apps/web/src/main.tsx` to resolve simple-peer browser compatibility issues under Vite.
  - Created a collaboration header toolbar in `apps/web/src/App.tsx` displaying peer sync states, nickname overrides, custom avatar color settings, active user initials cards, and invite links.
  - Linked deep connection triggers so loading `?room=roomName` automatically joins the active collaboration space.
- **Advanced Datagrid**:
  - Configured click-to-sort columns in the query output datagrid, supporting three-state toggle cycling (`asc` -> `desc` -> `none`) with interactive `▲`/`▼` indicator arrows.
  - Created individual column input fields inside `thead` to perform dynamic, case-insensitive substring filters.
- **AI Query Copilot**:
  - Coded a deterministic rule-based NLP compiler in `apps/web/src/copilot.ts` mapping aggregations, column names, groupings, comparison filters, sorting, and limits to valid SQL.
  - Embedded fetch integration for OpenAI and Gemini cloud completions using keys stored in the browser's `localStorage`.
  - Added query action buttons to load/execute generated SQL, and automatically compile column select arrays to instantly spawn canvas widgets.
- **Auto-Save & Checkpoints**:
  - Coded a custom IndexedDB database controller in `apps/web/src/db.ts` to manage dashboard checkpoint histories and auto-save logs.
  - Registered a debounced Zustand subscriber (1.5s delay) to save active layout changes automatically.
  - Setup auto-loading on mount with an instructions badge prompting users to re-upload source CSV files to DuckDB WASM.
  - Built a versioning history interface to save, restore, and delete snapshots.

## Issues Faced
1. **simple-peer/WebRTC Bundling Crash**: Vite compilation threw a runtime error `global is not defined` because simple-peer (used by `y-webrtc`) relies on Node-specific global variables.
2. **Missing Types Compilation**: Rebuilding all workspace packages via Turborepo failed inside `@helixbi/engine` due to missing `ColumnProfile` types.
3. **DuckDB WASM Transience**: Restoring dashboard states from auto-saves did not sync queries because DuckDB memory does not persist across tab reloads.

## Root Cause
1. Modern web bundlers like Vite do not inject Node polyfills by default.
2. The previous model added interfaces (`ColumnProfile`, `ProfileResult`, etc.) directly into `dist/index.d.ts` or `packages/types/src/index.d.ts` but omitted them from `packages/types/src/index.ts`. Running `pnpm run build` on types regenerated `dist/` and wiped out those interfaces.
3. DuckDB WASM is a client-side database in memory; reloading the browser clears the database catalog tables.

## Solutions Tried
1. Injected a window `global = window` polyfill at the entrypoint of `main.tsx`.
2. Appended all Day 3 interfaces (`ColumnProfile`, `ProfileResult`, `QueryHistoryEntry`, `DashboardSnapshot`) into `packages/types/src/index.ts` so they compile cleanly to `dist/`.
3. Created a notification bar warning users that they must re-upload their CSV data source to re-ingest database tables.

## Final Solution
All three issues were fixed cleanly. Polyfills are loaded, workspace compiles successfully, and the database status indicator gives clear warnings on data re-ingestion.

## Technical Debt
- Heuristic query translation is regex-based and works best on simple queries. Real LLMs should be selected for complex analytics.
- WebRTC uses public signaling servers which might experience rate limits or downtime. Custom server configs can be set in the collab dropdown.

## Learnings
- Do not add types directly to compiled declaration files (`d.ts`); always put them in primary source files so the compiler packages them properly.
- Browser-native APIs like IndexedDB are highly performant and require zero bundle overhead, making them ideal for client-only auto-saves.
