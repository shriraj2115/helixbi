import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { CalculatedField, Widget, GlobalFilter, DashboardSnapshot, QueryHistoryEntry } from '@helixbi/types'

interface UIState {
  sidebarOpen: boolean
  activePanel: string
  theme: 'light' | 'dark'
  setSidebarOpen: (open: boolean) => void
  setActivePanel: (panel: string) => void
  toggleTheme: () => void
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    sidebarOpen: true,
    activePanel: 'dashboard',
    theme: 'dark',
    setSidebarOpen: (open) =>
      set((state) => {
        state.sidebarOpen = open
      }),
    setActivePanel: (panel) =>
      set((state) => {
        state.activePanel = panel
      }),
    toggleTheme: () =>
      set((state) => {
        state.theme = state.theme === 'light' ? 'dark' : 'light'
      }),
  })),
)

interface DashboardState {
  title: string
  description: string
  setDashboardTitle: (title: string) => void
  setDashboardDescription: (desc: string) => void
  calculatedFields: CalculatedField[]
  addCalculatedField: (field: CalculatedField) => void
  removeCalculatedField: (id: string) => void
  updateCalculatedField: (id: string, field: Partial<CalculatedField>) => void
  widgets: Widget[]
  addWidget: (widget: Widget) => void
  removeWidget: (id: string) => void
  updateWidgetPosition: (id: string, x: number, y: number, w: number, h: number) => void
  setWidgets: (widgets: Widget[]) => void
  columnFormats: Record<string, string>
  columnLabels: Record<string, string>
  setColumnFormat: (col: string, format: string) => void
  setColumnLabel: (col: string, label: string) => void
  globalFilters: GlobalFilter[]
  addGlobalFilter: (filter: GlobalFilter) => void
  removeGlobalFilter: (id: string) => void
  clearGlobalFilters: () => void
  crossFilters: Record<string, { column: string; value: any }>
  setCrossFilter: (widgetId: string, filter: { column: string; value: any } | null) => void
  clearCrossFilters: () => void
  crossFilterExclusions: string[]
  toggleCrossFilterExclusion: (id: string) => void
  loadDashboard: (dashboardJson: any) => void
}

export const useDashboardStore = create<DashboardState>()(
  immer((set) => ({
    title: 'HelixBI Dashboard',
    description: 'Interactive Analytical Dashboard',
    calculatedFields: [],
    widgets: [],
    columnFormats: {},
    columnLabels: {},
    globalFilters: [],
    crossFilters: {},
    crossFilterExclusions: [],
    setDashboardTitle: (title) =>
      set((state) => {
        state.title = title
      }),
    setDashboardDescription: (desc) =>
      set((state) => {
        state.description = desc
      }),
    addCalculatedField: (field) =>
      set((state) => {
        state.calculatedFields.push(field)
      }),
    removeCalculatedField: (id) =>
      set((state) => {
        state.calculatedFields = state.calculatedFields.filter((cf) => cf.id !== id)
      }),
    updateCalculatedField: (id, field) =>
      set((state) => {
        const index = state.calculatedFields.findIndex((cf) => cf.id === id)
        if (index !== -1) {
          state.calculatedFields[index] = {
            ...state.calculatedFields[index]!,
            ...field,
          }
        }
      }),
    addWidget: (widget) =>
      set((state) => {
        state.widgets.push(widget)
      }),
    removeWidget: (id) =>
      set((state) => {
        state.widgets = state.widgets.filter((w) => w.id !== id)
      }),
    updateWidgetPosition: (id, x, y, w, h) =>
      set((state) => {
        const index = state.widgets.findIndex((w) => w.id === id)
        if (index !== -1) {
          state.widgets[index]!.position = {
            ...state.widgets[index]!.position,
            x,
            y,
            w,
            h,
          }
        }
      }),
    setWidgets: (widgets) =>
      set((state) => {
        state.widgets = widgets
      }),
    setColumnFormat: (col, format) =>
      set((state) => {
        state.columnFormats[col] = format
      }),
    setColumnLabel: (col, label) =>
      set((state) => {
        state.columnLabels[col] = label
      }),
    addGlobalFilter: (filter) =>
      set((state) => {
        // If a filter on this column already exists, update it, otherwise add it
        const index = state.globalFilters.findIndex((gf) => gf.column === filter.column)
        if (index !== -1) {
          state.globalFilters[index] = filter
        } else {
          state.globalFilters.push(filter)
        }
      }),
    removeGlobalFilter: (id) =>
      set((state) => {
        state.globalFilters = state.globalFilters.filter((gf) => gf.id !== id)
      }),
    clearGlobalFilters: () =>
      set((state) => {
        state.globalFilters = []
      }),
    setCrossFilter: (widgetId, filter) =>
      set((state) => {
        if (filter === null) {
          delete state.crossFilters[widgetId]
        } else {
          state.crossFilters[widgetId] = filter
        }
      }),
    clearCrossFilters: () =>
      set((state) => {
        state.crossFilters = {}
      }),
    loadDashboard: (dashboardJson) =>
      set((state) => {
        state.title = dashboardJson.title || 'HelixBI Dashboard'
        state.description = dashboardJson.description || 'Interactive Analytical Dashboard'
        state.calculatedFields = dashboardJson.calculatedFields || []
        state.widgets = dashboardJson.widgets || []
        state.columnFormats = dashboardJson.columnFormats || {}
        state.columnLabels = dashboardJson.columnLabels || {}
        state.globalFilters = dashboardJson.globalFilters || []
        state.crossFilters = {}
        state.crossFilterExclusions = dashboardJson.crossFilterExclusions || []
      }),
    toggleCrossFilterExclusion: (id) =>
      set((state) => {
        if (state.crossFilterExclusions.includes(id)) {
          state.crossFilterExclusions = state.crossFilterExclusions.filter((x) => x !== id)
        } else {
          state.crossFilterExclusions.push(id)
        }
      }),
  })),
)

const MAX_UNDO_STACK = 50

interface HistoryState {
  undoStack: DashboardSnapshot[]
  redoStack: DashboardSnapshot[]
  queryHistory: QueryHistoryEntry[]
  pushSnapshot: (snapshot: DashboardSnapshot) => void
  undo: () => DashboardSnapshot | null
  redo: () => DashboardSnapshot | null
  canUndo: () => boolean
  canRedo: () => boolean
  addQueryHistoryEntry: (entry: QueryHistoryEntry) => void
  clearQueryHistory: () => void
}

/**
 * Captures the current dashboard state as a snapshot for undo/redo.
 */
export function captureDashboardSnapshot(): DashboardSnapshot {
  const state = useDashboardStore.getState()
  return {
    title: state.title,
    description: state.description,
    calculatedFields: JSON.parse(JSON.stringify(state.calculatedFields)),
    widgets: JSON.parse(JSON.stringify(state.widgets)),
    columnFormats: { ...state.columnFormats },
    columnLabels: { ...state.columnLabels },
    globalFilters: JSON.parse(JSON.stringify(state.globalFilters)),
    crossFilterExclusions: [...state.crossFilterExclusions],
    timestamp: new Date().toISOString()
  }
}

/**
 * Restores a dashboard snapshot into the dashboard store.
 */
export function restoreDashboardSnapshot(snapshot: DashboardSnapshot): void {
  const store = useDashboardStore.getState()
  store.loadDashboard(snapshot)
}

export const useHistoryStore = create<HistoryState>()(
  immer((set, get) => ({
    undoStack: [],
    redoStack: [],
    queryHistory: [],

    pushSnapshot: (snapshot) =>
      set((state) => {
        state.undoStack.push(snapshot)
        if (state.undoStack.length > MAX_UNDO_STACK) {
          state.undoStack.shift()
        }
        // Clear redo stack on new action
        state.redoStack = []
      }),

    undo: () => {
      const state = get()
      if (state.undoStack.length === 0) return null

      // Capture current state as redo target
      const currentSnapshot = captureDashboardSnapshot()
      const previousSnapshot = state.undoStack[state.undoStack.length - 1]!

      set((s) => {
        s.undoStack.pop()
        s.redoStack.push(currentSnapshot as any)
      })

      // Restore the previous snapshot
      restoreDashboardSnapshot(previousSnapshot)
      return previousSnapshot
    },

    redo: () => {
      const state = get()
      if (state.redoStack.length === 0) return null

      // Capture current state as undo target
      const currentSnapshot = captureDashboardSnapshot()
      const nextSnapshot = state.redoStack[state.redoStack.length - 1]!

      set((s) => {
        s.redoStack.pop()
        s.undoStack.push(currentSnapshot as any)
      })

      // Restore the redo snapshot
      restoreDashboardSnapshot(nextSnapshot)
      return nextSnapshot
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    addQueryHistoryEntry: (entry) =>
      set((state) => {
        state.queryHistory.unshift(entry)
        // Keep last 100 entries
        if (state.queryHistory.length > 100) {
          state.queryHistory = state.queryHistory.slice(0, 100)
        }
      }),

    clearQueryHistory: () =>
      set((state) => {
        state.queryHistory = []
      }),
  })),
)

