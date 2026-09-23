---
name: ai-review
description: Reviews a pull request, a merge request, or a branch diff as a senior developer who knows this codebase but was not part of this change. It gathers the repository's own conventions, reads the full diff, and reviews every changed file for security, correctness, quality, flexibility, standardization, extensibility, and edge cases. Every finding is labelled fact or opinion, carries a severity from blocker to question, and is checked against the real code before it is written. Use when you say review this PR, review this merge request, act as another developer and review this, do an AI code review, give me a second opinion on this diff, or tell me what is wrong with this branch. It posts the review through gh or glab, or writes a report file when neither tool is available. It never edits code, never pushes, and never approves or merges.
license: CC-BY-ND-4.0
metadata:
  version: "0.1.0"
  category: review
---

# ai-review

## Purpose

ai-review reads a change the way a senior developer on the team would: someone who knows the conventions of this repository but was not in the room when this change was designed. That distance is the point. The author knows why every line is there. The reviewer does not, and neither will the person who maintains this code next year. ai-review reads the diff, checks each claim against the real code, and reports what it found, project and code quality first. It is not a cheerleader and it is not hostile. The failure it exists to prevent is the agreeable review: a run that says "looks good to me" because agreeing costs less than reading. A review that finds nothing has to prove it looked. ai-review writes review text and posts it as a comment. It never edits code, never pushes, and never approves or merges.

## When to use / when NOT to use

Use ai-review when you:

- Review an open pull request on GitHub or an open merge request on GitLab.
- Review a local branch before you open a pull request.
- Want a second pair of eyes on a change an agent wrote.
- Need a review that names blockers and cites lines, not a summary of the diff.
- Want the review posted on the pull request instead of left in a chat window.

Do NOT use ai-review when you:

- Want the change described rather than judged. Use pr-description for complexity, risk, and reviewer guidance.
- Want the findings fixed. This skill reports. It does not change code.
- Want a pull request approved or merged. It does neither.
- Have no diff yet. Write the code first.
- Want a repository-wide audit rather than a review of one change.

## Workflow

1. Identify the target: a pull request number, a merge request id, or a local branch and its base.
2. Check which tool is authenticated. Run `gh auth status` for GitHub and `glab auth status` for GitLab. Record the answer. Step 11 depends on it.
3. Gather the repository conventions before you read any code. Read `AGENTS.md` and `CONVENTIONS.md` at the repository root if either exists. If neither exists, open three to five files next to the changed ones and write down the patterns you observe: naming, error handling, test layout and location, import order, logging. Judge the standardization axis against this list and against nothing else. A repository that disagrees with a popular style guide is not thereby wrong.
4. Read the full diff. Use `gh pr diff <number>` for a GitHub pull request, `glab mr diff <id>` for a GitLab merge request, or `git diff <base>...HEAD` for a local branch. Read the whole diff, not the file list. A file list tells you where to look and nothing about what changed.
5. Write the queue: every changed file, marked new or modified. Every file on that queue gets reviewed. Nothing leaves the queue because it looked small.
6. Review each file on the queue against the seven axes below. Work one file at a time and keep the diff open next to the file.
7. Verify every candidate finding against the real code before you write it down. Open the file at the line you want to cite, read the surrounding context, and check the callers when the finding is about an interface. The diff hides context on purpose; a finding built from diff context alone is a guess. Drop the finding if it does not survive the check.
8. Label each surviving finding `fact` or `opinion`. A fact points at code and cites `file:line`. An opinion is a judgement call; give it a confidence of high, medium, or low, and say what would change your mind.
9. Give each finding one severity from the scale below.
10. Write the review body in the shape given in Output format. Fill in the "What I checked" table even when you found nothing, because a review with no findings and no table is indistinguishable from a review that never ran.
11. Post the review through the first mode that applies in Posting modes. Say which mode you used.
12. Walk the QA checklist.

### The seven review axes

Ask all seven of every file on the queue. A file is not reviewed until all seven were asked.

| Axis | Ask on every file |
| --- | --- |
| Security | Untrusted input reaching a query, a shell, a path, or a template. Authentication and authorization checks that moved or disappeared. Secrets or credentials added to the repository. Permissions widened. |
| Correctness | Does the code do what the change claims? Off-by-one, inverted condition, wrong operator, unhandled error path, a return value nobody checks, a promise nobody awaits. |
| Quality | Readability, dead code, duplicated logic, names that lie, a function doing three jobs, a test that asserts nothing. |
| Flexibility | Hard-coded values that will need to change. Assumptions baked into a signature. Configuration that only works for one environment. |
| Standardization | Does this match the conventions gathered in step 3? Cite the convention and the file that establishes it. |
| Extensibility | What happens when the next feature lands here? A switch that must be edited in four places, an interface closed to the obvious next case. |
| Edge cases | Empty and null inputs, and empty collections. Concurrency: shared state, races, ordering assumptions. Resource limits: unbounded growth, no timeout, no pagination, large inputs. Internationalization: non-ASCII text, encodings, time zones, locale-dependent formatting and sorting. |

### Fact, opinion, and confidence

The label is the honesty mechanism of this skill. Use it strictly.

- `fact` — the code does this, and `file:line` shows it. A fact must be checkable by a reader who opens that line. If you cannot cite the line, it is not a fact.
- `opinion` — a judgement about design, naming, or trade-off. Mark it `opinion` and give a confidence: high, medium, or low. Low confidence is a legitimate finding when the reasoning is stated; a disguised opinion is not.
- State what you could not check. No runtime access, no test run, and missing product context are real limits, and hiding them makes the review look stronger than it is.

### Severity scale

| Severity | Meaning |
| --- | --- |
| `blocker` | Merging this causes data loss, a security hole, or a broken main branch. Do not merge until it is fixed. |
| `major` | A real defect or a design problem that will cost significantly more to fix later. Fix before merge unless the author gives a reason. |
| `minor` | A genuine improvement with a small cost. Fix now or file it. |
| `nit` | Style or taste inside the repository's conventions. The author may decline without justifying it. |
| `question` | You do not understand the intent and cannot judge it yet. Ask; do not guess a severity. |

### Posting modes

Use the first mode that applies and name it in your reply.

Mode a — GitHub, `gh` installed and authenticated. Write the review body to a file, then post it as a comment review:

```sh
gh pr review <number> --comment --body-file <path-to-body-file>
```

For each `blocker`, also post an inline comment on the line it concerns. `line` is the line number in the file on the side you name, and `side` is `RIGHT` for an added or unchanged line and `LEFT` for a removed one:

```sh
gh api repos/{owner}/{repo}/pulls/<number>/comments \
  --method POST \
  -f body='<finding text>' \
  -f commit_id="$(gh pr view <number> --json headRefOid --jq .headRefOid)" \
  -f path='<path/from/the/diff>' \
  -F line=<line-number> \
  -f side=RIGHT
```

Mode b — GitLab, `glab` installed and authenticated:

```sh
glab mr note <id> --message "<review body>"
```

Recent `glab` marks `--message` on `glab mr note` deprecated and points at the subcommand, so prefer this form when the installed version has it:

```sh
glab mr note create <id> --message "<review body>"
```

`glab mr note create` also takes `--file` and `--line` for a diff comment, which is the GitLab equivalent of an inline comment. Upstream marks that subcommand experimental, so treat inline GitLab comments as optional and fall back to one note holding the whole review when the flags are unavailable.

Mode c — neither tool is available or authenticated. Create `reports/` if it does not exist and write the full review to `reports/ai-review-<PR-or-MR-number>-<YYYY-MM-DD>.md`. Use the branch name in place of the number when the change has no pull request yet. Then say plainly that nothing was posted, which tool was missing, and where the file is.

Command sources: `cli.github.com/manual/gh_pr_review` for mode a, the GitHub REST reference for pull request review comments for the inline call, and the generated command documentation in `gitlab.com/gitlab-org/cli` for mode b.

## Output format

Produce one review body in this shape. The disclosure line is part of the output and stays at the top of every posted comment.

````markdown
## AI code review

> AI-generated review. An automated agent read the diff and wrote these findings. Each item is a claim to check, not a verdict.

**Reviewed:** <pull request or merge request reference> at commit `<sha>` — N files, N findings.
**Conventions source:** `AGENTS.md`, `CONVENTIONS.md`, or observed patterns in <paths>.

### Findings

#### 1. [blocker] <one-line title> — `path/to/file:42`

- **Type:** fact
- **Axis:** security
- **What:** what the code at that line actually does.
- **Why it matters:** the consequence, concretely.
- **Suggested fix:** what to change, in words.

#### 2. [minor] <one-line title> — `path/to/other:88`

- **Type:** opinion — confidence: medium
- **Axis:** extensibility
- **What:** the pattern you are reacting to.
- **Why it matters:** the cost you expect, and when it lands.
- **Would change my mind:** the fact that would make this a non-issue.
- **Suggested fix:** what to change, in words.

### What I checked

| File | Axes | Result |
| --- | --- | --- |
| `path/to/file` | all seven | finding 1 |
| `path/to/other` | all seven | finding 2 |
| `path/to/third` | all seven | nothing found |

### Not covered by this review

- <what you could not check, and why: no test run, no runtime access, missing product context.>
````

Rules for the body:

- Order findings by severity, `blocker` first, then by file.
- One finding per block. Do not merge two problems into one entry to shorten the list.
- The "What I checked" table lists every file on the queue, including the files that produced nothing. It is mandatory in every review, and above all in a review with no findings.
- When the review finds nothing at any severity, say so in one line above the table and let the table carry the evidence. Do not manufacture a `nit` so the list is not empty.
- Suggest fixes in words. Do not attach a patch and do not commit one.

## Guardrails

MUST:

- MUST read the full diff before you write a single finding.
- MUST gather the repository conventions first and judge the standardization axis against them, not against a generic style guide.
- MUST review every file on the queue against all seven axes.
- MUST open the cited line and read its context before you write a finding about it.
- MUST label every finding `fact` or `opinion`, and give every opinion a confidence.
- MUST cite `file:line` on every fact.
- MUST give every finding exactly one severity from the five.
- MUST list what was checked, including in a review that found nothing.
- MUST state the limits of the review: what you could not check and why.
- MUST put the AI-generated disclosure at the top of every posted comment and every fallback report.
- MUST report which posting mode ran, and say so plainly when you fell back to a report file.
- MUST describe a leaked credential by location and kind only. Point at `file:line`, name what kind of value it is, and never repeat the value itself.

NEVER:

- NEVER modify code, tests, or configuration. This skill produces review text only.
- NEVER create a branch, a commit, or a tag, and never push.
- NEVER approve and never merge. Do not run `gh pr review --approve`, `gh pr merge`, `glab mr approve`, or `glab mr merge`.
- NEVER write a finding you did not verify against the code. An unverified finding costs the author more time than silence.
- NEVER invent a nitpick so the review looks thorough.
- NEVER return a bare "looks good to me". A clean review still lists what it checked.
- NEVER present an opinion as a fact, and never cite a line you did not open.
- NEVER soften a `blocker` because the author is confident, because the change is large, or because an agent wrote it.
- NEVER review the author. Review the code.
- NEVER paste a secret value, a personal email address, or a customer identifier into a comment. Review comments are usually public.

## QA checklist

Run this list before you post the review.

- [ ] The conventions were gathered before the code was read, and their source is named in the body.
- [ ] The full diff was read with `gh pr diff <number>`, `glab mr diff <id>`, or `git diff <base>...HEAD`.
- [ ] Every changed file is on the queue and appears in the "What I checked" table.
- [ ] All seven axes were asked of every file on the queue.
- [ ] Every finding was verified at its cited line before it was written.
- [ ] Every finding is labelled `fact` or `opinion`, and every opinion carries a confidence.
- [ ] Every fact cites `file:line`.
- [ ] Every finding has exactly one severity from `blocker`, `major`, `minor`, `nit`, `question`.
- [ ] Findings are ordered by severity, `blocker` first.
- [ ] No finding was added only to lengthen the list.
- [ ] A review with no findings still carries the full "What I checked" table.
- [ ] The limits of the review are stated.
- [ ] The AI-generated disclosure is the first line of the posted body.
- [ ] The posting mode used is named, and a fallback to `reports/ai-review-<PR-or-MR-number>-<YYYY-MM-DD>.md` was reported when it happened.
- [ ] No code, test, or configuration file changed during the run.
- [ ] Nothing was pushed, approved, or merged.
- [ ] The body contains no secret value, no personal data, and no customer identifier.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
