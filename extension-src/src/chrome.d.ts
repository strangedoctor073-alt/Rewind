// Intentionally minimal: this project has no network access to install
// @types/chrome right now, and the Timeline page only ever calls one chrome
// API surface (runtime.sendMessage). Replace this with @types/chrome when
// that becomes available instead of growing it ad hoc.
declare const chrome: {
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>
  }
}
