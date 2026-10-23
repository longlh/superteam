# ADR 13. The documents follow arc42, Views and Beyond, the C4 model and UML

- Status: Accepted
- Supersedes: ADR 9

## Context

ADR 9 chose arc42 for the chapters and the C4 model for the structure. The C4
model draws only the structure, so it is not enough to see the system from all
the views that it needs, such as the behavior over time, the states or the data.

## Decision

- The documents follow the 12 chapters of arc42, each one a folder named
  `NN_name`. The requirements and the use cases are in `01_introduction/`.
- The documents follow the mindset of Views and Beyond: the system is described
  by several views, and by what applies beyond them.
- The building blocks follow the C4 model, and are drawn with its diagrams. The
  documents of the structure do not hold a flow: the flows are in `06_runtime/`.
- The views that the C4 model does not draw are drawn with UML, such as the
  sequence diagrams of the flows.
- The method is described in `02_constraints/constraints.md`.

## Consequences

- A chapter that has no content yet is an empty folder with a `.gitkeep`.
- The known issues and the open questions are gathered in `11_risks-and-debts/`.
- The legacy documents of `docs/draft/` are not migrated, and they are removed.
- The diagrams of the C4 model and of UML are both written in PlantUML (see ADR
  10).
