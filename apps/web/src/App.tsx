import { useState, useRef } from 'react'
import * as duckdb from '@duckdb/duckdb-wasm'
import { useDashboardStore } from '@helixbi/state'
import { compileFormula, generateViewSQL, parseAndCompileFormula } from '@helixbi/engine'
import { CalculatedField } from '@helixbi/types'
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

  // Zustand Store
  const { calculatedFields, addCalculatedField, removeCalculatedField } = useDashboardStore()
  
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className="app-container">
      <header className="hero-header">
        <div className="branding">
          <span className="cyber-badge">PHASE 1 POC</span>
          <h1>HelixBI</h1>
          <p className="subtitle">High-Performance Browser-Native Analytical Engine</p>
        </div>
        <div className="engine-status-card">
          <div className={`status-indicator ${db ? 'online' : 'offline'}`} />
          <span className="status-text">{status}</span>
        </div>
      </header>

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
        </section>

        {/* Query Editor & Analytics Console */}
        <section className="card query-console">
          <h2>4. Analytical Query Console</h2>
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
          <h2>5. Output Datagrid</h2>
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
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((val: any, cellIdx) => (
                        <td key={cellIdx}>{String(val)}</td>
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
      </main>
    </div>
  )
}

export default App
