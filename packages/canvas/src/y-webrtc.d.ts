declare module 'y-webrtc' {
  import * as Y from 'yjs'

  export interface WebrtcProviderOptions {
    signaling?: string[]
    password?: string | null
    awareness?: any
    maxConns?: number
    filterBcConns?: boolean
    peerOpts?: any
  }

  export class WebrtcProvider {
    constructor(roomName: string, doc: Y.Doc, opts?: WebrtcProviderOptions)
    roomName: string
    doc: Y.Doc
    awareness: any
    connected: boolean
    connect(): void
    disconnect(): void
    destroy(): void
  }
}
