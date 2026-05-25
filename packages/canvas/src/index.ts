import * as Y from 'yjs'
import { Widget } from '@helixbi/types'

export class CanvasManager {
  private doc: Y.Doc
  private ywidgets: Y.Array<any>
  private isApplyingUpdate = false

  constructor() {
    this.doc = new Y.Doc()
    this.ywidgets = this.doc.getArray('widgets')
    console.warn('[HelixCanvas] Initialized collaborative canvas Y.Doc')
  }

  getDoc(): Y.Doc {
    return this.doc
  }

  /**
   * Serializes current Zustand widgets state into the Yjs shared array.
   */
  syncStateToYjs(widgets: Widget[]): void {
    if (this.isApplyingUpdate) return
    this.doc.transact(() => {
      this.isApplyingUpdate = true
      try {
        this.ywidgets.delete(0, this.ywidgets.length)
        if (widgets.length > 0) {
          this.ywidgets.push(widgets)
        }
      } finally {
        this.isApplyingUpdate = false
      }
    })
  }

  /**
   * Subscribes to Yjs shared array updates and calls onUpdate callback.
   * Returns an unsubscribe function.
   */
  syncYjsToState(onUpdate: (widgets: Widget[]) => void): () => void {
    const observer = () => {
      if (this.isApplyingUpdate) return
      this.isApplyingUpdate = true
      try {
        const widgets = this.ywidgets.toArray() as Widget[]
        onUpdate(widgets)
      } finally {
        this.isApplyingUpdate = false
      }
    }
    this.ywidgets.observe(observer)
    return () => {
      this.ywidgets.unobserve(observer)
    }
  }
}

export const canvasManager = new CanvasManager()
