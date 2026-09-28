import { describe, expect, it, vi } from 'vitest'
import { InPageRecorder } from '../inPageRecorder'
import type { RecordingEvent } from '../../types/recording'

describe('InPageRecorder', () => {
  it('initializes and attaches event listeners to root container', () => {
    const root = document.createElement('div')
    const addEventListenerSpy = vi.spyOn(root, 'addEventListener')
    const recorder = new InPageRecorder()
    const listener = vi.fn()

    recorder.start(root, listener)

    expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('input', expect.any(Function))
    expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)

    recorder.stop()
  })

  it('captures click events with element metadata', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const button = document.createElement('button')
    button.setAttribute('data-rewind-label', 'Checkout')
    button.setAttribute('data-rewind-target', 'btn-checkout')
    root.appendChild(button)

    const events: RecordingEvent[] = []
    const recorder = new InPageRecorder()
    recorder.start(root, (ev) => events.push(ev))

    button.click()

    expect(events.length).toBe(1)
    expect(events[0].kind).toBe('click')
    expect(events[0].label).toBe('Clicked Checkout')
    expect(events[0].target).toBe('btn-checkout')

    recorder.stop()
    document.body.removeChild(root)
  })

  it('captures input events with entered text', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const input = document.createElement('input')
    input.setAttribute('data-rewind-label', 'Discount Voucher')
    input.setAttribute('data-rewind-target', 'input-voucher')
    root.appendChild(input)

    const events: RecordingEvent[] = []
    const recorder = new InPageRecorder()
    recorder.start(root, (ev) => events.push(ev))

    input.value = 'SAVE20'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(events.length).toBe(1)
    expect(events[0].kind).toBe('type')
    expect(events[0].label).toBe('Typed in Discount Voucher')
    expect(events[0].value).toBe('SAVE20')

    recorder.stop()
    document.body.removeChild(root)
  })

  it('cleans up event listeners when stopped', () => {
    const root = document.createElement('div')
    const removeEventListenerSpy = vi.spyOn(root, 'removeEventListener')
    const recorder = new InPageRecorder()
    recorder.start(root, vi.fn())
    recorder.stop()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('input', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
  })
})
