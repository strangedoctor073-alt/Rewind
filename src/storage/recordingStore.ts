import type { Recording } from '../types/recording'

const databaseName = 'rewind-recordings'
const storeName = 'sessions'

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(databaseName, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

export async function saveRecording(recording: Recording) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(recording)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

export async function getRecording(id: string) {
  const database = await openDatabase()
  const recording = await new Promise<Recording | undefined>((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(id)
    request.onsuccess = () => resolve(request.result as Recording | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return recording
}
