---
"@lerna-labs/ekklesia-helpers": patch
---

Raise the mongoose dependency floor to ^9.7.2, fixing a moderate-severity prototype pollution issue in update casting present in versions 9.0.0 through 9.7.1. Consumers of this package now resolve a patched mongoose on install.
