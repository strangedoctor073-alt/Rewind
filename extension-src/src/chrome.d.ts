// Intentionally minimal until this project adopts @types/chrome.
declare const chrome: {
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>
  }
  storage: {
    onChanged: {
      addListener: (listener: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void) => void
      removeListener: (listener: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void) => void
    }
  }
}
