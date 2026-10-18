(() => {
  if (window.__REWIND_RECORDER__) return
  window.__REWIND_RECORDER__ = true

  let active = false
  let startedAt = 0
  let lastScrollAt = 0

  // Applies to <input> AND <textarea>: the old check was input-only, so a
  // textarea named "password" or "secret" was recorded in clear text.
  const sensitive = (element) => (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && (
    element.type === 'password' || element.autocomplete?.includes('cc-') || element.autocomplete === 'one-time-code' ||
    /password|passcode|card|credit|cvv|secret|token|otp/i.test(`${element.name} ${element.id} ${element.autocomplete}`)
  )

  // Escape a value for use inside a double-quoted CSS attribute selector.
  const quoteAttr = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

  const selector = (element) => {
    if (element.id) return `#${CSS.escape(element.id)}`
    if (element.dataset.rewindTarget) return `[data-rewind-target=${quoteAttr(element.dataset.rewindTarget)}]`
    const name = element.getAttribute('name')
    if (name) return `${element.tagName.toLowerCase()}[name=${quoteAttr(name)}]`
    // No stable attribute to key off — fall back to a short nth-of-type path
    // instead of a bare tag name, so events stay distinguishable in the
    // inspector even on markup with no ids/names. Not a replay-grade
    // selector engine (that's a later phase), just a cheap improvement.
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
      if (node.id) { path[0] = `#${CSS.escape(node.id)}`; break }
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
    if (message.type === 'REWIND_SCROLL_TO') { window.scrollTo({ top: message.scrollY || 0, behavior: 'smooth' }); sendResponse({ ok: true }) }
  })
})()
