# Phase 1 data sync — performance notes

- Reads are cached in a warm Netlify Function instance for 60 seconds. This is best-effort instance memory, not a globally shared cache.
- Concurrent requests for the same range are coalesced.
- Source diagnostics use Sheets `values.batchGet`: one read request per spreadsheet (3 total for the 14 sources), instead of 14 parallel `values.get` requests.
- 429/5xx responses retry with exponential backoff and jitter.
- Pagination and search operate on cached in-memory rows; they do not trigger another Sheets read during the cache window.
- Cache may be cold after deploy or on a different serverless instance. A persistent shared cache can be added later if needed, but must be configured explicitly.
- Read-only: no operational source tab is written by these functions.
