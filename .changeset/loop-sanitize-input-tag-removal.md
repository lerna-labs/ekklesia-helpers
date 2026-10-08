---
"@lerna-labs/ekklesia-helpers": patch
---

`sanitizeInput` now strips HTML tags and entities repeatedly until the text stops changing, instead of in a single pass. A single pass could leave two fragments that reassemble into markup once the text between them is removed, for example `<scr<script>ipt>` collapsing to `<script>`. Consumers importing `sanitizeInput` from `@lerna-labs/ekklesia-helpers/validation` get the fix automatically.
