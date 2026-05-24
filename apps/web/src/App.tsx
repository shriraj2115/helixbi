import { useState, useRef } from 'react'
import * as duckdb from '@duckdb/duckdb-wasm'
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
  const [sqlQuery, setSqlQuery] = useState('SELECT COUNT(*) FROM data_table')
  const [queryResult, setQueryResult] = useState<any[] | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [execTimeMs, setExecTimeMs] = useState<number | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  
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
      setStatus(`Table "${targetTable}" successfully created from ${file.name}`)
      await conn.close()
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
          // Serialize BigInt and other structures cleanly
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

  return (
    <div className="app-container">
      <header className="hero-header">
        <div className="branding">
          <span className="cyber-badge">PHASE 0 POC</span>
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

          {csvUploaded && (
            <div className="columns-explorer">
              <h3>Ingested Columns:</h3>
              <div className="tags-container">
                {columns.map((col) => (
                  <span key={col} className="tag-column">{col}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Query Editor & Analytics Console */}
        <section className="card query-console">
          <h2>3. Analytical Query Console</h2>
          <div className="query-editor-wrapper">
            <textarea
              className="query-input"
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              disabled={!csvUploaded}
              placeholder="SELECT * FROM data_table LIMIT 10..."
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
                    const q = 'SELECT COUNT(*) as total_rows FROM data_table'
                    setSqlQuery(q)
                    runQuery(q)
                  }}
                  className="btn btn-tiny"
                >
                  Count Rows
                </button>
                <button 
                  onClick={() => {
                    const q = 'SELECT * FROM data_table LIMIT 5'
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
          <h2>4. Output Datagrid</h2>
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
