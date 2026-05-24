import * as Y from 'yjs'

export class CanvasManager {
  private doc: Y.Doc

  constructor() {
    this.doc = new Y.Doc()
    console.warn('[HelixCanvas] Initialized collaborative canvas Y.Doc')
  }

  getDoc(): Y.Doc {
    return this.doc
  }
}

export const canvasManager = new CanvasManager()
