---
"@lerna-labs/ekklesia-helpers": patch
---

`loadRoutes` now rejects when a route file fails to import. Previously a route file that threw on import was logged and skipped, and the call resolved normally, so a server could start with part of its API missing. The walk now continues past a failing file so every other route is still registered, then the call rejects with an error naming each file that failed and its message. A directory that cannot be read also rejects instead of being logged. Callers should let the rejection stop startup before `app.listen()`.
