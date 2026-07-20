---
'@lerna-labs/ekklesia-helpers': minor
---

Distinguish credential and throttling failures from transient ones

`ProviderError` reported only `[Koios] POST /tx_info failed`, so callers could
neither see why a request failed nor tell a dead API key from a blip. Both are
now addressed.

**Messages carry the upstream explanation.** The status and a bounded slice of
the response body are folded in:

```
[Koios] POST /tx_info failed: HTTP 403 Subscription expired, Please renew your
token from https://koios.rest/Profile.html
```

This matters because a status alone is often ambiguous. Probing the live API
with a genuinely expired token showed Koios answers `403` for an expired
subscription, an unrecognised token, and a malformed one alike, and only the
body distinguishes them.

**Two subclasses carve out the failures retrying will not fix.** Both extend
`ProviderError`, so existing `instanceof ProviderError` handling keeps working
unchanged.

| error | statuses | meaning |
| --- | --- | --- |
| `ProviderAuthError` | 401, 403, 418 | credentials rejected; needs an operator |
| `ProviderRateLimitError` | 402, 429 | throttled or quota exhausted; wait and retry |
| `ProviderError` | everything else | transient; retry |

`ProviderRateLimitError` exposes `retryAfterSeconds` from the `Retry-After`
header when the provider sends one. Every `ProviderError` now also carries
`status` when the failure came from a response.

Applies to both the Koios and Blockfrost providers. The fallback provider is
still tried before any of these is raised.
