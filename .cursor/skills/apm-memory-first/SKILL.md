---
name: apm-memory-first
description: Uses APM CLI as the primary memory loop for ongoing work. Use when handling coding, debugging, planning, or mixed general tasks where context must persist across turns, interruptions, and long-running sessions. Prefer frequent apm read/write updates to keep role, persistent memory, todos, detail, and chunks synchronized.
---

# APM Memory First

## Goal

Keep task memory continuously synchronized with `apm`, with high-frequency updates.

## When to apply

- Apply by default for general project work.
- Especially apply when tasks span multiple turns, branch changes, retries, or interruptions.
- Continue using it unless user explicitly asks to stop memory updates.

## Operating mode (high frequency)

Use this loop throughout a task:

1. **Start of task**
   - Run `apm read --json`.
   - Extract active task, unfinished todos, and relevant chunks.
   - If memory is stale/incomplete, update immediately.

2. **Before making a meaningful change**
   - Ensure current task exists in todos.
   - If missing, add/update todo (`apm tmp todos add` / `edit` / `priority`).
   - Record intent in `apm tmp detail` (short but concrete).

3. **After each meaningful step**
   - Update progress in `apm tmp detail` with what changed, impact, and next action.
   - Complete or reprioritize todos.
   - Add reusable insights to `apm chunks` with searchable keywords.

4. **When decisions or constraints appear**
   - Persist durable rules/decisions via `apm persist`.
   - Keep `apm role` aligned when collaboration style or execution policy changes.

5. **End of response / handoff point**
   - Ensure `apm tmp detail` reflects latest status and blockers.
   - Ensure top unfinished todo is accurate for next turn resume.
   - Run `apm read --json` once to verify memory consistency.

## Command policy

- Prefer structured updates over large free-text dumps.
- Prefer `edit` for incremental updates and `write` for full replacement.
- Keep todo entries specific and action-oriented.
- Use `chunks` for reusable technical context (APIs, pitfalls, decisions, paths).

## Minimal memory checklist

- [ ] `apm read --json` consumed for latest state
- [ ] current task represented in `tmp todos`
- [ ] `tmp detail` updated after key work
- [ ] durable info moved to `persist` when needed
- [ ] useful associations saved in `chunks`
- [ ] priorities/completions synced before finishing

## Quality guardrails

- Do not fabricate memory entries; record only confirmed facts.
- Keep updates concise, searchable, and future-resumable.
- If user requests less memory overhead, downgrade frequency but keep start/end sync.
