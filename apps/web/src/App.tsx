import { useState, useRef, useEffect } from 'react'
import * as duckdb from '@duckdb/duckdb-wasm'
import { useDashboardStore } from '@helixbi/state'
import { compileFormula, generateViewSQL, parseAndCompileFormula, compileVisualQueryToSQL } from '@helixbi/engine'
import { canvasManager } from '@helixbi/canvas'
import { visualRegistry } from '@helixbi/visuals'
import { formatValue } from '@helixbi/semantic'
import { CalculatedField, Widget, VisualQuery } from '@helixbi/types'
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
  
  // Calculated Fields form state
  const [cfName, setCfName] = useState('')
  const [cfExpression, setCfExpression] = useState('')
  const [cfOutputType, setCfOutputType] = useState('DOUBLE')
  const [cfError, setCfError] = useState<string | null>(null)
  const [cfPreviewSQL, setCfPreviewSQL] = useState<string | null>(null)

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

  // Zustand Store
  const { 
    calculatedFields, addCalculatedField, removeCalculatedField,
    widgets, addWidget, removeWidget, setWidgets,
    columnFormats, columnLabels, setColumnFormat, setColumnLabel, loadDashboard,
    globalFilters, addGlobalFilter, removeGlobalFilter, clearGlobalFilters,
    crossFilters, clearCrossFilters,
    title, description, setDashboardTitle, setDashboardDescription
  } = useDashboardStore()
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileConfigInputRef = useRef<HTMLInputElement>(null)

  // Synchronize widgets list with Yjs collaborative canvas
  useEffect(() => {
    const unsubscribe = canvasManager.syncYjsToState((ywidgets) => {
      setWidgets(ywidgets)
    })
    return () => unsubscribe()
  }, [setWidgets])

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
      const cols = columnsRes.toArray().map((row: any) => row.column_name)
      
      setColumns(cols)
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
      setExecTimeMs(Math.round((end - start) * 100) / 100)
      
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
    } catch (err: any) {
      console.error(err)
      setQueryError(err.message || String(err))
      setQueryResult(null)
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
    const updatedFields = calculatedFields.filter(f => f.id !== id)
    removeCalculatedField(id)
    await rebuildDuckDBView(updatedFields)
  }

  // Step 6: Handle Visual Canvas Widgets
  const handleAddWidget = (e: React.FormEvent) => {
    e.preventDefault()
    if (!widgetTitle.trim() || !widgetDim || !widgetMeas) return

    const query: VisualQuery = {
      dimensions: [widgetDim],
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
      setDashboardTitle(tempTitle.trim())
    }
    setEditingTitle(false)
  }
  const startEditingDesc = () => {
    setTempDesc(description)
    setEditingDesc(true)
  }
  const saveDesc = () => {
    setDashboardDescription(tempDesc.trim())
    setEditingDesc(false)
  }

  // Ingested columns + calculated columns
  const allColumns = [
    ...columns,
    ...calculatedFields.map(cf => cf.name)
  ]

  return (
    <div className="app-container">
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
          <button className="btn btn-secondary" onClick={handleExportDashboard} title="Export Dashboard JSON config">
            📤 Export Config
          </button>
          <button className="btn btn-secondary" onClick={() => fileConfigInputRef.current?.click()} title="Import Dashboard JSON config">
            📥 Import Config
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
              <h3>Ingested & Calculated Columns:</h3>
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
                
                <div className="form-group">
                  <label htmlFor="cf-expr">Formula Expression</label>
                  <input
                    id="cf-expr"
                    type="text"
                    className="form-control"
                    placeholder="e.g. [REVENUE] - [COST]"
                    value={cfExpression}
                    onChange={(e) => handleFormulaChange(e.target.value)}
                    required
                  />
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
                </select>
              </div>

              <div className="composer-row">
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

              <button type="submit" className="btn btn-secondary btn-tiny" disabled={!widgetTitle || !widgetDim || !widgetMeas}>
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
                Define human-readable labels and cell formats for query results & visual charts.
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
              Ingest a CSV data source first to configure semantic labeling & formatting.
            </div>
          )}
        </section>

        {/* Query Editor & Analytics Console */}
        <section className="card query-console">
          <h2>6. Analytical Query Console</h2>
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
        </section>

        {/* Results Pane */}
        <section className="card results-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>7. Output Datagrid</h2>
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
                      <th key={key}>{columnLabels[key] || key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.map((row, idx) => (
                    <tr key={idx}>
                      {Object.keys(row).map((key, cellIdx) => (
                        <td key={cellIdx}>{formatValue(row[key], columnFormats[key] || 'default')}</td>
                      ))}
                    </tr>
                  ))}
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

        {/* Dashboard Visual Canvas (Task 16) */}
        {csvUploaded && widgets.length > 0 && (
          <section className="dashboard-canvas-section">
            <h2>8. Dashboard Visual Canvas (Collaborative Yjs Sync Active)</h2>
            <div className="dashboard-canvas">
              {widgets.map((widget) => (
                <WidgetRenderer 
                  key={widget.id} 
                  widget={widget} 
                  db={db}
                  rebuildTrigger={calculatedFields.length + calculatedFields.map(f => f.expression + f.name).join('')}
                  onDelete={handleDeleteWidget}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

interface WidgetRendererProps {
  widget: Widget
  db: duckdb.AsyncDuckDB | null
  rebuildTrigger: string
  onDelete: (id: string) => void
}

function WidgetRenderer({ widget, db, rebuildTrigger, onDelete }: WidgetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { globalFilters, crossFilters } = useDashboardStore()
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
          if (otherWidgetId !== widget.id && cf && cf.value !== undefined && cf.value !== null && cf.value !== '') {
            composedFilters.push({
              column: cf.column,
              operator: 'EQUALS',
              value: cf.value
            })
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
  }, [db, widget.query, rebuildTrigger, globalFilters, crossFilters])

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

  return (
    <div className="card widget-card">
      <div className="widget-header">
        <div>
          <div className="widget-title">{widget.title}</div>
          <div className="widget-info">{subtitle}</div>
        </div>
        <button 
          className="btn-delete"
          onClick={() => onDelete(widget.id)}
          title="Delete Widget"
        >
          🗑
        </button>
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
