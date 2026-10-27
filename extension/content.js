(() => {
  if (window.__REWIND_RECORDER__) return
  window.__REWIND_RECORDER__ = true

  let active = false
  let startedAt = 0
  let lastScrollAt = 0

  // Token-aware sensitive field detector: uses word boundaries to prevent false positives
  // (e.g. "cardinal" or "wildcard") while catching credentials, 2FA codes, payment tokens,
  // bank numbers, SSNs, and contenteditable fields.
  const SENSITIVE_TOKEN_REGEX = /\b(password|passcode|pass|card|credit|cvv|cvc|secret|token|otp|2fa|ssn|social-security|tax-id|bank|routing|account|pin)\b/i

  const sensitive = (element) => {
    if (!element) return false
    if (element.isContentEditable) {
      const aria = element.getAttribute('aria-label') || ''
      const role = element.getAttribute('role') || ''
      return SENSITIVE_TOKEN_REGEX.test(`${element.id} ${aria} ${role}`)
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.type === 'password') return true
      if (element.autocomplete && (element.autocomplete.includes('cc-') || element.autocomplete === 'one-time-code' || element.autocomplete.includes('password'))) return true
      const idOrName = `${element.name || ''} ${element.id || ''} ${element.autocomplete || ''} ${element.placeholder || ''}`
      return SENSITIVE_TOKEN_REGEX.test(idOrName)
    }
    return false
  }

  // Escape a value for use inside a double-quoted CSS attribute selector.
  const quoteAttr = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

  // Dynamic/generated IDs (React :r1:, CSS-in-JS hashes, long hex sequences) change
  // on every render and should NOT be prioritized over semantic attributes.
  const isDynamicId = (id) => !id || /^(:r|react-|css-|styled-|ember|\d{4,})/i.test(id) || /[a-f0-9]{8,}/i.test(id)

  const selector = (element) => {
    if (element.id && !isDynamicId(element.id)) return `#${CSS.escape(element.id)}`
    if (element.dataset.rewindTarget) return `[data-rewind-target=${quoteAttr(element.dataset.rewindTarget)}]`
    if (element.dataset.testid) return `[data-testid=${quoteAttr(element.dataset.testid)}]`
    if (element.dataset.test) return `[data-test=${quoteAttr(element.dataset.test)}]`
    const name = element.getAttribute('name')
    if (name) return `${element.tagName.toLowerCase()}[name=${quoteAttr(name)}]`
    // Fall back to a short nth-of-type path with dynamic-id suppression
    const path = []
    let node = element
    for (let depth = 0; node instanceof Element && depth < 4; depth += 1) {
      const parent = node.parentElement
      let part = node.tagName.toLowerCase()
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName)
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      }
      path.unshift(part)
      if (node.id && !isDynamicId(node.id)) { path[0] = `#${CSS.escape(node.id)}`; break }
      node = parent
    }
    return path.join(' > ')
  }

  const isFormField = (element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
  // Never use textContent for form fields: a <textarea>'s textContent is its
  // initial contents (the user's draft) and a <select>'s is every option.
  const label = (element) => element.getAttribute('aria-label') || element.getAttribute('data-rewind-label') ||
    (isFormField(element)
      ? element.getAttribute('placeholder') || element.getAttribute('name') || element.id
      : element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80)) || element.tagName.toLowerCase()

  const emit = (kind, icon, eventLabel, description, target, extra = {}) => {
    if (!active) return
    try {
      const sent = chrome.runtime.sendMessage({ type: 'REWIND_EVENT', event: {
        id: crypto.randomUUID(), timestamp: Math.round(performance.now() - startedAt),
        kind, icon, label: eventLabel, description, category: kind === 'click' ? 'Pointer interaction' : kind === 'type' ? 'Text input' : 'Viewport movement',
        target: selector(target), url: location.href, title: document.title, scrollX: window.scrollX, scrollY: window.scrollY, ...extra
      } })
      // The worker may be gone mid-flight; that must not surface as an unhandled rejection in the page.
      sent?.catch?.(() => {})
    } catch {
      // "Extension context invalidated" (the extension was reloaded/updated): stop quietly.
      active = false
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button, a, input, select, textarea, [role="button"]') : null
    if (target instanceof HTMLElement) emit('click', 'CLICK', `Clicked ${label(target)}`, 'Pointer interaction recorded', target)
  }, true)

  const inputDebounceMap = new WeakMap()
  // Typed values waiting out the 200ms debounce, so REWIND_STOP can flush them instead of losing them.
  const pendingInputFlushes = new Map()

  document.addEventListener('input', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    const masked = sensitive(target)

    const prevTimer = inputDebounceMap.get(target)
    if (prevTimer) clearTimeout(prevTimer)

    const flush = () => {
      clearTimeout(inputDebounceMap.get(target))
      inputDebounceMap.delete(target)
      pendingInputFlushes.delete(target)
      emit('type', 'TYPE', `Typed in ${label(target)}`, masked ? 'Sensitive field masked' : `${target.value.length} character${target.value.length === 1 ? '' : 's'} recorded`, target, { value: masked ? '[masked]' : target.value, masked })
    }

    pendingInputFlushes.set(target, flush)
    inputDebounceMap.set(target, setTimeout(flush, 200))
  }, true)

  window.addEventListener('scroll', () => {
    const timestamp = performance.now()
    if (timestamp - lastScrollAt < 350) return
    lastScrollAt = timestamp
    emit('scroll', 'SCROLL', 'Scrolled page', `Viewport moved to ${Math.round(window.scrollY)}px`, document.body)
  }, { passive: true })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'REWIND_START') { active = true; startedAt = performance.now(); sendResponse({ ok: true }); return }
    if (message.type === 'REWIND_STOP') { for (const flush of [...pendingInputFlushes.values()]) flush(); active = false; sendResponse({ ok: true, duration: Math.round(performance.now() - startedAt) }); return }
    // Scroll restoration should work even after recording has stopped, as
    // long as this page hasn't navigated away (which would tear this content
    // script down and make it unreachable — the background script handles
    // that failure case by simply not being able to message it).
    if (message.type === 'REWIND_SCROLL_TO') {
      window.scrollTo({ left: message.scrollX || 0, top: message.scrollY || 0, behavior: 'smooth' })
      sendResponse({ ok: true })
    }
  })
})()
