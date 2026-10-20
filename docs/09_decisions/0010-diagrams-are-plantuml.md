# ADR 10. Diagrams are text, in PlantUML

- Status: Accepted

## Context

A diagram that is a file of an editor cannot be reviewed in a diff. Mermaid has
no activity diagram with swimlanes.

## Decision

A diagram is text in a fenced code block. PlantUML is preferred, with the
C4-PlantUML library for the diagrams of C4. Mermaid is used only when PlantUML
does not fit. An old Mermaid diagram is converted when its file is edited for
another reason.

## Consequences

- An extension is needed to preview PlantUML in VS Code, and
  `brew install plantuml` lets the AI check a diagram (see `CLAUDE.md`).
- GitHub does not render PlantUML in Markdown.
