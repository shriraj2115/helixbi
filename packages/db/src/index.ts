import { DataSource } from '@helixbi/types'

export class DuckDBPool {
  async connect(): Promise<void> {
    // Initializer placeholder
    console.warn('[HelixDB] Connecting to DuckDB...')
  }

  async query(sql: string): Promise<any[]> {
    console.warn('[HelixDB] Running query:', sql)
    return []
  }

  async ingestFile(dataSource: DataSource): Promise<void> {
    console.warn('[HelixDB] Ingesting file:', dataSource.name)
  }
}

export const dbPool = new DuckDBPool()
