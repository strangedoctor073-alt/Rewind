/**
 * OcrOverlay.tsx
 * Renders invisible click-to-copy bounding box hit regions over a snapshot thumbnail.
 *
 * Usage:
 *   <OcrOverlay momentId="abc123" imageWidth={640} imageHeight={480} />
 *
 * Each OCR word becomes a transparent <button> positioned at its bounding box
 * coordinates (scaled from capture resolution to thumbnail display size).
 * Clicking any word copies it to the system clipboard.
 */

import { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror of daemon/ocr/boundingBoxStore.ts OcrBox)
// ─────────────────────────────────────────────────────────────────────────────

interface OcrBox {
  id: string;
  word: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  lineIndex: number;
  wordIndex: number;
}

interface Props {
  momentId: string;
  /** Displayed image element width in CSS pixels */
  displayWidth: number;
  /** Displayed image element height in CSS pixels */
  displayHeight: number;
  /** Original capture resolution width (for coordinate scaling) */
  captureWidth?: number;
  /** Original capture resolution height (for coordinate scaling) */
  captureHeight?: number;
  /** Called when the user copies a word */
  onCopy?: (word: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function OcrOverlay({
  momentId,
  displayWidth,
  displayHeight,
  captureWidth = 1920,
  captureHeight = 1080,
  onCopy,
}: Props) {
  const [boxes, setBoxes] = useState<OcrBox[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch bounding boxes from daemon RPC
  useEffect(() => {
    if (!momentId) return;
    let cancelled = false;

    const fetchBoxes = async () => {
      try {
        const resp = await fetch(`/api/ocr/boxes?momentId=${encodeURIComponent(momentId)}`);
        if (!resp.ok || cancelled) return;
        const data = await resp.json() as OcrBox[];
        if (!cancelled) setBoxes(data);
      } catch {
        // Daemon offline or not yet available — silently skip
      }
    };

    void fetchBoxes();
    return () => { cancelled = true; };
  }, [momentId]);

  const handleClick = useCallback(async (box: OcrBox) => {
    try {
      await navigator.clipboard.writeText(box.word);
      setCopiedId(box.id);
      onCopy?.(box.word);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard API not available (e.g. insecure context) — skip
    }
  }, [onCopy]);

  // Scale factor from capture coords → display coords
  const scaleX = displayWidth / captureWidth;
  const scaleY = displayHeight / captureHeight;

  if (boxes.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-label="OCR word overlay"
    >
      {boxes.map((box) => (
        <button
          key={box.id}
          title={`Copy: "${box.word}"`}
          aria-label={`Copy word: ${box.word}`}
          onClick={() => void handleClick(box)}
          style={{
            position: 'absolute',
            left:   box.x * scaleX,
            top:    box.y * scaleY,
            width:  box.width  * scaleX,
            height: box.height * scaleY,
            background: copiedId === box.id
              ? 'rgba(99, 255, 150, 0.35)'
              : 'transparent',
            border: copiedId === box.id
              ? '1px solid rgba(99, 255, 150, 0.8)'
              : '1px solid transparent',
            borderRadius: 2,
            cursor: 'copy',
            padding: 0,
            pointerEvents: 'all',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
        />
      ))}
    </div>
  );
}

export default OcrOverlay;
