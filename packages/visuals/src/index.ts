import { VisualPlugin } from '@helixbi/sdk'
import { Widget } from '@helixbi/types'

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

// Register Bar Chart Plugin
visualRegistry.register({
  type: 'builtin.bar_chart',
  name: 'Bar Chart',
  render: (element: HTMLElement, widget: Widget, data: any[]) => {
    element.innerHTML = ''
    if (!data || data.length === 0) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">No query results to display</div>'
      return
    }

    const dimensionKey = widget.query.dimensions[0]
    const measureExpr = widget.query.measures[0]
    if (!dimensionKey || !measureExpr) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">Configure visual query dimensions & measures</div>'
      return
    }

    const measureKey = measureExpr.alias || measureExpr.column
    const maxVal = Math.max(...data.map(d => parseFloat(d[measureKey]) || 0), 1)

    const container = document.createElement('div')
    container.style.cssText = `
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      height: 100%;
      width: 100%;
      padding: 20px 10px;
      gap: 12px;
      box-sizing: border-box;
    `

    data.forEach(item => {
      const val = parseFloat(item[measureKey]) || 0
      const label = String(item[dimensionKey] || '')
      const pct = (val / maxVal) * 80

      const barCol = document.createElement('div')
      barCol.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-grow: 1;
        max-width: 60px;
        height: 100%;
        justify-content: flex-end;
      `

      const barVal = document.createElement('span')
      barVal.innerText = val.toLocaleString()
      barVal.style.cssText = 'font-size: 0.7rem; color: #9ca3af; margin-bottom: 4px; font-family: monospace;'

      const bar = document.createElement('div')
      bar.style.cssText = `
        width: 100%;
        height: 0%;
        background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
        border-radius: 4px 4px 0 0;
        transition: height 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 4px 10px rgba(99, 102, 241, 0.15);
      `
      
      setTimeout(() => {
        bar.style.height = `${pct}%`
      }, 50)

      const barLabel = document.createElement('span')
      barLabel.innerText = label.length > 8 ? label.substring(0, 6) + '..' : label
      barLabel.title = label
      barLabel.style.cssText = 'font-size: 0.7rem; color: #9ca3af; margin-top: 6px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;'

      barCol.appendChild(barVal)
      barCol.appendChild(bar)
      barCol.appendChild(barLabel)
      container.appendChild(barCol)
    })

    element.appendChild(container)
  }
})

// Register Line Chart Plugin
visualRegistry.register({
  type: 'builtin.line_chart',
  name: 'Line Chart',
  render: (element: HTMLElement, widget: Widget, data: any[]) => {
    element.innerHTML = ''
    if (!data || data.length === 0) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">No query results to display</div>'
      return
    }

    const dimensionKey = widget.query.dimensions[0]
    const measureExpr = widget.query.measures[0]
    if (!dimensionKey || !measureExpr) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">Configure visual query dimensions & measures</div>'
      return
    }

    const measureKey = measureExpr.alias || measureExpr.column
    const values = data.map(d => parseFloat(d[measureKey]) || 0)
    const maxVal = Math.max(...values, 1)
    const minVal = Math.min(...values, 0)
    const range = maxVal - minVal || 1

    const width = element.clientWidth || 350
    const height = element.clientHeight || 200
    const paddingX = 40
    const paddingY = 25

    const chartW = width - paddingX * 2
    const chartH = height - paddingY * 2

    const points = data.map((item, idx) => {
      const val = parseFloat(item[measureKey]) || 0
      const x = paddingX + (idx / (data.length - 1 || 1)) * chartW
      const y = paddingY + chartH - ((val - minVal) / range) * chartH
      return { x, y, label: String(item[dimensionKey] || ''), val }
    })

    const pathData = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const areaPathData = points.length > 0 
      ? `${pathData} L ${points[points.length - 1]!.x} ${paddingY + chartH} L ${points[0]!.x} ${paddingY + chartH} Z`
      : ''

    element.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible; background: transparent; display: block; box-sizing: border-box;">
        <defs>
          <linearGradient id="area-grad-${widget.id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <!-- Grid lines -->
        <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="rgba(255,255,255,0.03)" />
        <line x1="${paddingX}" y1="${paddingY + chartH / 2}" x2="${width - paddingX}" y2="${paddingY + chartH / 2}" stroke="rgba(255,255,255,0.03)" />
        <line x1="${paddingX}" y1="${paddingY + chartH}" x2="${width - paddingX}" y2="${paddingY + chartH}" stroke="rgba(255,255,255,0.08)" />

        <!-- Area representation -->
        ${points.length > 0 ? `<path d="${areaPathData}" fill="url(#area-grad-${widget.id})"/>` : ''}

        <!-- Line representation -->
        ${points.length > 0 ? `<path d="${pathData}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

        <!-- Point circles -->
        ${points.map(p => `
          <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#10b981" stroke="#0f111a" stroke-width="1.5" style="cursor: pointer;" title="${p.label}: ${p.val}"/>
        `).join('')}

        <!-- Labels -->
        ${points.map((p, idx) => {
          if (data.length > 6 && idx % Math.ceil(data.length / 5) !== 0) return ''
          const shortLabel = p.label.length > 8 ? p.label.substring(0, 5) + '..' : p.label
          return `<text x="${p.x}" y="${paddingY + chartH + 16}" fill="#9ca3af" font-size="8.5" font-family="system-ui, sans-serif" text-anchor="middle">${shortLabel}</text>`
        }).join('')}
      </svg>
    `
  }
})
