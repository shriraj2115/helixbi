import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { CalculatedField } from '@helixbi/types'

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
}

export const useDashboardStore = create<DashboardState>()(
  immer((set) => ({
    calculatedFields: [],
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
  })),
)

