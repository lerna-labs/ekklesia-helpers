---
'@lerna-labs/ekklesia-helpers': major
---

Resolve every handle an address holds, in a stable order (#8)

`fetchHandles(address)` is new and returns all of an address's handles rather
than one arbitrary pick, letting callers decide which one is "primary". The
order is deterministic: the holder's own default handle first where they have
set one, then shortest-first with a lexicographic tiebreak.

`fetchHandle(address)` keeps its signature and now returns the first entry of
that list. Previously it returned `data[0]` from an unsorted Koios response, so
an address holding several handles could resolve to a different name run to
run.

The Koios fallback also now looks up every handle asset it finds instead of only
the first, and non-error conditions ("No handle found", the Handle.me-to-Koios
fallback) no longer write to the console.

**Breaking:** the `CardanoProvider` interface replaces `fetchHandle(address):
Promise<string | null>` with `fetchHandles(address): Promise<string[]>`. Custom
provider implementations must be updated; callers of the exported helper
functions are unaffected.
