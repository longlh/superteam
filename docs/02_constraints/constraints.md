# Constraints

The constraints that the design and the documents follow.

## Conventions

### The method of the documents

The documents use four methods. Each one answers its own question.

| Method           | Its role       | The question that it answers                                          |
| ---------------- | -------------- | --------------------------------------------------------------------- |
| arc42            | The skeleton   | In which chapter does a piece of information go?                      |
| Views and Beyond | The mindset    | From which views must the system be seen, so that nothing is missing? |
| C4 model         | The microscope | How is the system drawn, from the whole down to the details?          |
| UML              | The complement | How are the views drawn that the C4 model does not draw?              |

- **arc42** gives the skeleton: the 12 chapters, one folder for each (see
  `docs/README.md`).
- **Views and Beyond** gives the mindset: the system is described by several
  views, and by what applies beyond the views, such as the decisions and the
  glossary.
- **The C4 model** gives the microscope: the levels of context, container,
  component and code, each one zooming into a part of the level above it (see
  "Levels of the structure" in `docs/README.md`).
- **UML completes the C4 model.** The C4 model draws only the structure, so it
  has too few kinds of diagram for the views that Views and Beyond asks for,
  such as the behavior over time, the states, the data or the deployment. The
  structure is drawn with the diagrams of the C4 model, and the other views with
  UML, which is convenient and has many kinds of diagram, such as the sequence,
  the activity, the state, the class and the deployment diagram.
