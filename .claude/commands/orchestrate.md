---
description: Work all unblocked ready-for-agent issues in parallel worktrees, then integrate the PRs one at a time
argument-hint: "[ask|auto]  (default: ask — wait for approval before each merge)"
---

MERGE_MODE: `$ARGUMENTS` (if empty or anything other than `auto`, treat it as `ask`). `ask` = stop and get my approval before each merge; `auto` = merge green PRs yourself.

You are the orchestrator for working this repo's `ready-for-agent` issues in parallel. You dispatch and integrate; subagents write the code. Read `CLAUDE.md` and `docs/agents/issue-tracker.md` first.

## 1. Find the issues that can start
- List open issues labelled `ready-for-agent` with `gh issue list --label ready-for-agent --state open --json number,title,body,assignees`.
- Skip the spec issue: its title starts with "Spec:".
- Skip any issue with an assignee.
- Skip any issue whose `## Blocked by` section lists an issue that is still open. Check each one with `gh issue view <n> --json state`.
- Show me the issues that can start and the ones that are blocked (with what blocks them), then proceed without waiting.

## 2. Dispatch
- For each issue that can start, run `gh issue edit <n> --add-assignee @me`.
- Then start one subagent per issue with the Agent tool, using `isolation: "worktree"` and `subagent_type: "general-purpose"`. Start them all in a single message so they run concurrently. Run at most 5 at once.
- Give each subagent the brief below, with N filled in:

> You are implementing GitHub issue #N in this repo, in your own git worktree. Other agents are working other issues in parallel in other worktrees.
> 1. Run `git switch -c issue-N`, then `npm ci`.
> 2. Read the issue with `gh issue view N --json number,title,body,labels,comments`. Read `CLAUDE.md` and `CONTEXT.md`, and the parts of `SPEC.md` and `docs/adr/` the issue relies on. Use CONTEXT.md terms exactly.
> 3. Implement with test-driven development (the `mattpocock-skills:tdd` skill), working at the seams the issue or existing code already define. Run `npm run typecheck` and the single test files you touch often. Run the full `npm test` once at the end.
> 4. **Do not run `npm run e2e`.** Its ports are shared across worktrees, and CI runs it. Do write or update the Playwright specs the issue needs.
> 5. Review your diff against `origin/main` with the `mattpocock-skills:code-review` skill. Fix what it finds that is in scope.
> 6. Commit in this repo's style: gitmoji conventional commits, as in `git log`. End the message with the attribution lines from your system reminder. Never add Claude as an author.
> 7. Run `git push -u origin issue-N`, then `gh pr create --base main --head issue-N` with a title in the same commit style. The body should summarise the change, list what you tested, and contain `Closes #N`.
> 8. Never push to `main`, merge, or touch other branches. If you are blocked on a decision only a human can make, stop and report it rather than guessing.
> 9. Return: the PR URL, your worktree path, a 3–5 line summary, any open questions, and any files you changed that other issues are likely to touch too.

## 3. Watch CI
- As each PR comes back, run `gh pr checks <pr> --watch --fail-fast` in the background, using Bash with `run_in_background`. Don't poll it.
- If CI fails:
  - Download the failure with `gh run view <run-id> --log-failed`. The `playwright-report` artifact is there if e2e failed.
  - Send the failure to the PR's subagent with SendMessage. If that agent has ended, start a new subagent in its worktree.
  - Have it fix the failure and push again.
  - Allow at most 2 fix attempts per PR. After that, mark the PR as needing me and move on.

## 4. Integrate, one PR at a time
- Merge green PRs in order of risk, smallest and most self-contained first. For each one:
  1. Rebase it onto current `origin/main` in its worktree. Resolve conflicts with the `mattpocock-skills:resolving-merge-conflicts` skill, keeping both features' intent.
  2. Run `npm run typecheck && npm test`.
  3. Run `git push --force-with-lease`.
  4. Wait for CI to pass again.
- If MERGE_MODE is `ask`: show me the PR, the CI status and the conflict notes. Merge only after I say yes.
- If MERGE_MODE is `auto`: merge it yourself.
- To merge, run `gh pr merge <pr> --squash --delete-branch`.
- Only one merge at a time. Rebase the next PR only after the previous merge has landed.

## 5. Unblock the next issues
After each merge, re-run step 1. If an issue has become unblocked, dispatch it as in step 2. Keep going until no `ready-for-agent` issue can start and no PR is open.

## Rules
- You never write feature code in the main checkout. Your own edits there are limited to resolving coordination problems I approve.
- Don't use the Workflow tool.
- Keep my terminal updates short: one line per change of state (dispatched, PR opened, CI red or green, merged).
- If tooling costs you time (worktrees, ports, `gh` quirks), append it to `~/Repos/papercuts.md` in its format.

## Final report
End with:
- A table with one row per issue: issue, PR, CI result, merged or awaiting approval or needs-human, and notes.
- Anything left blocked, and why.
- Worktrees that are still on disk, and the command to remove them.
