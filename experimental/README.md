# Experimental / Quarantined Modules

This directory contains experimental and unreferenced modules quarantined as part of Phase 0 (Task T0.3).

These modules were present in the repository but were unreachable from `daemon/main.ts` or `daemon/index.ts`:
- **`daemon-blobs/`**: Content-defined chunking (FastCDC), blob storage, and filesystem watcher.
- **`daemon-ai-search/`**: Vector embeddings, hybrid search, and vector store (Ollama connector remains active in core).
- **`daemon-clipboard/`**: Secondary clipboard store and high-entropy key scanner.
- **`daemon-ocr/`**: Bounding box store for OCR tokens.
- **`daemon-provenance/`**: Standalone provenance exporter adapter.
- **`db-migrations/`**: Raw SQL migration files (`002_v3_delta.sql`, `003_v4_cognitive.sql`) superseded by inline DDL.

## Architectural Invariant
1. Modules in this directory are **excluded from production builds** (`dist-daemon/`, `dist/`).
2. Modules in this directory are **excluded from test coverage claims** and CI verification until graduated.
3. User-facing documentation must never list or promise features residing in `/experimental`.
