import { CalculatedField, Widget } from '@helixbi/types';
interface UIState {
    sidebarOpen: boolean;
    activePanel: string;
    theme: 'light' | 'dark';
    setSidebarOpen: (open: boolean) => void;
    setActivePanel: (panel: string) => void;
    toggleTheme: () => void;
}
export declare const useUIStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<UIState>, "setState"> & {
    setState(nextStateOrUpdater: UIState | Partial<UIState> | ((state: import("immer").WritableDraft<UIState>) => void), shouldReplace?: boolean | undefined): void;
}>;
interface DashboardState {
    calculatedFields: CalculatedField[];
    addCalculatedField: (field: CalculatedField) => void;
    removeCalculatedField: (id: string) => void;
    updateCalculatedField: (id: string, field: Partial<CalculatedField>) => void;
    widgets: Widget[];
    addWidget: (widget: Widget) => void;
    removeWidget: (id: string) => void;
    updateWidgetPosition: (id: string, x: number, y: number, w: number, h: number) => void;
    setWidgets: (widgets: Widget[]) => void;
}
export declare const useDashboardStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<DashboardState>, "setState"> & {
    setState(nextStateOrUpdater: DashboardState | Partial<DashboardState> | ((state: import("immer").WritableDraft<DashboardState>) => void), shouldReplace?: boolean | undefined): void;
}>;
export {};
