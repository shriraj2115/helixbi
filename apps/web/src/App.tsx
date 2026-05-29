import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import * as duckdb from '@duckdb/duckdb-wasm'
import { useUIStore, useDashboardStore, useHistoryStore, captureDashboardSnapshot } from '@helixbi/state'
import { compileFormula, generateViewSQL, parseAndCompileFormula, compileVisualQueryToSQL, classifyColumnType, generateProfileSQL, generateTopValuesSQL } from '@helixbi/engine'
import { canvasManager } from '@helixbi/canvas'
import { visualRegistry } from '@helixbi/visuals'
import { formatValue } from '@helixbi/semantic'
import { CalculatedField, Widget, VisualQuery, ColumnProfile, QueryHistoryEntry } from '@helixbi/types'
import { dashboardDB } from './db'
import { localTranslateNLToSQL, translateNLToSQLGemini, translateNLToSQLOpenAI } from './copilot'
import './App.css'

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
  },
  eh: {
    mainModule: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm',
    mainWorker: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js',
  },
}

function App() {
  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Database offline')
  const [csvUploaded, setCsvUploaded] = useState(false)
  const [sqlQuery, setSqlQuery] = useState('SELECT COUNT(*) FROM data_table_view')
  const [queryResult, setQueryResult] = useState<any[] | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [execTimeMs, setExecTimeMs] = useState<number | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [columnTypes, setColumnTypes] = useState<Record<string, string>>({})
  
  // Calculated Fields form state
  const [cfName, setCfName] = useState('')
  const [cfExpression, setCfExpression] = useState('')
  const [cfOutputType, setCfOutputType] = useState('DOUBLE')
  const [cfError, setCfError] = useState<string | null>(null)
  const [cfPreviewSQL, setCfPreviewSQL] = useState<string | null>(null)

  // Autocomplete helper state
  const [showAutoComplete, setShowAutoComplete] = useState(false)
  const [autoCompleteFiltered, setAutoCompleteFiltered] = useState<string[]>([])

  // Widget Composer form state
  const [widgetTitle, setWidgetTitle] = useState('')
  const [widgetType, setWidgetType] = useState('builtin.bar_chart')
  const [widgetDim, setWidgetDim] = useState('')
  const [widgetMeas, setWidgetMeas] = useState('')
  const [widgetAgg, setWidgetAgg] = useState<'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX'>('SUM')
  const [widgetLimit, setWidgetLimit] = useState(10)

  // Dashboard metadata editing state
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [tempTitle, setTempTitle] = useState('')
  const [tempDesc, setTempDesc] = useState('')

  // Global filter composer state
  const [selectedFilterCol, setSelectedFilterCol] = useState('')
  const [selectedFilterVal, setSelectedFilterVal] = useState('')
  const [filterColOptions, setFilterColOptions] = useState<string[]>([])

  // Day 3: Data Profiler state
  const [profileResults, setProfileResults] = useState<ColumnProfile[]>([])
  const [profiling, setProfiling] = useState(false)
  const [profileProgress, setProfileProgress] = useState(0)
  const [profileTotal, setProfileTotal] = useState(0)

  // Day 3: Query History panel state
  const [showQueryHistory, setShowQueryHistory] = useState(false)

  // Day 3: Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Day 3: Drill-down modal state
  const [drillDown, setDrillDown] = useState<{ column: string; value: string; widget: Widget } | null>(null)
  const [drillDownData, setDrillDownData] = useState<any[] | null>(null)
  const [drillDownLoading, setDrillDownLoading] = useState(false)

  // Day 4: Collaboration State
  const [collabActive, setCollabActive] = useState(false)
  const [roomName, setRoomName] = useState('helixbi_collab')
  const [nickname, setNickname] = useState(() => localStorage.getItem('helixbi_nickname') || `User_${Math.floor(Math.random() * 1000)}`)
  const [userColor, setUserColor] = useState(() => localStorage.getItem('helixbi_usercolor') || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`)
  const [connectedPeers, setConnectedPeers] = useState<any[]>([])
  const [showCollabSettings, setShowCollabSettings] = useState(false)

  // Day 4: Datagrid Sorting & Filtering State
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})

  // Day 4: AI Copilot State
  const [copilotPrompt, setCopilotPrompt] = useState('')
  const [copilotResult, setCopilotResult] = useState<string | null>(null)
  const [copilotExplanation, setCopilotExplanation] = useState<string | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [copilotError, setCopilotError] = useState<string | null>(null)
  const [copilotMode, setCopilotMode] = useState<'local' | 'gemini' | 'openai'>(
    () => (localStorage.getItem('helixbi_copilot_mode') as any) || 'local'
  )
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('helixbi_gemini_key') || '')
  const [openAIKey, setOpenAIKey] = useState(() => localStorage.getItem('helixbi_openai_key') || '')
  const [showCopilotSettings, setShowCopilotSettings] = useState(false)

  // Day 4: Auto-Save & Version History State
  const [saveStatus, setSaveStatus] = useState('Ready')
  const [savedVersions, setSavedVersions] = useState<any[]>([])
  const [versionNameInput, setVersionNameInput] = useState('')
  const [versionDescInput, setVersionDescInput] = useState('')
  const [restoredNotification, setRestoredNotification] = useState<string | null>(null)

  const loadFilterOptions = async (col: string) => {
    if (!db || !col) return
    try {
      const conn = await db.connect()
      const res = await conn.query(`SELECT DISTINCT "${col}" FROM data_table_view WHERE "${col}" IS NOT NULL LIMIT 100`)
      await conn.close()
      const vals = res.toArray().map((row: any) => String(row[col]))
      setFilterColOptions(vals)
    } catch (err) {
      console.error('Error fetching filter options:', err)
    }
  }

  useEffect(() => {
    if (selectedFilterCol) {
      loadFilterOptions(selectedFilterCol)
    } else {
      setFilterColOptions([])
    }
    setSelectedFilterVal('')
  }, [selectedFilterCol])

  // UI Store
  const { theme, toggleTheme } = useUIStore()

  // Zustand Store
  const { 
    calculatedFields, addCalculatedField, removeCalculatedField,
    widgets, addWidget, removeWidget, setWidgets,
    columnFormats, columnLabels, setColumnFormat, setColumnLabel, loadDashboard,
    globalFilters, addGlobalFilter, removeGlobalFilter, clearGlobalFilters,
    crossFilters, clearCrossFilters,
    crossFilterExclusions, toggleCrossFilterExclusion,
    title, description, setDashboardTitle, setDashboardDescription
  } = useDashboardStore()

  // Day 3: History Store
  const { 
    pushSnapshot, undo, redo, canUndo, canRedo,
    queryHistory, addQueryHistoryEntry, clearQueryHistory
  } = useHistoryStore()
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileConfigInputRef = useRef<HTMLInputElement>(null)

  // Synchronize widgets list with Yjs collaborative canvas
  useEffect(() => {
    const unsubscribe = canvasManager.syncYjsToState((ywidgets) => {
      setWidgets(ywidgets)
    })
    return () => unsubscribe()
  }, [setWidgets])

  // Sync theme class to document body
  useEffect(() => {
    document.body.className = `theme-${theme}`
  }, [theme])

  // Day 4: URL Room Parameter Check on Mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const roomParam = params.get('room')
    if (roomParam) {
      setRoomName(roomParam)
      setCollabActive(true)
    }
  }, [])

  // Day 4: WebRTC Connection Lifecycle
  useEffect(() => {
    if (collabActive && roomName.trim()) {
      canvasManager.connectWebRTC(roomName.trim(), nickname, userColor, (peers) => {
        setConnectedPeers(peers)
      })
    } else {
      canvasManager.disconnectWebRTC()
      setConnectedPeers([])
    }
    return () => {
      canvasManager.disconnectWebRTC()
    }
  }, [collabActive, roomName, nickname, userColor])

  // Day 4: Local Storage Settings Sync
  useEffect(() => {
    localStorage.setItem('helixbi_nickname', nickname)
  }, [nickname])

  useEffect(() => {
    localStorage.setItem('helixbi_usercolor', userColor)
  }, [userColor])

  useEffect(() => {
    localStorage.setItem('helixbi_copilot_mode', copilotMode)
  }, [copilotMode])

  useEffect(() => {
    localStorage.setItem('helixbi_gemini_key', geminiKey)
  }, [geminiKey])

  useEffect(() => {
    localStorage.setItem('helixbi_openai_key', openAIKey)
  }, [openAIKey])

  // Day 4: IndexedDB Auto-save Restore on Mount
  useEffect(() => {
    const loadSaved = async () => {
      try {
        const saved = await dashboardDB.getAutosave()
        if (saved) {
          loadDashboard(saved)
          canvasManager.syncStateToYjs(saved.widgets || [])
          setRestoredNotification('Restored previous dashboard layout from auto-save. Please re-upload your CSV to run queries.')
          setTimeout(() => {
            setRestoredNotification(null)
          }, 8000)
        }
      } catch (err) {
        console.error('Failed to load autosave:', err)
      }
    }
    loadSaved()
  }, [loadDashboard])

  // Day 4: Debounced Auto-save to IndexedDB (1.5s delay)
  useEffect(() => {
    const unsubscribe = useDashboardStore.subscribe((state) => {
      if (!state.title && state.widgets.length === 0 && state.calculatedFields.length === 0) {
        return
      }

      const dashboardJson = {
        title: state.title,
        description: state.description,
        calculatedFields: state.calculatedFields,
        widgets: state.widgets,
        columnFormats: state.columnFormats,
        columnLabels: state.columnLabels,
        globalFilters: state.globalFilters,
        crossFilterExclusions: state.crossFilterExclusions
      }

      setSaveStatus('Saving...')
      const timer = setTimeout(async () => {
        try {
          await dashboardDB.saveAutosave(dashboardJson)
          setSaveStatus(`Saved (sync: ${new Date().toLocaleTimeString()})`)
        } catch (err) {
          console.error('Auto-save failed:', err)
          setSaveStatus('Save Error')
        }
      }, 1500)

      return () => clearTimeout(timer)
    })

    return () => unsubscribe()
  }, [])

  // Day 3: Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo()) {
          const snapshot = undo()
          if (snapshot) {
            canvasManager.syncStateToYjs(snapshot.widgets)
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        if (canRedo()) {
          const snapshot = redo()
          if (snapshot) {
            canvasManager.syncStateToYjs(snapshot.widgets)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, canUndo, canRedo])

  // Step 1: Initialize DuckDB WASM
  const initDuckDB = async () => {
    try {
      setLoading(true)
      setStatus('Selecting bundle...')
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
      
      setStatus('Initializing web worker...')
      const worker = new Worker(bundle.mainWorker!)
      const logger = new duckdb.ConsoleLogger()
      const asyncDb = new duckdb.AsyncDuckDB(logger, worker)
      
      setStatus('Instantiating WASM module...')
      await asyncDb.instantiate(bundle.mainModule, bundle.pthreadWorker)
      
      setDb(asyncDb)
      setStatus('DuckDB WASM fully ready (OLAP engine active)')
    } catch (err: any) {
      console.error(err)
      setStatus(`Initialization failed: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Ingest CSV
  const handleCsvFile = async (file: File) => {
    if (!db) {
      alert('Please initialize the DuckDB WASM engine first!')
      return
    }
    try {
      setLoading(true)
      setStatus(`Reading ${file.name}...`)
      
      const buffer = await file.arrayBuffer()
      const u8Arr = new Uint8Array(buffer)
      
      // Register file in DuckDB file system
      await db.registerFileBuffer(file.name, u8Arr)
      
      // Ingest into a table
      const conn = await db.connect()
      setStatus(`Parsing and inserting into DuckDB...`)
      
      const targetTable = 'data_table'
      await conn.insertCSVFromPath(file.name, {
        schema: 'main',
        name: targetTable,
        detect: true,
        header: true,
      })
      
      // Query table schema
      const columnsRes = await conn.query(`DESCRIBE ${targetTable}`)
      const colRows = columnsRes.toArray()
      const cols = colRows.map((row: any) => row.column_name)
      const colTypesMap: Record<string, string> = {}
      colRows.forEach((row: any) => {
        colTypesMap[row.column_name] = row.column_type
      })
      
      setColumns(cols)
      setColumnTypes(colTypesMap)
      setCsvUploaded(true)

      // Set default dimensions/measures inside form if columns exist
      if (cols.length > 0) {
        setWidgetDim(cols[0] || '')
        setWidgetMeas(cols[0] || '')
      }

      // Initialize the projection view
      const viewSQL = generateViewSQL(targetTable, calculatedFields, cols)
      await conn.query(viewSQL)
      await conn.close()

      setStatus(`Table "${targetTable}" and query view successfully created.`)
    } catch (err: any) {
      console.error(err)
      alert(`Ingestion failed: ${err.message || err}`)
      setStatus('Ingestion error')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Run SQL Queries
  const runQuery = async (queryText = sqlQuery) => {
    if (!db) return
    try {
      setLoading(true)
      setQueryError(null)
      const start = performance.now()
      
      const conn = await db.connect()
      const result = await conn.query(queryText)
      
      const end = performance.now()
      const elapsed = Math.round((end - start) * 100) / 100
      setExecTimeMs(elapsed)
      
      // Convert Arrow Table to JS Objects
      const rows = result.toArray().map((row: any) => {
        const obj: Record<string, any> = {}
        for (const key of Object.keys(row)) {
          const val = row[key]
          obj[key] = typeof val === 'bigint' ? val.toString() : val
        }
        return obj
      })
      
      setQueryResult(rows)
      await conn.close()

      // Day 3: Track in query history
      addQueryHistoryEntry({
        id: `qh_${Date.now()}`,
        sql: queryText,
        executedAt: new Date().toISOString(),
        executionTimeMs: elapsed,
        rowCount: rows.length,
        status: 'success'
      })
    } catch (err: any) {
      console.error(err)
      setQueryError(err.message || String(err))
      setQueryResult(null)

      // Day 3: Track error queries too
      addQueryHistoryEntry({
        id: `qh_${Date.now()}`,
        sql: queryText,
        executedAt: new Date().toISOString(),
        executionTimeMs: 0,
        rowCount: 0,
        status: 'error',
        error: err.message || String(err)
      })
    } finally {
      setLoading(false)
    }
  }

  // Step 4: Rebuild projection view
  const rebuildDuckDBView = async (fields = calculatedFields) => {
    if (!db) return
    try {
      setLoading(true)
      setStatus('Regenerating DuckDB view projection...')
      
      const viewSQL = generateViewSQL('data_table', fields, columns)
      const conn = await db.connect()
      await conn.query(viewSQL)
      await conn.close()
      
      setStatus('DuckDB view projection successfully updated')
    } catch (err: any) {
      console.error(err)
      alert(`Failed to update DuckDB projection: ${err.message}`)
      setStatus('Projection update error')
    } finally {
      setLoading(false)
    }
  }

  // Step 5: Handle calculated field composition
  const handleFormulaChange = (expr: string) => {
    setCfExpression(expr)
    if (!expr.trim()) {
      setCfError(null)
      setCfPreviewSQL(null)
      setShowAutoComplete(false)
      return
    }

    try {
      const sql = compileFormula(expr)
      setCfPreviewSQL(sql)
      setCfError(null)
    } catch (err: any) {
      setCfPreviewSQL(null)
      setCfError(err.message || 'Expression syntax error')
    }

    const match = expr.match(/\[([a-zA-Z0-9_]*)$/)
    if (match) {
      const q = match[1]?.toLowerCase() || ''
      const filtered = columns.filter(col => col.toLowerCase().includes(q))
      setAutoCompleteFiltered(filtered)
      setShowAutoComplete(true)
    } else {
      setShowAutoComplete(false)
    }
  }

  const insertAutoCompleteColumn = (colName: string) => {
    const updated = cfExpression.replace(/\[[a-zA-Z0-9_]*$/, `[${colName}]`)
    setCfExpression(updated)
    setShowAutoComplete(false)

    try {
      const sql = compileFormula(updated)
      setCfPreviewSQL(sql)
      setCfError(null)
    } catch (err: any) {
      setCfPreviewSQL(null)
      setCfError(err.message || 'Expression syntax error')
    }

    setTimeout(() => {
      document.getElementById('cf-expr')?.focus()
    }, 10)
  }

  const handleAddCalculatedField = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cfName.trim() || !cfExpression.trim()) return

    const sanitizedName = cfName.trim()
    const rawExpression = cfExpression.trim()

    // Validation checks
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sanitizedName)) {
      alert('Calculated field name must start with a letter and contain only letters, numbers, and underscores.')
      return
    }

    if (columns.some(col => col.toLowerCase() === sanitizedName.toLowerCase())) {
      alert('A column with this name already exists in the CSV data!')
      return
    }

    if (calculatedFields.some(f => f.name.toLowerCase() === sanitizedName.toLowerCase())) {
      alert('A calculated field with this name already exists!')
      return
    }

    try {
      // Day 3: Push undo snapshot before mutation
      pushSnapshot(captureDashboardSnapshot())

      const { sqlExpression, dependsOn } = parseAndCompileFormula(rawExpression)

      const newField: CalculatedField = {
        id: `cf_${Date.now()}`,
        name: sanitizedName,
        expression: rawExpression,
        dependsOn,
        dataSource: 'data_table',
        outputType: cfOutputType,
        sqlExpression,
        validated: true,
        validatedAt: new Date().toISOString()
      }

      const updatedFields = [...calculatedFields, newField]
      addCalculatedField(newField)

      // Reset form
      setCfName('')
      setCfExpression('')
      setCfError(null)
      setCfPreviewSQL(null)

      // Rebuild the DuckDB projection view containing the new computed columns
      await rebuildDuckDBView(updatedFields)
    } catch (err: any) {
      alert(`Invalid formula expression: ${err.message}`)
    }
  }

  const handleDeleteCalculatedField = async (id: string) => {
    pushSnapshot(captureDashboardSnapshot())
    const updatedFields = calculatedFields.filter(f => f.id !== id)
    removeCalculatedField(id)
    await rebuildDuckDBView(updatedFields)
  }

  // Day 4: Sort Output Grid Click Handler
  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortColumn(null)
        setSortDirection(null)
      }
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  // Day 4: Memoized sorted and filtered query result
  const processedQueryResult = useMemo(() => {
    if (!queryResult) return null

    let data = [...queryResult]
    // Filter
    Object.entries(columnFilters).forEach(([col, filterText]) => {
      if (!filterText) return
      const text = filterText.toLowerCase()
      data = data.filter((row) => {
        const val = row[col]
        if (val === undefined || val === null) return false
        return String(val).toLowerCase().includes(text)
      })
    })

    // Sort
    if (sortColumn && sortDirection) {
      data.sort((a, b) => {
        const valA = a[sortColumn]
        const valB = b[sortColumn]

        if (valA === null || valA === undefined) return 1
        if (valB === null || valB === undefined) return -1

        const isNumA = typeof valA === 'number'
        const isNumB = typeof valB === 'number'

        if (isNumA && isNumB) {
          return sortDirection === 'asc' ? valA - valB : valB - valA
        }

        const strA = String(valA)
        const strB = String(valB)
        return sortDirection === 'asc'
          ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' })
          : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' })
      })
    }

    return data
  }, [queryResult, sortColumn, sortDirection, columnFilters])

  // Day 4: Version Checkpoints Handlers
  const refreshVersions = useCallback(async () => {
    try {
      const list = await dashboardDB.listVersions()
      setSavedVersions(list)
    } catch (err) {
      console.error('Failed to list versions:', err)
    }
  }, [])

  useEffect(() => {
    refreshVersions()
  }, [refreshVersions])

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!versionNameInput.trim()) return

    const snapshot = captureDashboardSnapshot()
    try {
      await dashboardDB.saveVersion(versionNameInput.trim(), versionDescInput.trim(), snapshot)
      setVersionNameInput('')
      setVersionDescInput('')
      refreshVersions()
    } catch (err) {
      console.error('Failed to save version:', err)
      alert('Failed to save version.')
    }
  }

  const handleRestoreVersion = async (version: any) => {
    if (window.confirm(`Are you sure you want to restore version "${version.name}"? This will replace your current dashboard.`)) {
      const current = captureDashboardSnapshot()
      pushSnapshot(current)
      
      loadDashboard(version.data)
      canvasManager.syncStateToYjs(version.data.widgets || [])
    }
  }

  const handleDeleteVersion = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm('Delete this version checkpoint?')) {
      try {
        await dashboardDB.deleteVersion(id)
        refreshVersions()
      } catch (err) {
        console.error('Failed to delete version:', err)
      }
    }
  }

  // Day 4: AI Copilot SQL Generator Handlers
  const handleCopilotGenerate = async () => {
    if (!copilotPrompt.trim()) return
    setCopilotLoading(true)
    setCopilotError(null)
    setCopilotResult(null)
    setCopilotExplanation(null)

    try {
      if (copilotMode === 'local') {
        const res = localTranslateNLToSQL(copilotPrompt, columns, columnTypes)
        setCopilotResult(res.sql)
        setCopilotExplanation(res.explanation)
      } else if (copilotMode === 'gemini') {
        if (!geminiKey) {
          throw new Error('Gemini API key is required. Check settings.')
        }
        const res = await translateNLToSQLGemini(copilotPrompt, columns, columnTypes, geminiKey)
        setCopilotResult(res.sql)
        setCopilotExplanation(res.explanation)
      } else if (copilotMode === 'openai') {
        if (!openAIKey) {
          throw new Error('OpenAI API key is required. Check settings.')
        }
        const res = await translateNLToSQLOpenAI(copilotPrompt, columns, columnTypes, openAIKey)
        setCopilotResult(res.sql)
        setCopilotExplanation(res.explanation)
      }
    } catch (err: any) {
      console.error(err)
      setCopilotError(err.message || String(err))
    } finally {
      setCopilotLoading(false)
    }
  }

  const handleApplyCopilotSQL = () => {
    if (copilotResult) {
      setSqlQuery(copilotResult)
      runQuery(copilotResult)
    }
  }

  const handleCreateWidgetFromCopilot = () => {
    if (!copilotResult) return

    const matchSelect = copilotResult.match(/select\s+(.+?)\s+from/i)
    if (!matchSelect || !matchSelect[1]) return

    const fields = matchSelect[1].split(',').map((s) => {
      const parts = s.trim().split(/\s+as\s+/i)
      const clean = (parts[0] || '').replace(/["'`]/g, '').trim()
      const alias = (parts[1] || parts[0] || '').replace(/["'`]/g, '').trim()
      return { clean, alias }
    })

    if (fields.length === 0) return

    let dim = ''
    let meas = ''
    let agg: any = 'SUM'
    let title = `AI: ${copilotPrompt}`
    let type = 'builtin.bar_chart'

    if (fields.length === 1) {
      type = 'builtin.kpi_card'
      meas = fields[0]!.clean
      if (meas.toUpperCase().includes('COUNT')) {
        agg = 'COUNT'
        meas = columns[0] || ''
      } else if (meas.toUpperCase().includes('AVG')) {
        agg = 'AVG'
      } else if (meas.toUpperCase().includes('SUM')) {
        agg = 'SUM'
      }
    } else {
      const numeric = fields.find((f) => {
        const origName = columns.find((c) => c.toLowerCase() === f.clean.toLowerCase()) || f.clean
        const type = (columnTypes[origName] || '').toUpperCase()
        return (
          type.includes('INT') ||
          type.includes('DOUBLE') ||
          type.includes('FLOAT') ||
          type.includes('DECIMAL') ||
          f.clean.toUpperCase().match(/(SUM|AVG|COUNT|MIN|MAX)/)
        )
      })

      const categorical = fields.find((f) => f !== numeric)
      dim = categorical
        ? columns.find((c) => c.toLowerCase() === categorical.clean.toLowerCase()) || categorical.clean
        : fields[0]!.clean

      const measField = numeric || fields[1] || fields[0]!
      meas = columns.find((c) => c.toLowerCase() === measField.clean.toLowerCase()) || measField.clean

      if (measField.clean.toUpperCase().includes('COUNT')) {
        agg = 'COUNT'
        meas = columns[0] || ''
      } else if (measField.clean.toUpperCase().includes('AVG')) {
        agg = 'AVG'
      } else if (measField.clean.toUpperCase().includes('SUM')) {
        agg = 'SUM'
      }
    }

    pushSnapshot(captureDashboardSnapshot())

    const newWidget: Widget = {
      id: `widget_${Date.now()}`,
      type,
      title,
      position: { x: 0, y: 0, w: 6, h: 4 },
      dataSource: 'data_table_view',
      query: {
        dimensions: dim ? [dim] : [],
        measures: [{ column: meas || columns[0] || '', aggregation: agg, alias: 'Value' }],
        filters: [],
        limit: 10,
      },
      config: {},
    }

    addWidget(newWidget)
    canvasManager.syncStateToYjs([...widgets, newWidget])
    alert(`Widget "${title}" added to canvas!`)
  }

  // Step 6: Handle Visual Canvas Widgets
  const handleAddWidget = (e: React.FormEvent) => {
    e.preventDefault()
    if (!widgetTitle.trim() || !widgetMeas || (widgetType !== 'builtin.kpi_card' && widgetType !== 'builtin.sparkline' && !widgetDim)) return

    pushSnapshot(captureDashboardSnapshot())

    const query: VisualQuery = {
      dimensions: (widgetType === 'builtin.kpi_card' || widgetType === 'builtin.sparkline') ? [] : [widgetDim],
      measures: [
        {
          column: widgetMeas,
          aggregation: widgetAgg,
          alias: `${widgetMeas}_${widgetAgg}`
        }
      ],
      filters: [],
      limit: widgetLimit,
      cardinalityGuard: {
        enabled: true,
        maxDistinct: 30
      }
    }

    // Sparklines need a dimension for trend
    if (widgetType === 'builtin.sparkline' && widgetDim) {
      query.dimensions = [widgetDim]
    }

    const newWidget: Widget = {
      id: `w_${Date.now()}`,
      type: widgetType,
      title: widgetTitle.trim(),
      position: { x: 0, y: 0, w: 6, h: 4 },
      dataSource: 'data_table_view',
      query,
      config: {}
    }

    const updatedWidgets = [...widgets, newWidget]
    addWidget(newWidget)
    canvasManager.syncStateToYjs(updatedWidgets)

    // Reset Form
    setWidgetTitle('')
  }

  const handleDeleteWidget = (id: string) => {
    pushSnapshot(captureDashboardSnapshot())
    const updatedWidgets = widgets.filter(w => w.id !== id)
    removeWidget(id)
    canvasManager.syncStateToYjs(updatedWidgets)
  }

  const handleExportDashboard = () => {
    const dashboardData = {
      $schema: "http://json-schema.org/draft-07/schema#",
      version: "2.0.0",
      id: "cf_export_" + Date.now(),
      title: "HelixBI Exported Dashboard",
      description: "Exported configuration from HelixBI Web client",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: "HelixBI system",
      orgId: "org_default",
      isPublic: false,
      deletedAt: null,
      dataSources: [
        {
          id: "ds_data_table",
          name: "data_table",
          type: "CSV",
          config: {},
          lastRefreshedAt: new Date().toISOString()
        }
      ],
      semanticModel: {
        enabled: true,
        modelFile: null
      },
      calculatedFields,
      widgets,
      columnFormats,
      columnLabels,
      globalFilters: [],
      crossFilterLinks: [],
      layout: {
        cols: 12,
        rowHeight: 100,
        margin: [10, 10],
        containerPadding: [10, 10],
        canvasBackground: "#08090f",
        snapToGrid: true,
        theme: "dark",
        responsive: {}
      },
      schemaHistory: [
        {
          version: "2.0.0",
          migratedAt: new Date().toISOString(),
          migratedBy: "HelixBI system"
        }
      ]
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dashboardData, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute("href", dataStr)
    downloadAnchor.setAttribute("download", `helixbi-dashboard-${Date.now()}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  const handleImportDashboard = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result
        if (typeof text !== 'string') return
        const parsed = JSON.parse(text)
        
        if (parsed.version !== '2.0.0') {
          alert('Error: Imported dashboard must comply with v2.0.0 schema version.')
          return
        }

        pushSnapshot(captureDashboardSnapshot())
        loadDashboard(parsed)
        canvasManager.syncStateToYjs(parsed.widgets || [])

        if (db && csvUploaded) {
          await rebuildDuckDBView(parsed.calculatedFields || [])
        }

        alert('Dashboard configuration successfully loaded!')
      } catch (err: any) {
        alert(`Failed to import dashboard config: ${err.message}`)
      }
    }
    reader.readAsText(file)
  }

  const handleExportCanvasImage = () => {
    const canvasEl = document.querySelector('.dashboard-canvas') as HTMLElement
    if (!canvasEl) {
      alert('Dashboard canvas not found!')
      return
    }

    const width = canvasEl.offsetWidth
    const height = canvasEl.offsetHeight

    let stylesHtml = ''
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules)
        stylesHtml += rules.map(rule => rule.cssText).join('\n')
      } catch (e) {
        console.warn('Could not read css rules from stylesheet:', e)
      }
    }

    const customStyles = `
      body { background: transparent; margin: 0; padding: 0; }
      .btn-delete { display: none !important; }
      .dashboard-canvas {
        background-color: var(--bg-color, #08090f);
        padding: 20px;
        border-radius: 16px;
      }
    `

    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width + 40}" height="${height + 40}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <style>
              ${stylesHtml}
              ${customStyles}
            </style>
            <div style="padding: 20px; background-color: var(--bg-color, #08090f); min-height: 100%;">
              <h1 style="margin-top: 0; margin-bottom: 4px; font-size: 1.6rem; font-weight: 700; color: var(--text-color); font-family: 'Inter', sans-serif;">${title}</h1>
              <p style="margin-top: 0; margin-bottom: 24px; font-size: 0.9rem; color: var(--text-muted); font-family: 'Inter', sans-serif;">${description}</p>
              <div class="dashboard-canvas">
                ${canvasEl.innerHTML}
              </div>
            </div>
          </div>
        </foreignObject>
      </svg>
    `

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = (width + 40) * 2
      canvas.height = (height + 120) * 2
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(2, 2)
        ctx.fillStyle = theme === 'light' ? '#f8fafc' : '#08090f'
        ctx.fillRect(0, 0, width + 40, height + 120)
        ctx.drawImage(img, 0, 0)
        
        const pngUrl = canvas.toDataURL('image/png')
        const downloadAnchor = document.createElement('a')
        downloadAnchor.setAttribute("href", pngUrl)
        downloadAnchor.setAttribute("download", `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`)
        document.body.appendChild(downloadAnchor)
        downloadAnchor.click()
        downloadAnchor.remove()
      }
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const exportQueryResult = async (format: 'csv' | 'parquet') => {
    if (!db || !sqlQuery) return
    try {
      setLoading(true)
      const conn = await db.connect()
      
      const fileName = `query_export_${Date.now()}.${format}`
      const copyQuery = `COPY (${sqlQuery}) TO '${fileName}' (FORMAT ${format.toUpperCase()})`
      
      setStatus(`Generating ${format.toUpperCase()} file via DuckDB...`)
      await conn.query(copyQuery)
      
      const buffer = await db.copyFileToBuffer(fileName)
      await conn.close()
      
      const blob = new Blob([buffer as any], { type: format === 'csv' ? 'text/csv' : 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const downloadAnchor = document.createElement('a')
      downloadAnchor.setAttribute("href", url)
      downloadAnchor.setAttribute("download", `helixbi-export-${Date.now()}.${format}`)
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      downloadAnchor.remove()
      URL.revokeObjectURL(url)
      
      setStatus('Export complete')
    } catch (err: any) {
      console.error(err)
      alert(`Export failed: ${err.message || err}`)
      setStatus('Export error')
    } finally {
      setLoading(false)
    }
  }

  const startEditingTitle = () => {
    setTempTitle(title)
    setEditingTitle(true)
  }
  const saveTitle = () => {
    if (tempTitle.trim()) {
      pushSnapshot(captureDashboardSnapshot())
      setDashboardTitle(tempTitle.trim())
    }
    setEditingTitle(false)
  }
  const startEditingDesc = () => {
    setTempDesc(description)
    setEditingDesc(true)
  }
  const saveDesc = () => {
    pushSnapshot(captureDashboardSnapshot())
    setDashboardDescription(tempDesc.trim())
    setEditingDesc(false)
  }

  // Day 3: Data Profiler
  const runDataProfiler = useCallback(async () => {
    if (!db || !csvUploaded) return
    try {
      setProfiling(true)
      setProfileResults([])
      setProfileProgress(0)
      setProfileTotal(columns.length)

      const results: ColumnProfile[] = []
      const conn = await db.connect()

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]!
        const rawType = columnTypes[col] || 'VARCHAR'
        const dataType = classifyColumnType(rawType)
        const profileSQL = generateProfileSQL('data_table', col, dataType)

        try {
          const res = await conn.query(profileSQL)
          const row = res.toArray()[0] as any

          const profile: ColumnProfile = {
            columnName: col,
            dataType,
            totalRows: Number(row.total_rows) || 0,
            nullCount: Number(row.null_count) || 0,
            distinctCount: Number(row.distinct_count) || 0,
          }

          if (dataType === 'numeric') {
            profile.min = row.min_val !== null ? Number(row.min_val) : undefined
            profile.max = row.max_val !== null ? Number(row.max_val) : undefined
            profile.mean = row.mean_val !== null ? Number(row.mean_val) : undefined
            profile.median = row.median_val !== null ? Number(row.median_val) : undefined
            profile.stddev = row.stddev_val !== null ? Number(row.stddev_val) : undefined
          }

          if (dataType === 'string') {
            profile.avgLength = row.avg_length !== null ? Number(row.avg_length) : undefined
          }

          if (dataType === 'temporal') {
            profile.minDate = row.min_date ?? undefined
            profile.maxDate = row.max_date ?? undefined
          }

          // Fetch top values for string/categorical columns
          if (dataType === 'string' || dataType === 'unknown') {
            try {
              const topSQL = generateTopValuesSQL('data_table', col, 5)
              const topRes = await conn.query(topSQL)
              profile.topValues = topRes.toArray().map((tr: any) => ({
                value: String(tr.value),
                count: Number(tr.count)
              }))
            } catch {
              // Non-critical failure
            }
          }

          results.push(profile)
        } catch (err) {
          // If individual column profile fails, add a stub
          results.push({
            columnName: col,
            dataType,
            totalRows: 0,
            nullCount: 0,
            distinctCount: 0,
          })
        }

        setProfileProgress(i + 1)
      }

      await conn.close()
      setProfileResults(results)
    } catch (err: any) {
      console.error('Profiling failed:', err)
      alert(`Data profiling error: ${err.message}`)
    } finally {
      setProfiling(false)
    }
  }, [db, csvUploaded, columns, columnTypes])

  // Day 3: Drill-down handler
  const openDrillDown = useCallback(async (column: string, value: string, widget: Widget) => {
    if (!db) return
    setDrillDown({ column, value, widget })
    setDrillDownLoading(true)
    setDrillDownData(null)

    try {
      const conn = await db.connect()
      const sql = `SELECT * FROM data_table_view WHERE "${column}" = '${value.replace(/'/g, "''")}' LIMIT 50`
      const res = await conn.query(sql)
      await conn.close()

      const rows = res.toArray().map((row: any) => {
        const obj: Record<string, any> = {}
        for (const key of Object.keys(row)) {
          const val = row[key]
          obj[key] = typeof val === 'bigint' ? val.toString() : val
        }
        return obj
      })
      setDrillDownData(rows)
    } catch (err: any) {
      console.error('Drill-down failed:', err)
      setDrillDownData([])
    } finally {
      setDrillDownLoading(false)
    }
  }, [db])

  // Day 3: Drag-and-drop handlers
  const handleDragStart = (idx: number) => {
    setDragIndex(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIndex(idx)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex) {
      pushSnapshot(captureDashboardSnapshot())
      const reordered = canvasManager.reorderWidgets(dragIndex, toIndex)
      setWidgets(reordered)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  // Day 3: Undo/Redo button handlers
  const handleUndo = () => {
    if (canUndo()) {
      const snapshot = undo()
      if (snapshot) {
        canvasManager.syncStateToYjs(snapshot.widgets)
      }
    }
  }

  const handleRedo = () => {
    if (canRedo()) {
      const snapshot = redo()
      if (snapshot) {
        canvasManager.syncStateToYjs(snapshot.widgets)
      }
    }
  }

  // Ingested columns + calculated columns
  const allColumns = [
    ...columns,
    ...calculatedFields.map(cf => cf.name)
  ]

  return (
    <div className={`app-container theme-${theme}`}>
      {restoredNotification && (
        <div className="autosave-notification">
          <span>⚙️ {restoredNotification}</span>
          <button className="btn-close" onClick={() => setRestoredNotification(null)}>×</button>
        </div>
      )}

      {/* Collaboration Subbar */}
      <div className="collab-subbar">
        <div className="collab-status">
          <span className={`status-pulse ${collabActive ? 'online' : 'offline'}`} />
          <span className="status-label">
            {collabActive ? `Live Session: ${roomName}` : 'Local-Only Mode'}
          </span>
          <span className="save-status-indicator">{saveStatus}</span>
        </div>

        <div className="collab-actions">
          {collabActive && connectedPeers.length > 0 && (
            <div className="peer-avatars">
              {connectedPeers.map((peer, pidx) => (
                <div 
                  key={pidx} 
                  className="peer-avatar" 
                  style={{ backgroundColor: peer.color || '#4f46e5' }}
                  title={peer.name || 'Anonymous Peer'}
                >
                  {(peer.name || '?').substring(0, 2).toUpperCase()}
                </div>
              ))}
              <span className="peers-text">({connectedPeers.length} peer{connectedPeers.length > 1 ? 's' : ''} online)</span>
            </div>
          )}

          <button 
            className={`btn btn-tiny ${collabActive ? 'btn-danger' : 'btn-glow'}`}
            onClick={() => setCollabActive(!collabActive)}
            title={collabActive ? 'Stop collaborative sync' : 'Start collaborative live editing session'}
          >
            {collabActive ? '🔌 Go Offline' : '📡 Go Live / Collaborate'}
          </button>
          
          <button 
            className="btn btn-secondary btn-tiny"
            onClick={() => setShowCollabSettings(!showCollabSettings)}
            title="Configure nickname, room and color settings"
          >
            ⚙️ Collab Settings
          </button>

          {collabActive && (
            <button 
              className="btn btn-secondary btn-tiny btn-glow" 
              onClick={() => {
                const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`
                navigator.clipboard.writeText(inviteUrl)
                alert('Invite link copied to clipboard! Share it with others to join this room.')
              }}
            >
              🔗 Copy Invite Link
            </button>
          )}
        </div>

        {showCollabSettings && (
          <div className="collab-settings-dropdown card">
            <h4>Live Session Settings</h4>
            <div className="form-group">
              <label htmlFor="collab-room-id">Collaboration Room Name</label>
              <input 
                id="collab-room-id"
                type="text" 
                className="form-control" 
                value={roomName} 
                onChange={(e) => setRoomName(e.target.value)} 
                disabled={collabActive}
                placeholder="e.g. daily_sync"
              />
            </div>
            <div className="form-group">
              <label htmlFor="collab-nickname">Your Nickname</label>
              <input 
                id="collab-nickname"
                type="text" 
                className="form-control" 
                value={nickname} 
                onChange={(e) => setNickname(e.target.value)} 
                placeholder="e.g. Sarah"
              />
            </div>
            <div className="form-group">
              <label htmlFor="collab-color">Avatar Color</label>
              <input 
                id="collab-color"
                type="color" 
                value={userColor} 
                onChange={(e) => setUserColor(e.target.value)} 
              />
            </div>
            <p className="help-text">Disconnect live session to change the room name.</p>
          </div>
        )}
      </div>

      <header className="hero-header">
        <div className="branding">
          <span className="cyber-badge">PHASE 1 POC</span>
          {editingTitle ? (
            <input
              type="text"
              className="form-control"
              style={{ fontSize: '1.8rem', fontWeight: 700, padding: '4px 8px', background: '#0b0d14', border: '1px solid var(--primary-color)', color: '#f3f4f6', borderRadius: '8px', width: '300px', display: 'block', marginBottom: '8px' }}
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
              autoFocus
            />
          ) : (
            <h1 onClick={startEditingTitle} style={{ cursor: 'pointer' }} title="Click to rename dashboard">
              {title} ✏️
            </h1>
          )}

          {editingDesc ? (
            <input
              type="text"
              className="form-control"
              style={{ fontSize: '0.9rem', padding: '4px 8px', background: '#0b0d14', border: '1px solid var(--primary-color)', color: '#9ca3af', borderRadius: '6px', width: '400px', display: 'block' }}
              value={tempDesc}
              onChange={(e) => setTempDesc(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={(e) => e.key === 'Enter' && saveDesc()}
              autoFocus
            />
          ) : (
            <p className="subtitle" onClick={startEditingDesc} style={{ cursor: 'pointer' }} title="Click to edit description">
              {description || 'Click to add description'} ✏️
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Day 3: Undo/Redo Toolbar */}
          <div className="undo-redo-toolbar">
            <button className="btn-undo-redo" onClick={handleUndo} disabled={!canUndo()} title="Undo (Ctrl+Z)">
              ↩ <span className="shortcut-hint">Ctrl+Z</span>
            </button>
            <button className="btn-undo-redo" onClick={handleRedo} disabled={!canRedo()} title="Redo (Ctrl+Shift+Z)">
              ↪ <span className="shortcut-hint">Ctrl+⇧Z</span>
            </button>
          </div>
          <button className="btn btn-secondary" onClick={toggleTheme} title="Toggle Dark/Light Theme">
            {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
          </button>
          <button className="btn btn-secondary" onClick={handleExportDashboard} title="Export Dashboard JSON config">
            📤 Export Config
          </button>
          <button className="btn btn-secondary" onClick={() => fileConfigInputRef.current?.click()} title="Import Dashboard JSON config">
            📥 Import Config
          </button>
          <button className="btn btn-secondary" onClick={handleExportCanvasImage} title="Export Dashboard Canvas as PNG Image" disabled={!csvUploaded || widgets.length === 0}>
            🖼️ Export Image
          </button>
          <input
            type="file"
            ref={fileConfigInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={handleImportDashboard}
          />
          <div className="engine-status-card">
            <div className={`status-indicator ${db ? 'online' : 'offline'}`} />
            <span className="status-text">{status}</span>
          </div>
        </div>
      </header>

      {csvUploaded && (
        <section className="card global-filter-bar">
          <div className="filter-bar-header">
            <h3>🔍 Global Dashboard Filters</h3>
            {globalFilters.length > 0 && (
              <button className="btn btn-tiny" onClick={clearGlobalFilters} style={{ marginLeft: 'auto' }}>
                Clear All
              </button>
            )}
            {Object.keys(crossFilters).length > 0 && (
              <button 
                className="btn btn-tiny" 
                onClick={clearCrossFilters} 
                style={{ 
                  marginLeft: globalFilters.length > 0 ? '10px' : 'auto', 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                  borderColor: 'rgba(239, 68, 68, 0.2)', 
                  color: '#fca5a5' 
                }}
              >
                Clear Cross-Filters ({Object.keys(crossFilters).length})
              </button>
            )}
          </div>

          <div className="filter-bar-composer">
            <div className="form-group-horizontal">
              <label htmlFor="filter-col-select">Column</label>
              <select
                id="filter-col-select"
                className="form-control form-control-sm"
                value={selectedFilterCol}
                onChange={(e) => setSelectedFilterCol(e.target.value)}
              >
                <option value="">-- Select Column --</option>
                {allColumns.map(col => (
                  <option key={col} value={col}>{columnLabels[col] || col}</option>
                ))}
              </select>
            </div>

            {selectedFilterCol && (
              <div className="form-group-horizontal">
                <label htmlFor="filter-val-select">Value</label>
                <select
                  id="filter-val-select"
                  className="form-control form-control-sm"
                  value={selectedFilterVal}
                  onChange={(e) => setSelectedFilterVal(e.target.value)}
                >
                  <option value="">-- Select Value --</option>
                  {filterColOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="btn btn-tiny"
              disabled={!selectedFilterCol || !selectedFilterVal}
              onClick={() => {
                pushSnapshot(captureDashboardSnapshot())
                addGlobalFilter({
                  id: 'gf_' + Date.now(),
                  type: 'select',
                  column: selectedFilterCol,
                  dataSource: 'data_table_view',
                  value: selectedFilterVal,
                  label: selectedFilterCol
                })
                setSelectedFilterCol('')
                setSelectedFilterVal('')
              }}
            >
              + Apply Filter
            </button>
          </div>

          {globalFilters.length > 0 && (
            <div className="active-filters-list">
              {globalFilters.map(gf => (
                <div key={gf.id} className="filter-badge">
                  <span className="filter-badge-col">{columnLabels[gf.column] || gf.column}:</span>
                  <span className="filter-badge-val">{String(gf.value)}</span>
                  <button className="filter-badge-remove" onClick={() => removeGlobalFilter(gf.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <main className="dashboard-grid">
        {/* Control Center */}
        <section className="card control-center">
          <h2>1. Database Core</h2>
          {!db ? (
            <button 
              className="btn btn-primary btn-glow" 
              onClick={initDuckDB} 
              disabled={loading}
            >
              {loading ? 'Instantiating Engine...' : 'Initialize DuckDB WASM'}
            </button>
          ) : (
            <div className="success-badge">
              ✓ OLAP Engine Running (Thread-Isolated)
            </div>
          )}

          <h2 className="section-spacing">2. CSV Data Ingestion</h2>
          <div 
            className={`dropzone ${csvUploaded ? 'success' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file) handleCsvFile(file)
            }}
            onClick={() => db && fileInputRef.current?.click()}
            style={{ cursor: db ? 'pointer' : 'not-allowed' }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleCsvFile(file)
              }}
            />
            {csvUploaded ? (
              <div className="dropzone-text">
                <span className="icon">📊</span>
                <strong>CSV File Ingested</strong>
                <p>Click or drag new file to replace</p>
              </div>
            ) : (
              <div className="dropzone-text">
                <span className="icon">📥</span>
                <strong>{db ? 'Drag CSV file here' : 'Initialize Database First'}</strong>
                <p>{db ? 'or click to browse local files' : 'Ingestion blocked'}</p>
              </div>
            )}
          </div>

          {/* Columns Explorer */}
          {csvUploaded && (
            <div className="columns-explorer section-spacing">
              <h3>Ingested &amp; Calculated Columns:</h3>
              <div className="tags-container">
                {columns.map((col) => (
                  <span key={col} className="tag-column">{col}</span>
                ))}
                {calculatedFields.map((cf) => (
                  <span key={cf.id} className="tag-column computed" title={`Formula: ${cf.expression}`}>
                    {cf.name} (fx)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Calculated Fields Panel */}
          <h2 className="section-spacing">3. Calculated Fields</h2>
          {csvUploaded ? (
            <>
              <form onSubmit={handleAddCalculatedField} className="calc-field-form">
                <div className="form-group">
                  <label htmlFor="cf-name">Field Name</label>
                  <input
                    id="cf-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Profit_Margin"
                    value={cfName}
                    onChange={(e) => setCfName(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group" style={{ position: 'relative' }}>
                  <label htmlFor="cf-expr">Formula Expression</label>
                  <input
                    id="cf-expr"
                    type="text"
                    className="form-control"
                    placeholder="e.g. [REVENUE] - [COST]"
                    value={cfExpression}
                    onChange={(e) => handleFormulaChange(e.target.value)}
                    required
                    autoComplete="off"
                  />
                  {showAutoComplete && autoCompleteFiltered.length > 0 && (
                    <div className="autocomplete-suggestions">
                      {autoCompleteFiltered.map(col => (
                        <div
                          key={col}
                          className="autocomplete-item"
                          onClick={() => insertAutoCompleteColumn(col)}
                        >
                          📋 {col}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="cf-type">Output Type</label>
                  <select
                    id="cf-type"
                    className="form-control"
                    value={cfOutputType}
                    onChange={(e) => setCfOutputType(e.target.value)}
                  >
                    <option value="DOUBLE">DOUBLE</option>
                    <option value="INTEGER">INTEGER</option>
                    <option value="VARCHAR">VARCHAR</option>
                  </select>
                </div>

                {cfPreviewSQL && (
                  <div className="calc-preview preview-success">
                    ✓ SQL Preview: <code>{cfPreviewSQL}</code>
                  </div>
                )}

                {cfError && (
                  <div className="calc-preview preview-error">
                    ✗ Parser error: {cfError}
                  </div>
                )}

                <button type="submit" className="btn btn-secondary btn-tiny" disabled={!!cfError || !cfName || !cfExpression}>
                  Add Calculated Column
                </button>
              </form>

              {calculatedFields.length > 0 && (
                <div className="calc-list">
                  {calculatedFields.map((cf) => (
                    <div key={cf.id} className="calc-item">
                      <div className="calc-item-info">
                        <span className="calc-item-name">{cf.name}</span>
                        <span className="calc-item-expr">{cf.expression}</span>
                        <span className="calc-item-type">{cf.outputType}</span>
                      </div>
                      <button 
                        className="btn-delete"
                        onClick={() => handleDeleteCalculatedField(cf.id)}
                        title="Delete Calculated Field"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="calc-tip">
              Ingest a CSV data source first to unlock Calculated Field design panel.
            </div>
          )}

          {/* Widget Composer Panel */}
          <h2 className="section-spacing">4. Add Visual Widget</h2>
          {csvUploaded ? (
            <form onSubmit={handleAddWidget} className="calc-field-form">
              <div className="form-group">
                <label htmlFor="w-title">Widget Title</label>
                <input
                  id="w-title"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Sales by Category"
                  value={widgetTitle}
                  onChange={(e) => setWidgetTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="w-type">Chart Type</label>
                <select
                  id="w-type"
                  className="form-control"
                  value={widgetType}
                  onChange={(e) => setWidgetType(e.target.value)}
                >
                  <option value="builtin.bar_chart">Bar Chart</option>
                  <option value="builtin.line_chart">Line Chart</option>
                  <option value="builtin.kpi_card">KPI Card</option>
                  <option value="builtin.donut_chart">Donut Chart</option>
                  <option value="builtin.scatter_plot">Scatter Plot</option>
                  <option value="builtin.sparkline">Sparkline</option>
                </select>
              </div>

              <div className="composer-row">
                {widgetType !== 'builtin.kpi_card' ? (
                  <>
                    <div className="form-group">
                      <label htmlFor="w-dim">Dimension (X-Axis)</label>
                      <select
                        id="w-dim"
                        className="form-control"
                        value={widgetDim}
                        onChange={(e) => setWidgetDim(e.target.value)}
                      >
                        {allColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="w-meas">Measure</label>
                      <select
                        id="w-meas"
                        className="form-control"
                        value={widgetMeas}
                        onChange={(e) => setWidgetMeas(e.target.value)}
                      >
                        {allColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label htmlFor="w-meas">Measure</label>
                    <select
                      id="w-meas"
                      className="form-control"
                      value={widgetMeas}
                      onChange={(e) => setWidgetMeas(e.target.value)}
                    >
                      {allColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="w-agg">Aggregation</label>
                <select
                  id="w-agg"
                  className="form-control"
                  value={widgetAgg}
                  onChange={(e) => setWidgetAgg(e.target.value as any)}
                >
                  <option value="SUM">SUM</option>
                  <option value="AVG">AVG</option>
                  <option value="COUNT">COUNT</option>
                  <option value="MIN">MIN</option>
                  <option value="MAX">MAX</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="w-limit">Result Limit (Top N)</label>
                <select
                  id="w-limit"
                  className="form-control"
                  value={widgetLimit}
                  onChange={(e) => setWidgetLimit(Number(e.target.value))}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>

              <button type="submit" className="btn btn-secondary btn-tiny" disabled={!widgetTitle || !widgetMeas || (widgetType !== 'builtin.kpi_card' && widgetType !== 'builtin.sparkline' && !widgetDim)}>
                Add Chart Widget
              </button>
            </form>
          ) : (
            <div className="calc-tip">
              Ingest a CSV data source first to design visual queries.
            </div>
          )}

          {/* Semantic Formatting & Metadata Panel */}
          <h2 className="section-spacing">5. Semantic Formatting</h2>
          {csvUploaded ? (
            <div className="semantic-explorer">
              <div className="calc-tip" style={{ marginBottom: '12px' }}>
                Define human-readable labels and cell formats for query results &amp; visual charts.
              </div>
              <div className="semantic-list">
                {allColumns.map((col) => (
                  <div key={col} className="semantic-item">
                    <span className="semantic-col-name" title={col}>{col}</span>
                    <div className="semantic-inputs">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder={col}
                        value={columnLabels[col] || ''}
                        onChange={(e) => setColumnLabel(col, e.target.value)}
                        title="Display Label Override"
                      />
                      <select
                        className="form-control form-control-sm"
                        value={columnFormats[col] || 'default'}
                        onChange={(e) => setColumnFormat(col, e.target.value)}
                        title="Value Display Format"
                      >
                        <option value="default">Default</option>
                        <option value="currency">Currency ($)</option>
                        <option value="percentage">Percentage (%)</option>
                        <option value="number">Number (1,234)</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="calc-tip">
              Ingest a CSV data source first to configure semantic labeling &amp; formatting.
            </div>
          )}

          {/* Cross-Filtering Exclusions Panel */}
          <h2 className="section-spacing">6. Cross-Filtering Exclusions</h2>
          {csvUploaded && widgets.length > 0 ? (
            <div className="semantic-explorer">
              <div className="calc-tip" style={{ marginBottom: '12px' }}>
                Select widgets to exclude them from sending or receiving cross-filtering interactions.
              </div>
              <div className="semantic-list">
                {widgets.map((w) => (
                  <div key={w.id} className="semantic-item" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', gap: '8px' }}>
                    <span className="semantic-col-name" style={{ fontSize: '0.8rem', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden' }}>{w.title}</span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <input
                        type="checkbox"
                        checked={crossFilterExclusions.includes(w.id)}
                        onChange={() => toggleCrossFilterExclusion(w.id)}
                      />
                      Exclude
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="calc-tip">
              Add visual widgets to customize cross-filtering links and exclusions.
            </div>
          )}

          {/* Day 4: Auto-Save & Version Checkpoints UI */}
          <h2 className="section-spacing">7. Version History &amp; Auto-Save</h2>
          <div className="version-history-panel">
            <div className="autosave-status-badge">
              <span className="icon">💾</span>
              <div>
                <strong>Auto-Save Status</strong>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{saveStatus}</p>
              </div>
            </div>

            <form onSubmit={handleSaveVersion} className="calc-field-form section-spacing">
              <h4>Create Checkpoint</h4>
              <div className="form-group">
                <label htmlFor="version-name">Version Name</label>
                <input
                  id="version-name"
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g., Before cleaning categories"
                  value={versionNameInput}
                  onChange={(e) => setVersionNameInput(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="version-desc">Description</label>
                <input
                  id="version-desc"
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Optional details..."
                  value={versionDescInput}
                  onChange={(e) => setVersionDescInput(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-secondary btn-tiny" disabled={!versionNameInput.trim()}>
                📸 Save Checkpoint
              </button>
            </form>

            {savedVersions.length > 0 && (
              <div className="version-list-container">
                <h4>Saved Checkpoints</h4>
                <div className="version-list">
                  {savedVersions.map((v) => (
                    <div key={v.id} className="version-item" onClick={() => handleRestoreVersion(v)} title="Click to restore this checkpoint">
                      <div className="version-info">
                        <div className="version-name">{v.name}</div>
                        {v.description && <div className="version-desc">{v.description}</div>}
                        <div className="version-meta">
                          <span>{new Date(v.updatedAt).toLocaleString()}</span>
                          <span>({v.data.widgets?.length || 0} widgets)</span>
                        </div>
                      </div>
                      <button 
                        className="btn-delete-version" 
                        onClick={(e) => handleDeleteVersion(v.id, e)} 
                        title="Delete checkpoint"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Query Editor & Analytics Console */}
        <section className="card query-console">
          <h2>7. Analytical Query Console</h2>
          <div className="query-editor-wrapper">
            <textarea
              className="query-input"
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              disabled={!csvUploaded}
              placeholder="SELECT * FROM data_table_view LIMIT 10..."
            />
          </div>
          
          <div className="query-actions">
            <button 
              className="btn btn-secondary" 
              onClick={() => runQuery()} 
              disabled={loading || !csvUploaded}
            >
              {loading ? 'Running...' : 'Execute SQL Query'}
            </button>

            {csvUploaded && (
              <div className="quick-queries">
                <button 
                  onClick={() => {
                    const q = 'SELECT COUNT(*) as total_rows FROM data_table_view'
                    setSqlQuery(q)
                    runQuery(q)
                  }}
                  className="btn btn-tiny"
                >
                  Count Rows
                </button>
                <button 
                  onClick={() => {
                    const q = 'SELECT * FROM data_table_view LIMIT 5'
                    setSqlQuery(q)
                    runQuery(q)
                  }}
                  className="btn btn-tiny"
                >
                  Preview 5 Rows
                </button>
              </div>
            )}
          </div>

          {execTimeMs !== null && (
            <div className="telemetry-log">
              ⚡ Executed in <strong>{execTimeMs}ms</strong>
            </div>
          )}

          {/* Day 3: Query History */}
          {queryHistory.length > 0 && (
            <div className="query-history-section">
              <button className="query-history-toggle" onClick={() => setShowQueryHistory(!showQueryHistory)}>
                {showQueryHistory ? '▾' : '▸'} Query History ({queryHistory.length})
                {queryHistory.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); clearQueryHistory(); }}>
                    Clear
                  </span>
                )}
              </button>
              {showQueryHistory && (
                <div className="query-history-list">
                  {queryHistory.map((qh) => (
                    <div
                      key={qh.id}
                      className={`query-history-item ${qh.status === 'error' ? 'error' : ''}`}
                      onClick={() => {
                        setSqlQuery(qh.sql)
                        runQuery(qh.sql)
                      }}
                      title="Click to re-run this query"
                    >
                      <div className="query-history-sql">{qh.sql}</div>
                      <div className="query-history-meta">
                        <span>{new Date(qh.executedAt).toLocaleTimeString()}</span>
                        {qh.status === 'success' ? (
                          <>
                            <span className="time-badge">⚡ {qh.executionTimeMs}ms</span>
                            <span>{qh.rowCount} rows</span>
                          </>
                        ) : (
                          <span className="error-badge">✗ Error</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Day 4: AI Copilot Section */}
        <section className="card query-copilot-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>🤖 AI Query Copilot (Natural Language SQL)</h2>
            <button className="btn btn-tiny btn-secondary" onClick={() => setShowCopilotSettings(!showCopilotSettings)}>
              ⚙️ Copilot Settings
            </button>
          </div>

          {showCopilotSettings && (
            <div className="copilot-settings-box card" style={{ marginBottom: '16px', padding: '12px' }}>
              <h4>Copilot Engine Settings</h4>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label htmlFor="copilot-mode">Translation Mode</label>
                <select 
                  id="copilot-mode"
                  className="form-control" 
                  value={copilotMode} 
                  onChange={(e: any) => setCopilotMode(e.target.value)}
                >
                  <option value="local">Local Compiler (No API Key Required)</option>
                  <option value="gemini">Gemini API (Key Required)</option>
                  <option value="openai">OpenAI API (Key Required)</option>
                </select>
              </div>

              {copilotMode === 'gemini' && (
                <div className="form-group">
                  <label htmlFor="gemini-key">Gemini API Key</label>
                  <input 
                    id="gemini-key"
                    type="password" 
                    className="form-control" 
                    placeholder="AIzaSy..." 
                    value={geminiKey} 
                    onChange={(e) => setGeminiKey(e.target.value)} 
                  />
                  <p className="help-text">Your key is stored locally in your browser.</p>
                </div>
              )}

              {copilotMode === 'openai' && (
                <div className="form-group">
                  <label htmlFor="openai-key">OpenAI API Key</label>
                  <input 
                    id="openai-key"
                    type="password" 
                    className="form-control" 
                    placeholder="sk-proj-..." 
                    value={openAIKey} 
                    onChange={(e) => setOpenAIKey(e.target.value)} 
                  />
                  <p className="help-text">Your key is stored locally in your browser.</p>
                </div>
              )}
            </div>
          )}

          <div className="copilot-input-wrapper">
            <textarea
              className="copilot-input"
              value={copilotPrompt}
              onChange={(e) => setCopilotPrompt(e.target.value)}
              disabled={!csvUploaded}
              placeholder={csvUploaded ? "Ask a question (e.g. 'average Revenue by Category' or 'total Profit where year = 2025')" : "Ingest CSV data to enable AI Copilot"}
            />
            <button 
              className="btn btn-primary btn-glow btn-copilot-submit"
              onClick={handleCopilotGenerate}
              disabled={copilotLoading || !csvUploaded || !copilotPrompt.trim()}
            >
              {copilotLoading ? 'Thinking...' : '✨ Generate SQL'}
            </button>
          </div>

          {copilotError && (
            <div className="error-alert" style={{ marginTop: '16px' }}>
              <strong>Copilot Error:</strong> {copilotError}
            </div>
          )}

          {copilotResult && (
            <div className="copilot-result-box" style={{ marginTop: '16px' }}>
              <div className="copilot-explanation">
                💡 <strong>Heuristic Translation:</strong> {copilotExplanation}
              </div>
              <div className="copilot-sql-preview">
                <pre><code>{copilotResult}</code></pre>
              </div>
              <div className="copilot-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn btn-secondary btn-tiny btn-glow" onClick={handleApplyCopilotSQL}>
                  ▶ Run SQL in Console
                </button>
                <button className="btn btn-secondary btn-tiny btn-glow" onClick={handleCreateWidgetFromCopilot}>
                  📊 Add Auto-Widget to Canvas
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Results Pane */}
        <section className="card results-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>8. Output Datagrid</h2>
            {queryResult && queryResult.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-tiny" onClick={() => exportQueryResult('csv')} title="Export current query result to CSV">
                  📄 Export CSV
                </button>
                <button className="btn btn-tiny" onClick={() => exportQueryResult('parquet')} title="Export current query result to Parquet">
                  📦 Export Parquet
                </button>
              </div>
            )}
          </div>
          {queryError && (
            <div className="error-alert">
              <strong>Query Error:</strong>
              <pre>{queryError}</pre>
            </div>
          )}

          {queryResult && queryResult.length > 0 ? (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    {Object.keys(queryResult[0]).map((key) => (
                      <th 
                        key={key} 
                        onClick={() => handleSort(key)} 
                        className="sortable-header"
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span>{columnLabels[key] || key}</span>
                          <span style={{ fontSize: '0.7rem', opacity: sortColumn === key ? 1 : 0.3 }}>
                            {sortColumn === key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr className="filter-row">
                    {Object.keys(queryResult[0]).map((key) => (
                      <th key={`filter-${key}`} style={{ padding: '4px 8px', background: 'rgba(0, 0, 0, 0.15)' }}>
                        <input
                          type="text"
                          className="grid-filter-input"
                          placeholder="Filter..."
                          value={columnFilters[key] || ''}
                          onChange={(e) => {
                            setColumnFilters(prev => ({
                              ...prev,
                              [key]: e.target.value
                            }))
                          }}
                          onClick={(e) => e.stopPropagation()} // Prevent sorting toggle
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processedQueryResult && processedQueryResult.length > 0 ? (
                    processedQueryResult.map((row, idx) => (
                      <tr key={idx}>
                        {Object.keys(row).map((key, cellIdx) => (
                          <td key={cellIdx}>{formatValue(row[key], columnFormats[key] || 'default')}</td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={Object.keys(queryResult[0]).length} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No rows match active column filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              {csvUploaded 
                ? 'Run a query to display rows' 
                : 'No data source ingested. Ingest a CSV and execute SQL to inspect rows.'}
            </div>
          )}
        </section>

        {/* Dashboard Visual Canvas */}
        {csvUploaded && widgets.length > 0 && (
          <section className="dashboard-canvas-section">
            <h2>9. Dashboard Visual Canvas (Collaborative Yjs Sync Active — Drag to Reorder)</h2>
            <div className="dashboard-canvas">
              {widgets.map((widget, idx) => (
                <WidgetRenderer 
                  key={widget.id} 
                  widget={widget} 
                  db={db}
                  rebuildTrigger={calculatedFields.length + calculatedFields.map(f => f.expression + f.name).join('')}
                  onDelete={handleDeleteWidget}
                  onDrillDown={openDrillDown}
                  index={idx}
                  isDragging={dragIndex === idx}
                  isDragOver={dragOverIndex === idx}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </section>
        )}

        {/* Day 3: Data Profiler Section */}
        {csvUploaded && (
          <section className="card profiler-section">
            <div className="profiler-header">
              <h2>10. Data Profiler</h2>
              <button
                className="btn btn-tiny"
                onClick={runDataProfiler}
                disabled={profiling}
              >
                {profiling ? '⏳ Profiling...' : '🔬 Profile Columns'}
              </button>
            </div>

            {profiling && (
              <div className="profiler-progress">
                <div className="profiler-progress-bar">
                  <div className="profiler-progress-fill" style={{ width: `${profileTotal > 0 ? (profileProgress / profileTotal) * 100 : 0}%` }} />
                </div>
                <span className="profiler-progress-text">{profileProgress}/{profileTotal} columns</span>
              </div>
            )}

            {profileResults.length > 0 && (
              <div className="profiler-grid">
                {profileResults.map((profile) => (
                  <div key={profile.columnName} className="profile-card">
                    <div className="profile-card-header">
                      <span className="profile-col-name">{profile.columnName}</span>
                      <span className={`profile-col-type ${profile.dataType}`}>{profile.dataType}</span>
                    </div>

                    <div className="profile-stats">
                      <div className="profile-stat">
                        <span className="profile-stat-label">Rows</span>
                        <span className="profile-stat-value">{profile.totalRows.toLocaleString()}</span>
                      </div>
                      <div className="profile-stat">
                        <span className="profile-stat-label">Nulls</span>
                        <span className="profile-stat-value">{profile.nullCount.toLocaleString()}</span>
                      </div>
                      <div className="profile-stat">
                        <span className="profile-stat-label">Distinct</span>
                        <span className="profile-stat-value">{profile.distinctCount.toLocaleString()}</span>
                      </div>

                      {profile.dataType === 'numeric' && (
                        <>
                          <div className="profile-stat">
                            <span className="profile-stat-label">Min</span>
                            <span className="profile-stat-value">{profile.min !== undefined ? profile.min.toLocaleString() : '—'}</span>
                          </div>
                          <div className="profile-stat">
                            <span className="profile-stat-label">Max</span>
                            <span className="profile-stat-value">{profile.max !== undefined ? profile.max.toLocaleString() : '—'}</span>
                          </div>
                          <div className="profile-stat">
                            <span className="profile-stat-label">Mean</span>
                            <span className="profile-stat-value">{profile.mean !== undefined ? profile.mean.toFixed(2) : '—'}</span>
                          </div>
                          <div className="profile-stat">
                            <span className="profile-stat-label">Median</span>
                            <span className="profile-stat-value">{profile.median !== undefined ? profile.median.toFixed(2) : '—'}</span>
                          </div>
                          <div className="profile-stat">
                            <span className="profile-stat-label">StdDev</span>
                            <span className="profile-stat-value">{profile.stddev !== undefined ? profile.stddev.toFixed(2) : '—'}</span>
                          </div>
                        </>
                      )}

                      {profile.dataType === 'string' && profile.avgLength !== undefined && (
                        <div className="profile-stat">
                          <span className="profile-stat-label">Avg Length</span>
                          <span className="profile-stat-value">{profile.avgLength.toFixed(1)}</span>
                        </div>
                      )}

                      {profile.dataType === 'temporal' && (
                        <>
                          <div className="profile-stat">
                            <span className="profile-stat-label">Min Date</span>
                            <span className="profile-stat-value">{profile.minDate || '—'}</span>
                          </div>
                          <div className="profile-stat">
                            <span className="profile-stat-label">Max Date</span>
                            <span className="profile-stat-value">{profile.maxDate || '—'}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Top values distribution bars */}
                    {profile.topValues && profile.topValues.length > 0 && (
                      <div className="profile-top-values">
                        {profile.topValues.map((tv, tvIdx) => {
                          const maxCount = profile.topValues![0]!.count || 1
                          return (
                            <div key={tvIdx} className="profile-top-value-bar">
                              <span className="profile-top-value-label" title={tv.value}>{tv.value}</span>
                              <div className="profile-top-value-track">
                                <div className="profile-top-value-fill" style={{ width: `${(tv.count / maxCount) * 100}%` }} />
                              </div>
                              <span className="profile-top-value-count">{tv.count}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!profiling && profileResults.length === 0 && (
              <div className="calc-tip">
                Click "Profile Columns" to automatically compute statistics for every ingested column.
              </div>
            )}
          </section>
        )}
      </main>

      {/* Day 3: Drill-Down Modal */}
      {drillDown && (
        <div className="drill-modal-overlay" onClick={() => { setDrillDown(null); setDrillDownData(null); }}>
          <div className="drill-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drill-modal-header">
              <div>
                <div className="drill-modal-title">🔎 Drill-Down: {drillDown.column} = "{drillDown.value}"</div>
                <div className="drill-modal-subtitle">
                  Raw rows from {drillDown.widget.title} — filtered by {drillDown.column}
                </div>
              </div>
              <button className="drill-modal-close" onClick={() => { setDrillDown(null); setDrillDownData(null); }}>
                ×
              </button>
            </div>

            {drillDownLoading && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Running drill-down query...
              </div>
            )}

            {drillDownData && drillDownData.length > 0 && (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      {Object.keys(drillDownData[0]).map((key) => (
                        <th key={key}>{columnLabels[key] || key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillDownData.map((row, idx) => (
                      <tr key={idx}>
                        {Object.keys(row).map((key, cellIdx) => (
                          <td key={cellIdx}>{formatValue(row[key], columnFormats[key] || 'default')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {drillDownData && drillDownData.length === 0 && !drillDownLoading && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No matching rows found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface WidgetRendererProps {
  widget: Widget
  db: duckdb.AsyncDuckDB | null
  rebuildTrigger: string
  onDelete: (id: string) => void
  onDrillDown: (column: string, value: string, widget: Widget) => void
  index: number
  isDragging: boolean
  isDragOver: boolean
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragLeave: () => void
  onDrop: (index: number) => void
  onDragEnd: () => void
}

function WidgetRenderer({ widget, db, rebuildTrigger, onDelete, onDrillDown, index, isDragging, isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: WidgetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { globalFilters, crossFilters, crossFilterExclusions } = useDashboardStore()
  const [showCardinalityWarning, setShowCardinalityWarning] = useState(false)

  // Re-run the visual query against DuckDB WASM whenever DB, calculated fields, or filters change
  useEffect(() => {
    if (!db) return
    let active = true
    const run = async () => {
      try {
        setLoading(true)

        // Compose global and cross filters (from other widgets)
        const composedFilters = [...(widget.query.filters || [])]

        globalFilters.forEach(gf => {
          if (gf.value !== undefined && gf.value !== null && gf.value !== '') {
            composedFilters.push({
              column: gf.column,
              operator: 'EQUALS',
              value: gf.value
            })
          }
        })

        Object.entries(crossFilters).forEach(([otherWidgetId, cf]) => {
          const isTargetExcluded = crossFilterExclusions.includes(widget.id)
          const isSourceExcluded = crossFilterExclusions.includes(otherWidgetId)
          if (!isTargetExcluded && !isSourceExcluded) {
            if (otherWidgetId !== widget.id && cf && cf.value !== undefined && cf.value !== null && cf.value !== '') {
              composedFilters.push({
                column: cf.column,
                operator: 'EQUALS',
                value: cf.value
              })
            }
          }
        })

        const activeQuery = {
          ...widget.query,
          filters: composedFilters
        }

        const sql = compileVisualQueryToSQL('data_table_view', activeQuery)
        const conn = await db.connect()
        const res = await conn.query(sql)
        await conn.close()

        if (active) {
          const rows = res.toArray().map((row: any) => {
            const obj: Record<string, any> = {}
            for (const key of Object.keys(row)) {
              const val = row[key]
              obj[key] = typeof val === 'bigint' ? val.toString() : val
            }
            return obj
          })
          setData(rows)
          setError(null)

          const maxDistinct = widget.query.cardinalityGuard?.maxDistinct || 30
          setShowCardinalityWarning(rows.length >= maxDistinct)
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to query widget data')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    run()
    return () => {
      active = false
    }
  }, [db, widget.query, rebuildTrigger, globalFilters, crossFilters, crossFilterExclusions])

  // Draw chart in the visual container using the registered plugin
  useEffect(() => {
    if (containerRef.current && data) {
      const plugin = visualRegistry.get(widget.type)
      if (plugin) {
        plugin.render(containerRef.current, widget, data)
      }
    }
  }, [data, widget])

  const measure = widget.query.measures[0]
  const dimension = widget.query.dimensions[0]
  const subtitle = measure && dimension
    ? `${measure.aggregation}(${measure.column}) by ${dimension}`
    : 'Custom Visualization'

  const cardClasses = [
    'card',
    'widget-card',
    isDragging ? 'dragging' : '',
    isDragOver ? 'drag-over' : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cardClasses}
      draggable="true"
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
    >
      <div className="widget-header">
        <div>
          <div className="widget-title">{widget.title}</div>
          <div className="widget-info">{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Day 3: Drill-down button */}
          {dimension && (
            <button
              className="btn-delete"
              style={{ color: 'var(--primary-color)', fontSize: '0.8rem' }}
              onClick={() => {
                const activeCross = crossFilters[widget.id]
                if (activeCross) {
                  onDrillDown(activeCross.column, activeCross.value, widget)
                } else if (data && data.length > 0 && dimension) {
                  const firstVal = String(data[0][dimension] || '')
                  onDrillDown(dimension, firstVal, widget)
                }
              }}
              title="Drill down into data"
            >
              🔎
            </button>
          )}
          <button 
            className="btn-delete"
            onClick={() => onDelete(widget.id)}
            title="Delete Widget"
          >
            🗑
          </button>
        </div>
      </div>

      {showCardinalityWarning && (
        <div className="cardinality-warning" title="Too many unique values. Rendering may be dense or truncated.">
          ⚠️ Cardinality limit: Top {widget.query.limit || 10} values shown.
        </div>
      )}

      <div className="widget-body" ref={containerRef}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '0.8rem' }}>
            Running query...
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', fontSize: '0.75rem', textAlign: 'center', padding: '10px' }}>
            Query Error: {error}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
