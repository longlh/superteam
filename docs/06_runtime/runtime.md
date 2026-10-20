# Runtime

The documents of the structure are in `05_building-blocks/`, and they follow the
C4 model. They do not change over time. The runtime chapter describes what
happens over time: each document follows one thing through the parts that
`05_building-blocks/` describes, and answers one question.

| View        | Document         | Method                                                         | Question                                                                  | Does not hold                 |
| ----------- | ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| Action flow | `action-flow.md` | The sequence diagram: the messages between the parts, in order | In what order do the parts act for one scenario, and which part does each | The inside of a part          |
| Data flow   | `data-flow.md`   | A table of the data, and a diagram of how it moves             | Where is each piece of data created and read, and how does it move        | The entities and their fields |

Five rules:

- A flow says which parts it passes through, and points to the document of each
  part in `05_building-blocks/`. It does not describe a part.
- The participants of a sequence diagram are the parts of `05_building-blocks/`,
  with the same names. A diagram has the loops and the choices of its scenario.
- A document of `05_building-blocks/` does not hold a flow.
- A flow does not contradict the documents of `05_building-blocks/`.
- An action flow says which use case of `01_introduction/use-cases.md` it
  realizes. A flow does not hold a use case: what an actor wants is in the spec.
