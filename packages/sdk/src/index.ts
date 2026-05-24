import { Widget } from '@helixbi/types'

export interface VisualPlugin {
  type: string
  name: string
  render: (element: HTMLElement, widget: Widget, data: any[]) => void
  destroy?: (element: HTMLElement) => void
}

export function definePlugin(plugin: VisualPlugin): VisualPlugin {
  return plugin
}
