---
name: decide
description:
  Use when the user wants to approve or reject a work of superteam that is
  proposed, by its id.
argument-hint: <id>
---

# Decide a work

The id of the work is: $ARGUMENTS. If it is empty, ask for it, or offer to list
the works with `/superteam:works`.

1. Call the MCP tool `get_work` of superteam with the id.
2. If its `approvalStatus` is not `PROPOSED`, say so with its state, and stop:
   only a proposed work can be decided.
3. Show its title, the URL of its pull request, and its `limitations` when it
   has some. Ask the user to review the pull request there, then to answer:
   approve or reject, with a reason if they want one. Say that the reason is
   written as a comment on the pull request, and that a merge or a close of the
   pull request on GitHub is the same decision, without a reason.
4. Wait for the answer. Call the MCP tool `decide_work` only with the answer of
   the user, `approve` or `reject`, and with the `reason` when the user gave
   one. Never decide by yourself, and never write a reason by yourself.
5. Report the answer of the tool: the decision is accepted, and the engine
   processes it. An approve merges the pull request, and a reject closes it.
   Offer to check the work again with `/superteam:work <id>`.

If a tool answers an error, report it as it is.
