import * as Y from 'yjs';
export class CanvasManager {
    doc;
    ywidgets;
    isApplyingUpdate = false;
    constructor() {
        this.doc = new Y.Doc();
        this.ywidgets = this.doc.getArray('widgets');
        console.warn('[HelixCanvas] Initialized collaborative canvas Y.Doc');
    }
    getDoc() {
        return this.doc;
    }
    /**
     * Serializes current Zustand widgets state into the Yjs shared array.
     */
    syncStateToYjs(widgets) {
        if (this.isApplyingUpdate)
            return;
        this.doc.transact(() => {
            this.isApplyingUpdate = true;
            try {
                this.ywidgets.delete(0, this.ywidgets.length);
                if (widgets.length > 0) {
                    this.ywidgets.push(widgets);
                }
            }
            finally {
                this.isApplyingUpdate = false;
            }
        });
    }
    /**
     * Subscribes to Yjs shared array updates and calls onUpdate callback.
     * Returns an unsubscribe function.
     */
    syncYjsToState(onUpdate) {
        const observer = () => {
            if (this.isApplyingUpdate)
                return;
            this.isApplyingUpdate = true;
            try {
                const widgets = this.ywidgets.toArray();
                onUpdate(widgets);
            }
            finally {
                this.isApplyingUpdate = false;
            }
        };
        this.ywidgets.observe(observer);
        return () => {
            this.ywidgets.unobserve(observer);
        };
    }
}
export const canvasManager = new CanvasManager();
