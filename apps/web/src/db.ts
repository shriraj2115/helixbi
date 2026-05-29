class DashboardDB {
  private dbName = 'HelixBIDB'
  private version = 1

  init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('IndexedDB is only available in browser environments'))
        return
      }

      const request = window.indexedDB.open(this.dbName, this.version)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('autosave')) {
          db.createObjectStore('autosave', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('versions')) {
          db.createObjectStore('versions', { keyPath: 'id' })
        }
      }
    })
  }

  async saveAutosave(data: any): Promise<void> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('autosave', 'readwrite')
      const store = tx.objectStore('autosave')
      const request = store.put({
        id: 'current',
        data,
        updatedAt: new Date().toISOString()
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getAutosave(): Promise<any> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('autosave', 'readonly')
      const store = tx.objectStore('autosave')
      const request = store.get('current')
      request.onsuccess = () => resolve(request.result?.data || null)
      request.onerror = () => reject(request.error)
    })
  }

  async saveVersion(name: string, description: string, data: any): Promise<void> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readwrite')
      const store = tx.objectStore('versions')
      const request = store.put({
        id: `v_${Date.now()}`,
        name,
        description,
        data,
        updatedAt: new Date().toISOString()
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async listVersions(): Promise<any[]> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readonly')
      const store = tx.objectStore('versions')
      const request = store.getAll()
      request.onsuccess = () => {
        const list = request.result || []
        // Sort descending by date (newest first)
        list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        resolve(list)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteVersion(id: string): Promise<void> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readwrite')
      const store = tx.objectStore('versions')
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

export const dashboardDB = new DashboardDB()
