import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
export const useUIStore = create()(immer((set) => ({
    sidebarOpen: true,
    activePanel: 'dashboard',
    theme: 'dark',
    setSidebarOpen: (open) => set((state) => {
        state.sidebarOpen = open;
    }),
    setActivePanel: (panel) => set((state) => {
        state.activePanel = panel;
    }),
    toggleTheme: () => set((state) => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
    }),
})));
export const useDashboardStore = create()(immer((set) => ({
    calculatedFields: [],
    widgets: [],
    addCalculatedField: (field) => set((state) => {
        state.calculatedFields.push(field);
    }),
    removeCalculatedField: (id) => set((state) => {
        state.calculatedFields = state.calculatedFields.filter((cf) => cf.id !== id);
    }),
    updateCalculatedField: (id, field) => set((state) => {
        const index = state.calculatedFields.findIndex((cf) => cf.id === id);
        if (index !== -1) {
            state.calculatedFields[index] = {
                ...state.calculatedFields[index],
                ...field,
            };
        }
    }),
    addWidget: (widget) => set((state) => {
        state.widgets.push(widget);
    }),
    removeWidget: (id) => set((state) => {
        state.widgets = state.widgets.filter((w) => w.id !== id);
    }),
    updateWidgetPosition: (id, x, y, w, h) => set((state) => {
        const index = state.widgets.findIndex((w) => w.id === id);
        if (index !== -1) {
            state.widgets[index].position = {
                ...state.widgets[index].position,
                x,
                y,
                w,
                h,
            };
        }
    }),
    setWidgets: (widgets) => set((state) => {
        state.widgets = widgets;
    }),
})));
