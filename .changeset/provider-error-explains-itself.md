---
'@lerna-labs/ekklesia-helpers': patch
---

Include the upstream explanation in `ProviderError` messages

A failed provider request reported only `[Koios] POST /tx_info failed`, so an
operator had to reproduce the request to learn why. Koios answers auth failures
with a plain text line that says exactly what is wrong, and we were discarding
it.

The status code and a bounded slice of the response body are now folded into
the message:

```
[Koios] POST /tx_info failed: HTTP 403 Subscription expired, Please renew your
token from https://koios.rest/Profile.html
```

Probing the live API with a genuinely expired token confirmed Koios returns
`403` with a distinct body for each failure mode: `Subscription expired` for a
lapsed subscription, `Unauthorized Auth Token` for an unrecognised one, and
`Malformed Auth Token` for a malformed one. The status alone cannot tell them
apart, which is why the body is worth surfacing.

Applies to both the Koios and Blockfrost providers. Bodies are truncated to 200
characters so an HTML error page cannot flood the logs, and a body that cannot
be read falls back to the status alone.
