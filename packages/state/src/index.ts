import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { CalculatedField, Widget } from '@helixbi/types'

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
  calculatedFields: CalculatedField[]
  addCalculatedField: (field: CalculatedField) => void
  removeCalculatedField: (id: string) => void
  updateCalculatedField: (id: string, field: Partial<CalculatedField>) => void
  widgets: Widget[]
  addWidget: (widget: Widget) => void
  removeWidget: (id: string) => void
  updateWidgetPosition: (id: string, x: number, y: number, w: number, h: number) => void
  setWidgets: (widgets: Widget[]) => void
}

export const useDashboardStore = create<DashboardState>()(
  immer((set) => ({
    calculatedFields: [],
    widgets: [],
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
  })),
)

