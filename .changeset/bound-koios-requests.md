---
'@lerna-labs/ekklesia-helpers': patch
---

Bound Koios and Handle.me requests with a timeout and a retry

`KoiosProvider` and `fetchHandleMe` called `fetch()` with no timeout, so a slow upstream could hold a request open indefinitely. Each attempt is now bounded by a 10 second `AbortController` timeout and retried once before the error propagates.
