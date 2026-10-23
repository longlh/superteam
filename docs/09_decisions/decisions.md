# Decisions

The decisions of the architecture, one document for each, in the form of an
architecture decision record (ADR): the context, the decision, and its
consequences. A decision that is replaced is not deleted: its status changes.

| ADR                                             | Decision                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| [1](0001-approval-is-the-merge.md)              | The approval is the merge of the pull request                                         |
| [2](0002-final-work.md)                         | A failed or rejected work is final                                                    |
| [3](0003-one-event-at-a-time.md)                | The engine loop processes one event at a time                                         |
| [4](0004-roles-are-agent-files.md)              | A role is an agent file of Claude                                                     |
| [5](0005-job-runner-interface.md)               | The engine defines the job runner as an interface                                     |
| [6](0006-merger-is-an-engine-role.md)           | The merger is a role of the engine                                                    |
| [7](0007-subscription-names-the-notifier.md)    | A subscription names the Notifier                                                     |
| [8](0008-pid-file-holds-the-job.md)             | The pid file holds the pid and its job                                                |
| [9](0009-arc42-and-c4.md)                       | The documents follow arc42, and the structure follows C4                              |
| [10](0010-diagrams-are-plantuml.md)             | Diagrams are text, in PlantUML                                                        |
| [11](0011-work-lives-on-its-branch.md)          | A work lives on its branch, not in the runtime storage                                |
| [12](0012-orchestrator-is-the-only-consumer.md) | The containers do not call each other, and the orchestrator is the only consumer      |
| [13](0013-arc42-views-and-beyond-c4-and-uml.md) | The documents follow arc42, Views and Beyond, the C4 model and UML                    |
| [14](0014-two-mergers.md)                       | The merger is split into the task merger and the work merger                          |
| [15](0015-root-branch-from-its-upstream.md)     | The engine reads the root branch from its upstream, and never writes to the local one |
| [16](0016-engine-errors-are-retried.md)         | An error of the engine is retried, an error of an agent is final                      |
| [17](0017-decision-on-github.md)                | A decision can be made on GitHub                                                      |
| [18](0018-branch-prefix.md)                     | The branches of superteam have a prefix that the project sets                         |
