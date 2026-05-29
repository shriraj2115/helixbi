import { VisualPlugin } from '@helixbi/sdk'
import { Widget } from '@helixbi/types'
import { useDashboardStore } from '@helixbi/state'
import { formatValue } from '@helixbi/semantic'

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

      const { columnFormats, crossFilters } = useDashboardStore.getState()
      const format = columnFormats[measureExpr.column] || 'default'
      const formattedVal = formatValue(val, format)

      const barVal = document.createElement('span')
      barVal.innerText = formattedVal
      barVal.style.cssText = 'font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px; font-family: monospace;'

      const bar = document.createElement('div')
      
      const activeCross = crossFilters[widget.id]
      const isSelected = activeCross && activeCross.value === label
      const isAnySelected = !!activeCross

      bar.style.cssText = `
        width: 100%;
        height: 0%;
        background: ${isSelected ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)' : 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)'};
        border-radius: 4px 4px 0 0;
        transition: height 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s, background 0.2s;
        box-shadow: ${isSelected ? '0 0 15px rgba(16, 185, 129, 0.4)' : '0 4px 10px rgba(99, 102, 241, 0.15)'};
        cursor: pointer;
        opacity: ${isAnySelected && !isSelected ? '0.3' : '1'};
      `
      
      bar.addEventListener('click', () => {
        const currentCross = useDashboardStore.getState().crossFilters[widget.id]
        if (currentCross && currentCross.value === label) {
          useDashboardStore.getState().setCrossFilter(widget.id, null)
        } else {
          useDashboardStore.getState().setCrossFilter(widget.id, {
            column: dimensionKey,
            value: label
          })
        }
      })
      
      setTimeout(() => {
        bar.style.height = `${pct}%`
      }, 50)

      const barLabel = document.createElement('span')
      barLabel.innerText = label.length > 8 ? label.substring(0, 6) + '..' : label
      barLabel.title = label
      barLabel.style.cssText = 'font-size: 0.7rem; color: var(--text-muted); margin-top: 6px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;'

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
        <line x1="${paddingX}" y1="${paddingY}" x2="${width - paddingX}" y2="${paddingY}" stroke="var(--line-grid-minor, rgba(255,255,255,0.03))" />
        <line x1="${paddingX}" y1="${paddingY + chartH / 2}" x2="${width - paddingX}" y2="${paddingY + chartH / 2}" stroke="var(--line-grid-minor, rgba(255,255,255,0.03))" />
        <line x1="${paddingX}" y1="${paddingY + chartH}" x2="${width - paddingX}" y2="${paddingY + chartH}" stroke="var(--line-grid-major, rgba(255,255,255,0.08))" />

        <!-- Area representation -->
        ${points.length > 0 ? `<path d="${areaPathData}" fill="url(#area-grad-${widget.id})"/>` : ''}

        <!-- Line representation -->
        ${points.length > 0 ? `<path d="${pathData}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

        <!-- Point circles -->
        ${points.map(p => {
          const { columnFormats, crossFilters } = useDashboardStore.getState()
          const format = columnFormats[measureExpr.column] || 'default'
          const formattedVal = formatValue(p.val, format)
          
          const activeCross = crossFilters[widget.id]
          const isSelected = activeCross && activeCross.value === p.label
          const isAnySelected = !!activeCross
          
          const fill = isSelected ? '#10b981' : (isAnySelected ? 'rgba(16, 185, 129, 0.2)' : '#10b981')
          const radius = isSelected ? '5.5' : '3.5'
          const stroke = isSelected ? '#ffffff' : 'var(--surface-color)'
          
          return `<circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor: pointer; transition: all 0.2s;" title="${p.label}: ${formattedVal}" data-label="${p.label}"/>`
        }).join('')}

        <!-- Labels -->
        ${points.map((p, idx) => {
          if (data.length > 6 && idx % Math.ceil(data.length / 5) !== 0) return ''
          const shortLabel = p.label.length > 8 ? p.label.substring(0, 5) + '..' : p.label
          return `<text x="${p.x}" y="${paddingY + chartH + 16}" fill="var(--text-muted)" font-size="8.5" font-family="system-ui, sans-serif" text-anchor="middle">${shortLabel}</text>`
        }).join('')}
      </svg>
    `

    // Attach click listeners to all circles for cross-filtering
    const circles = element.querySelectorAll('circle')
    circles.forEach((circle) => {
      circle.addEventListener('click', (e) => {
        const label = (e.currentTarget as HTMLElement).getAttribute('data-label')
        if (label === null) return
        const currentCross = useDashboardStore.getState().crossFilters[widget.id]
        if (currentCross && currentCross.value === label) {
          useDashboardStore.getState().setCrossFilter(widget.id, null)
        } else {
          useDashboardStore.getState().setCrossFilter(widget.id, {
            column: dimensionKey,
            value: label
          })
        }
      })
    })
  }
})

// Register KPI Card Plugin
visualRegistry.register({
  type: 'builtin.kpi_card',
  name: 'KPI Card',
  render: (element: HTMLElement, widget: Widget, data: any[]) => {
    element.innerHTML = ''
    const measureExpr = widget.query.measures[0]
    if (!measureExpr) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">Configure measures</div>'
      return
    }

    const measureKey = measureExpr.alias || measureExpr.column
    const rawVal = data.length > 0 ? data[0][measureKey] : 0
    const val = parseFloat(rawVal) || 0

    const { columnFormats } = useDashboardStore.getState()
    const format = columnFormats[measureExpr.column] || 'default'
    const formattedVal = formatValue(val, format)

    const container = document.createElement('div')
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    `

    const valueEl = document.createElement('div')
    valueEl.innerText = formattedVal
    valueEl.style.cssText = `
      font-size: 2.2rem;
      font-weight: 700;
      color: var(--secondary-color);
      font-family: 'JetBrains Mono', monospace;
      margin-bottom: 4px;
      text-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
    `

    const labelEl = document.createElement('div')
    labelEl.innerText = widget.title
    labelEl.style.cssText = `
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    `

    container.appendChild(valueEl)
    container.appendChild(labelEl)
    element.appendChild(container)
  }
})

// Register Donut Chart Plugin
visualRegistry.register({
  type: 'builtin.donut_chart',
  name: 'Donut Chart',
  render: (element: HTMLElement, widget: Widget, data: any[]) => {
    element.innerHTML = ''
    if (!data || data.length === 0) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">No query results to display</div>'
      return
    }

    const dimensionKey = widget.query.dimensions[0]
    const measureExpr = widget.query.measures[0]
    if (!dimensionKey || !measureExpr) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">Configure visual query dimensions &amp; measures</div>'
      return
    }

    const measureKey = measureExpr.alias || measureExpr.column
    const total = data.reduce((sum, d) => sum + (parseFloat(d[measureKey]) || 0), 0)
    if (total === 0) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">All values are zero</div>'
      return
    }

    const { columnFormats, crossFilters } = useDashboardStore.getState()
    const format = columnFormats[measureExpr.column] || 'default'
    const formattedTotal = formatValue(total, format)

    const size = Math.min(element.clientWidth || 200, element.clientHeight || 200)
    const cx = (element.clientWidth || 200) / 2
    const cy = (element.clientHeight || 200) / 2
    const outerR = (size / 2) - 10
    const innerR = outerR * 0.6

    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16']
    const activeCross = crossFilters[widget.id]

    let currentAngle = -Math.PI / 2
    const arcs = data.map((item, idx) => {
      const val = parseFloat(item[measureKey]) || 0
      const label = String(item[dimensionKey] || '')
      const pct = val / total
      const angle = pct * Math.PI * 2
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle = endAngle

      const x1 = cx + outerR * Math.cos(startAngle)
      const y1 = cy + outerR * Math.sin(startAngle)
      const x2 = cx + outerR * Math.cos(endAngle)
      const y2 = cy + outerR * Math.sin(endAngle)
      const ix1 = cx + innerR * Math.cos(endAngle)
      const iy1 = cy + innerR * Math.sin(endAngle)
      const ix2 = cx + innerR * Math.cos(startAngle)
      const iy2 = cy + innerR * Math.sin(startAngle)
      const largeArc = angle > Math.PI ? 1 : 0

      const isSelected = activeCross && activeCross.value === label
      const isAnySelected = !!activeCross
      const color = colors[idx % colors.length]
      const opacity = isAnySelected && !isSelected ? 0.25 : 1
      const scale = isSelected ? 'transform: scale(1.04); transform-origin: center;' : ''

      const path = [
        `M ${x1} ${y1}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix1} ${iy1}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
        `Z`
      ].join(' ')

      const formattedVal = formatValue(val, format)
      return `<path d="${path}" fill="${color}" opacity="${opacity}" style="cursor:pointer;transition:opacity 0.2s,transform 0.2s;${scale}" data-label="${label}" title="${label}: ${formattedVal} (${(pct * 100).toFixed(1)}%)"/>`
    })

    element.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${element.clientWidth || 200} ${element.clientHeight || 200}" style="display:block;">
        ${arcs.join('\n')}
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="var(--text-color, #f3f4f6)" font-size="1.1rem" font-weight="700" font-family="'JetBrains Mono', monospace">${formattedTotal}</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="var(--text-muted, #9ca3af)" font-size="0.6rem" font-family="system-ui, sans-serif">TOTAL</text>
      </svg>
    `

    // Cross-filter click handlers
    element.querySelectorAll('path').forEach((path) => {
      path.addEventListener('click', (e) => {
        const label = (e.currentTarget as HTMLElement).getAttribute('data-label')
        if (label === null) return
        const currentCross = useDashboardStore.getState().crossFilters[widget.id]
        if (currentCross && currentCross.value === label) {
          useDashboardStore.getState().setCrossFilter(widget.id, null)
        } else {
          useDashboardStore.getState().setCrossFilter(widget.id, {
            column: dimensionKey,
            value: label
          })
        }
      })
    })
  }
})

// Register Scatter Plot Plugin
visualRegistry.register({
  type: 'builtin.scatter_plot',
  name: 'Scatter Plot',
  render: (element: HTMLElement, widget: Widget, data: any[]) => {
    element.innerHTML = ''
    if (!data || data.length === 0) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">No query results to display</div>'
      return
    }

    const dimensionKey = widget.query.dimensions[0]
    const measureExpr = widget.query.measures[0]
    if (!dimensionKey || !measureExpr) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">Configure visual query dimensions &amp; measures</div>'
      return
    }

    const measureKey = measureExpr.alias || measureExpr.column
    const values = data.map(d => parseFloat(d[measureKey]) || 0)
    const maxVal = Math.max(...values, 1)
    const minVal = Math.min(...values, 0)
    const range = maxVal - minVal || 1

    const width = element.clientWidth || 350
    const height = element.clientHeight || 200
    const paddingX = 45
    const paddingY = 25
    const chartW = width - paddingX * 2
    const chartH = height - paddingY * 2

    const { columnFormats, crossFilters } = useDashboardStore.getState()
    const format = columnFormats[measureExpr.column] || 'default'
    const activeCross = crossFilters[widget.id]

    const dots = data.map((item, idx) => {
      const val = parseFloat(item[measureKey]) || 0
      const label = String(item[dimensionKey] || '')
      const x = paddingX + (idx / (data.length - 1 || 1)) * chartW
      const y = paddingY + chartH - ((val - minVal) / range) * chartH
      const formattedVal = formatValue(val, format)

      const isSelected = activeCross && activeCross.value === label
      const isAnySelected = !!activeCross

      const dotSize = isSelected ? 7 : 5
      const fill = isSelected ? '#f59e0b' : (isAnySelected ? 'rgba(99, 102, 241, 0.2)' : '#6366f1')
      const stroke = isSelected ? '#ffffff' : 'none'

      return `<circle cx="${x}" cy="${y}" r="${dotSize}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" style="cursor:pointer;transition:all 0.2s;" data-label="${label}" title="${label}: ${formattedVal}">
        <animate attributeName="cy" from="${paddingY + chartH}" to="${y}" dur="0.5s" fill="freeze"/>
        <animate attributeName="opacity" from="0" to="1" dur="0.4s" fill="freeze"/>
      </circle>`
    })

    // Grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
      const y = paddingY + chartH * (1 - pct)
      const val = minVal + range * pct
      return `
        <line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="var(--line-grid-minor, rgba(255,255,255,0.04))" stroke-dasharray="3,3"/>
        <text x="${paddingX - 6}" y="${y + 3}" fill="var(--text-muted)" font-size="7" font-family="system-ui, sans-serif" text-anchor="end">${formatValue(val, format)}</text>
      `
    })

    // X-axis labels
    const xLabels = data.map((item, idx) => {
      if (data.length > 8 && idx % Math.ceil(data.length / 6) !== 0) return ''
      const x = paddingX + (idx / (data.length - 1 || 1)) * chartW
      const label = String(item[dimensionKey] || '')
      const shortLabel = label.length > 7 ? label.substring(0, 5) + '..' : label
      return `<text x="${x}" y="${paddingY + chartH + 16}" fill="var(--text-muted)" font-size="8" font-family="system-ui, sans-serif" text-anchor="middle">${shortLabel}</text>`
    })

    element.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible;display:block;">
        ${gridLines.join('')}
        ${dots.join('')}
        ${xLabels.join('')}
        <line x1="${paddingX}" y1="${paddingY + chartH}" x2="${width - paddingX}" y2="${paddingY + chartH}" stroke="var(--line-grid-major, rgba(255,255,255,0.08))"/>
      </svg>
    `

    // Cross-filter click handlers
    element.querySelectorAll('circle').forEach((circle) => {
      circle.addEventListener('click', (e) => {
        const label = (e.currentTarget as HTMLElement).getAttribute('data-label')
        if (label === null) return
        const currentCross = useDashboardStore.getState().crossFilters[widget.id]
        if (currentCross && currentCross.value === label) {
          useDashboardStore.getState().setCrossFilter(widget.id, null)
        } else {
          useDashboardStore.getState().setCrossFilter(widget.id, {
            column: dimensionKey,
            value: label
          })
        }
      })
    })
  }
})

// Register Sparkline Plugin
visualRegistry.register({
  type: 'builtin.sparkline',
  name: 'Sparkline',
  render: (element: HTMLElement, widget: Widget, data: any[]) => {
    element.innerHTML = ''
    if (!data || data.length === 0) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">No data</div>'
      return
    }

    const measureExpr = widget.query.measures[0]
    if (!measureExpr) {
      element.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:0.8rem;">Configure measures</div>'
      return
    }

    const measureKey = measureExpr.alias || measureExpr.column
    const values = data.map(d => parseFloat(d[measureKey]) || 0)
    const maxVal = Math.max(...values, 1)
    const minVal = Math.min(...values, 0)
    const range = maxVal - minVal || 1

    const { columnFormats } = useDashboardStore.getState()
    const format = columnFormats[measureExpr.column] || 'default'

    const width = element.clientWidth || 300
    const height = element.clientHeight || 80
    const padX = 12
    const padY = 24

    const chartW = width - padX * 2
    const chartH = height - padY * 2

    const points = values.map((val, idx) => {
      const x = padX + (idx / (values.length - 1 || 1)) * chartW
      const y = padY + chartH - ((val - minVal) / range) * chartH
      return { x, y, val }
    })

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const areaPath = points.length > 0
      ? `${linePath} L ${points[points.length - 1]!.x} ${padY + chartH} L ${points[0]!.x} ${padY + chartH} Z`
      : ''

    // Find min and max points for indicators
    const minIdx = values.indexOf(Math.min(...values))
    const maxIdx = values.indexOf(Math.max(...values))
    const lastVal = values[values.length - 1] || 0
    const firstVal = values[0] || 0
    const trend = lastVal >= firstVal ? '↑' : '↓'
    const trendColor = lastVal >= firstVal ? '#10b981' : '#ef4444'
    const lineColor = lastVal >= firstVal ? '#10b981' : '#ef4444'

    element.innerHTML = `
      <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="display:block;overflow:visible;">
        <defs>
          <linearGradient id="spark-grad-${widget.id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${areaPath ? `<path d="${areaPath}" fill="url(#spark-grad-${widget.id})"/>` : ''}
        <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <animate attributeName="stroke-dashoffset" from="1000" to="0" dur="1s" fill="freeze"/>
        </path>
        ${points[minIdx] ? `<circle cx="${points[minIdx]!.x}" cy="${points[minIdx]!.y}" r="3" fill="#ef4444" stroke="var(--surface-color)" stroke-width="1.5"/>` : ''}
        ${points[maxIdx] ? `<circle cx="${points[maxIdx]!.x}" cy="${points[maxIdx]!.y}" r="3" fill="#10b981" stroke="var(--surface-color)" stroke-width="1.5"/>` : ''}
        <text x="${padX}" y="${padY - 8}" fill="var(--text-muted)" font-size="8" font-family="system-ui, sans-serif">
          ${formatValue(minVal, format)} — ${formatValue(maxVal, format)}
        </text>
        <text x="${width - padX}" y="${padY - 8}" fill="${trendColor}" font-size="10" font-family="system-ui, sans-serif" text-anchor="end" font-weight="700">
          ${trend} ${formatValue(lastVal, format)}
        </text>
      </svg>
    `
  }
})
