---
'@lerna-labs/ekklesia-helpers': patch
---

Bound Blockfrost requests with a timeout and a retry

`BlockfrostProvider` called `fetch()` with no timeout, so a slow upstream could hold a request open indefinitely. Each attempt is now bounded by a 10 second `AbortController` timeout and retried once before the error propagates — matching the Koios and Handle.me behavior from 2.0.1.
