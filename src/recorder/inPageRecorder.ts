import type { RecordingEvent, RecordingEventKind } from '../types/recording'

type EventListener = (event: RecordingEvent) => void

const labelFor = (target: HTMLElement) => target.getAttribute('data-rewind-label') || target.textContent?.trim().slice(0, 48) || target.tagName.toLowerCase()

export class InPageRecorder {
  private startedAt = 0
  private listener: EventListener | null = null
  private root: HTMLElement | null = null

  start(root: HTMLElement, listener: EventListener) {
    this.startedAt = performance.now()
    this.listener = listener
    this.root = root
    root.addEventListener('click', this.onClick)
    root.addEventListener('input', this.onInput)
    root.addEventListener('scroll', this.onScroll, true)
  }

  stop() {
    if (!this.root) return
    this.root.removeEventListener('click', this.onClick)
    this.root.removeEventListener('input', this.onInput)
    this.root.removeEventListener('scroll', this.onScroll, true)
    this.root = null
    this.listener = null
  }

  private capture(kind: RecordingEventKind, icon: string, label: string, description: string, target: HTMLElement, value?: string) {
    this.listener?.({ id: crypto.randomUUID(), timestamp: Math.round(performance.now() - this.startedAt), kind, icon, label, description, category: kind === 'click' ? 'Pointer interaction' : kind === 'type' ? 'Text input' : 'Viewport movement', target: target.dataset.rewindTarget || target.tagName.toLowerCase(), value })
  }

  private onClick = (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('button, a, input, [data-rewind-label]') : null
    if (target) this.capture('click', 'CLICK', `Clicked ${labelFor(target)}`, 'Pointer interaction recorded', target)
  }

  private onInput = (event: Event) => {
    const target = event.target instanceof HTMLInputElement ? event.target : null
    if (target) this.capture('type', 'TYPE', `Typed in ${labelFor(target)}`, `${target.value.length} character${target.value.length === 1 ? '' : 's'} recorded`, target, target.value)
  }

  private onScroll = (event: Event) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target) this.capture('scroll', 'SCROLL', 'Scrolled workspace', 'Viewport movement recorded', target)
  }
}
