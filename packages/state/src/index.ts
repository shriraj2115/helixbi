import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { CalculatedField, Widget, GlobalFilter } from '@helixbi/types'

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
      }),
  })),
)

