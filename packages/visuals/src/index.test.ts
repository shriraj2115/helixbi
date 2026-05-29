import { describe, test, expect, vi } from 'vitest'
import { visualRegistry } from './index'
import { Widget } from '@helixbi/types'

// Mocking useDashboardStore
vi.mock('@helixbi/state', () => {
  return {
    useDashboardStore: {
      getState: () => ({
        columnFormats: {
          'price': 'currency',
          'ratio': 'percentage',
          'qty': 'number'
        },
        columnLabels: {},
        crossFilters: {}
      })
    }
  }
})

describe('KPI Card Visual Plugin', () => {
  test('renders raw values correctly without format', () => {
    const element = {
      innerHTML: '',
      appendChild: vi.fn(),
      clientWidth: 350,
      clientHeight: 200
    } as any

    const widget: Widget = {
      id: 'w_test',
      type: 'builtin.kpi_card',
      title: 'Total Sales',
      dataSource: 'data_table_view',
      position: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        dimensions: [],
        measures: [{ column: 'sales', aggregation: 'SUM', alias: 'sales_SUM' }],
        filters: [],
        limit: 10
      },
      config: {}
    }

    const data = [{ sales_SUM: 1500 }]

    const plugin = visualRegistry.get('builtin.kpi_card')
    expect(plugin).toBeDefined()

    const elementsCreated: any[] = []
    
    // Define global document mock
    globalThis.document = {
      createElement: (tagName: string) => {
        const el = {
          tagName,
          style: { cssText: '' },
          innerText: '',
          appendChild: vi.fn((child) => {
            el.children.push(child)
          }),
          children: [] as any[]
        } as any
        elementsCreated.push(el)
        return el as any
      }
    } as any

    try {
      plugin!.render(element, widget, data)
      
      const valueEl = elementsCreated.find(el => el.innerText === '1500')
      expect(valueEl).toBeDefined()
      expect(valueEl.style.cssText).toContain('font-size: 2.2rem')
      
      const labelEl = elementsCreated.find(el => el.innerText === 'Total Sales')
      expect(labelEl).toBeDefined()
    } finally {
      // Clean up global mock
      delete (globalThis as any).document
    }
  })

  test('renders formatted currency values correctly', () => {
    const element = {
      innerHTML: '',
      appendChild: vi.fn(),
      clientWidth: 350,
      clientHeight: 200
    } as any

    const widget: Widget = {
      id: 'w_test_formatted',
      type: 'builtin.kpi_card',
      title: 'Total Revenue',
      dataSource: 'data_table_view',
      position: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        dimensions: [],
        measures: [{ column: 'price', aggregation: 'SUM', alias: 'price_SUM' }],
        filters: [],
        limit: 10
      },
      config: {}
    }

    const data = [{ price_SUM: 1250000 }]

    const plugin = visualRegistry.get('builtin.kpi_card')
    expect(plugin).toBeDefined()

    const elementsCreated: any[] = []
    
    globalThis.document = {
      createElement: (tagName: string) => {
        const el = {
          tagName,
          style: { cssText: '' },
          innerText: '',
          appendChild: vi.fn((child) => {
            el.children.push(child)
          }),
          children: [] as any[]
        } as any
        elementsCreated.push(el)
        return el as any
      }
    } as any

    try {
      plugin!.render(element, widget, data)
      
      const valueEl = elementsCreated.find(el => el.innerText === '$1,250,000.00')
      expect(valueEl).toBeDefined()
    } finally {
      delete (globalThis as any).document
    }
  })
})
