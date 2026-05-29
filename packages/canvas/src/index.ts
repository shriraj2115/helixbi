import * as Y from 'yjs'
import { Widget } from '@helixbi/types'
import { WebrtcProvider } from 'y-webrtc'

export class CanvasManager {
  private doc: Y.Doc
  private ywidgets: Y.Array<any>
  private isApplyingUpdate = false
  private provider: WebrtcProvider | null = null

  constructor() {
    this.doc = new Y.Doc()
    this.ywidgets = this.doc.getArray('widgets')
    console.warn('[HelixCanvas] Initialized collaborative canvas Y.Doc')
  }

  getDoc(): Y.Doc {
    return this.doc
  }

  connectWebRTC(roomName: string, nickname: string, color: string, onPeersChange?: (peers: any[]) => void): void {
    if (typeof window === 'undefined') return
    if (this.provider) {
      this.provider.destroy()
    }

    try {
      this.provider = new WebrtcProvider(roomName, this.doc, {
        signaling: [
          'wss://signaling.yjs.dev',
          'wss://y-webrtc-signaling-us.herokuapp.com',
          'wss://y-webrtc-signaling-de.herokuapp.com'
        ]
      })

      // Set user info in Yjs awareness
      this.provider.awareness.setLocalStateField('user', { name: nickname, color })

      if (onPeersChange) {
        const updatePeers = () => {
          if (!this.provider) return
          const states = Array.from(this.provider.awareness.getStates().values()) as any[]
          const peers = states
            .filter(state => state.user)
            .map(state => state.user)
          onPeersChange(peers)
        }

        this.provider.awareness.on('change', updatePeers)
        updatePeers()
      }
      console.warn(`[HelixCanvas] Connected to WebRTC room: ${roomName} as ${nickname}`)
    } catch (err) {
      console.error('[HelixCanvas] WebRTC Connection failed:', err)
    }
  }

  disconnectWebRTC(): void {
    if (this.provider) {
      this.provider.destroy()
      this.provider = null
      console.warn('[HelixCanvas] Disconnected WebRTC room')
    }
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

  /**
   * Reorders widgets by moving an item from one index to another.
   * Uses a delete-and-insert pattern within a Yjs transaction.
   */
  reorderWidgets(fromIndex: number, toIndex: number): Widget[] {
    const currentWidgets = this.ywidgets.toArray() as Widget[]
    if (
      fromIndex < 0 ||
      fromIndex >= currentWidgets.length ||
      toIndex < 0 ||
      toIndex >= currentWidgets.length ||
      fromIndex === toIndex
    ) {
      return currentWidgets
    }

    const reordered = [...currentWidgets]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved!)

    this.syncStateToYjs(reordered)
    return reordered
  }
}

export const canvasManager = new CanvasManager()

