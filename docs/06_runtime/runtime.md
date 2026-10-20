# Flows

The documents of the structure are in `05_building-blocks/`, and they follow the
C4 model. They do not change over time. The flows describe what happens over
time: each flow follows one thing through the parts that `05_building-blocks/`
describes, and answers one question.

| View        | Document         | Question                                                                  | Does not hold                 |
| ----------- | ---------------- | ------------------------------------------------------------------------- | ----------------------------- |
| Action flow | `action-flow.md` | In what order do the parts act for one scenario, and which part does each | The inside of a part          |
| Data flow   | `data-flow.md`   | Where is each piece of data created and read, and how does it move        | The entities and their fields |

Four rules:

- A flow says which parts it passes through, and points to the document of each
  part in `05_building-blocks/`. It does not describe a part.
- A document of `05_building-blocks/` does not hold a flow.
- A flow does not contradict the documents of `05_building-blocks/`.
- An action flow says which use case of `01_introduction/use-cases.md` it
  realizes. A flow does not hold a use case: what an actor wants is in the spec.
