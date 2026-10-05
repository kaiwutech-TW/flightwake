<!-- flightwake Orca collaboration add-on (opt-in: setup or init --orca) — appended inside its own marker block next to the obligation table -->
## Orca collaboration (flightwake add-on)

When you are working inside Orca and want another agent to discuss or review something:
- Send the message into a visible Orca tab the user already has open, and read the reply from that tab. Don't start a background process (e.g. `codex exec`) — the user can't see it.
- No suitable tab open? Tell the user and ask. Don't decide on your own to fall back to a background run.
- Orca's commands change between versions: don't rely on remembered syntax — read the current guide with `orca skills get orca-cli`.

One writer (the Stop hook nags in every vendor's session; without a single writer both sides edit STATE at once):
- The agent that was asked to discuss or review writes no record and does not touch STATE; it hands its conclusion back to the agent that asked.
- The agent that asked writes the conclusions it adopts into its own record.
- Reviewers read, never edit — say so explicitly in a review request (a visible tab may have no read-only guard). Changes are made by the main-line agent, so every change stays in one side's record.

Review requests ask for a reply with four parts: the conclusion; the grounds (files and line numbers); what was not verified; approaches considered and not taken.
A review reply that affects a decision is saved verbatim as a file in the repo (like `docs/plans/<topic>.review-<reviewer>.md`): terminal screens don't persist, and the main line only receives the reviewer's final answer, not the process.
