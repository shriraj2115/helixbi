import { VisualPlugin } from '@helixbi/sdk'

export class VisualRegistry {
  private plugins = new Map<string, VisualPlugin>()

  register(plugin: VisualPlugin): void {
    this.plugins.set(plugin.type, plugin)
    console.warn(`[HelixVisuals] Registered plugin: ${plugin.name} (${plugin.type})`)
  }

  get(type: string): VisualPlugin | undefined {
    return this.plugins.get(type)
  }
}

export const visualRegistry = new VisualRegistry()
