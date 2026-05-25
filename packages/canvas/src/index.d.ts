import * as Y from 'yjs';
import { Widget } from '@helixbi/types';
export declare class CanvasManager {
    private doc;
    private ywidgets;
    private isApplyingUpdate;
    constructor();
    getDoc(): Y.Doc;
    /**
     * Serializes current Zustand widgets state into the Yjs shared array.
     */
    syncStateToYjs(widgets: Widget[]): void;
    /**
     * Subscribes to Yjs shared array updates and calls onUpdate callback.
     * Returns an unsubscribe function.
     */
    syncYjsToState(onUpdate: (widgets: Widget[]) => void): () => void;
}
export declare const canvasManager: CanvasManager;
