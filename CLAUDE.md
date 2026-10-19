# Superteam

Goal: build `superteam`, a Claude Code plugin that runs a team of agents on any
project's own workflow.

- Chat in Vietnamese; write all plugin files in English.
- User is learning: explain step by step, only create files when asked.
- Changes: NEVER edit or write a file of the project before the user explicitly
  approves the exact text. This is a hard rule, not a preference.
  - Step 1: show the exact text to write and where it goes. Step 2: end the
    turn. Step 3: edit only if the user's next message clearly says yes to that
    text.
  - Not approval: a rationale, an opinion, a hedged answer, a direction ("move X
    to Y"), a correction of your understanding, or a reply to a different
    question. If you are unsure, ask one short question and stop.
  - Never ask for approval and edit in the same turn.
  - When the user has decided something, do exactly that. Do not reopen it with
    new options.
- When you rewrite, trim or move text in a file, make sure no information is
  lost. Before you remove a piece of text, check that it is still said somewhere
  else. If it is not, keep it or move it to the right place.
- After writing or editing a Markdown file, run `npx prettier --write <file>` on
  it.
