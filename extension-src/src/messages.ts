import type { BrowserRecording, RecordingSummary, RewindResult } from './types'

async function send<T>(message: Record<string, unknown>): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as (T & { error?: string }) | undefined
  if (!response) throw new Error('No response from the REWIND background service.')
  if (response.error) throw new Error(response.error)
  return response
}

export async function listRecordings(): Promise<RecordingSummary[]> {
  const result = await send<{ recordings: RecordingSummary[] }>({ type: 'HISTORY_LIST' })
  return result.recordings
}

export async function getRecording(id: string): Promise<BrowserRecording | null> {
  const result = await send<{ recording: BrowserRecording | null }>({ type: 'HISTORY_GET', id })
  return result.recording
}

export async function deleteRecording(id: string): Promise<void> {
  await send<{ ok: true }>({ type: 'HISTORY_DELETE', id })
}

export async function clearHistory(): Promise<void> {
  await send<{ ok: true }>({ type: 'HISTORY_CLEAR' })
}

export async function rewindTo(recordingId: string, eventId: string): Promise<RewindResult> {
  return send<RewindResult>({ type: 'REWIND_TO', recordingId, eventId })
}
