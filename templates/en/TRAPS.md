<!-- flightwake TRAPS — the trap registry. Non-obvious facts that will bite again. -->
<!-- Entries use an OKF-style convention: frontmatter block + body; link entries with [[name]]. Newest on top. -->
<!-- Aging: when an entry no longer holds (feature merged/refactored), don't delete it — set status to superseded and point to the replacement; readers only trust active. -->
<!-- Evidence strength: confidence rates the **root cause**, not the symptom. **Asymmetric bar** — to argue
     "this breaks", probable is enough (being wrong just costs extra caution); to argue "this is safe",
     it must be confirmed (being wrong hits prod and your users directly). -->

# Trap Registry

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded (don't delete — change this field and point the body at the [[replacement]] or record)
confidence: suspected  # confirmed (controlled experiment: toggle the cause → symptom appears/disappears, at least twice;
                       #            for non-causal facts: exhaustive verification + a primary source you can point at)
                       # probable (consistent across several observations, but no control)
                       # suspected (single observation, or "the most likely explanation at the time")
                       # field absent = unknown (legacy entry); readers treat it as suspected
tags: [{{tags}}]
discovered: {{YYYY-MM-DD}}
---

**Symptom**: {{What you saw (error message / weird behavior) — this field is always fact; paste the error verbatim}}
**Root cause**: {{One sentence. confidence rates exactly this field}}
**Fix/workaround**: {{How to handle it. Below confirmed, write only a "workaround" — never a "fix", and never treat it as a rule}}
**Evidence**: {{commit/record link; confirmed must point at a controlled experiment}}
