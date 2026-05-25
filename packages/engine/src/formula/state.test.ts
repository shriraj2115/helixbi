import { describe, it, expect } from 'vitest'
import { useDashboardStore } from '../../../state/src/index'
import { canvasManager } from '../../../canvas/src/index'
import { Widget } from '../../../types/src/index'

describe('Zustand State & Yjs Integration', () => {
  it('should add, update, and remove widgets in Zustand store', () => {
    const store = useDashboardStore.getState()
    
    const widget: Widget = {
      id: 'test_w_1',
      type: 'builtin.bar_chart',
      title: 'Sales Chart',
      position: { x: 0, y: 0, w: 6, h: 4 },
      dataSource: 'data_table_view',
      query: { dimensions: ['CATEGORY'], measures: [], filters: [] },
      config: {}
    }

    store.addWidget(widget)
    expect(useDashboardStore.getState().widgets).toContainEqual(widget)

    store.updateWidgetPosition('test_w_1', 2, 2, 8, 8)
    const updated = useDashboardStore.getState().widgets.find((w: any) => w.id === 'test_w_1')
    expect(updated?.position).toEqual({ x: 2, y: 2, w: 8, h: 8 })

    store.removeWidget('test_w_1')
    expect(useDashboardStore.getState().widgets).toEqual([])
  })

  it('should sync state to Yjs and back', () => {
    const widgets: Widget[] = [
      {
        id: 'test_w_2',
        type: 'builtin.line_chart',
        title: 'Profit Line',
        position: { x: 0, y: 0, w: 6, h: 4 },
        dataSource: 'data_table_view',
        query: { dimensions: ['DATE'], measures: [], filters: [] },
        config: {}
      }
    ]

    canvasManager.syncStateToYjs(widgets)
    
    let received: Widget[] = []
    const unsubscribe = canvasManager.syncYjsToState((ywidgets: any) => {
      received = ywidgets
    })

    // Re-sync to trigger observer callback
    canvasManager.syncStateToYjs(widgets)
    expect(received).toEqual(widgets)

    unsubscribe()
  })
})
