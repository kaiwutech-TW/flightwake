<!-- flightwake TRAPS — the trap registry. Non-obvious facts that will bite again. -->
<!-- Entries use an OKF-style convention: frontmatter block + body; link entries with [[name]]. Newest on top. -->
<!-- Aging: when an entry no longer holds (feature merged/refactored), don't delete it — set status to superseded and point to the replacement; readers only trust active. -->

# Trap Registry

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded (don't delete — change this field and point the body at the [[replacement]] or record)
tags: [{{tags}}]
discovered: {{YYYY-MM-DD}}
---

**Symptom**: {{What you saw (error message / weird behavior)}}
**Root cause**: {{One sentence}}
**Fix/workaround**: {{How to handle it}}
**Evidence**: {{commit/record link}}
