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
- Diagrams are text (diagram as text), written in a fenced code block in the
  Markdown file. Use PlantUML, and use Mermaid only when PlantUML does not fit.
  An old Mermaid diagram is converted only when its file is edited for another
  reason, so there is no extra review.
  - Mermaid: the code block is marked `mermaid`. The AI checks it with
    `npx @mermaid-js/mermaid-cli`, which downloads the package (and Chromium) to
    the cache of npx on the first run.
  - PlantUML: the code block is marked `plantuml`, and it starts with
    `@startuml` and ends with `@enduml`. An extension is needed to preview it in
    Markdown.

    ````
    ```plantuml
    @startuml
    Bob -> Alice : hello
    @enduml
    ```
    ````

  - Setup for PlantUML:
    - For a person: install the VS Code extension
      `myml.vscode-markdown-plantuml-preview`, to preview the diagram in
      Markdown.
    - For the AI: install it with `brew install plantuml` (it brings OpenJDK and
      Graphviz), so that the AI can check and render a diagram by itself.
