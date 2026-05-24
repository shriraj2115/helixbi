import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

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
