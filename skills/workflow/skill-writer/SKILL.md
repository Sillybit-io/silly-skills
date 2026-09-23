---
name: skill-writer
description: Authors and reviews SKILL.md files for the silly-skills repository. Use when you write a new skill, create SKILL.md, add a skill to skills/<category>/, bump a skill version, or review this skill for silly-skills standards. Defines the required frontmatter contract, the mandatory six-section body order, the tone rules, the version-bump rules, and the attribution footer that every skill in this repository must end with.
license: CC-BY-ND-4.0
metadata:
  version: "0.1.0"
  category: workflow
---

# skill-writer

## Purpose

skill-writer defines the house style for every skill in this repository. It gives you the frontmatter contract, the fixed six-section body order, the tone rules, the version-bump rules, and the attribution footer. Use it when you author a new skill and when you review an existing one. Every other skill here conforms to the format described in this file, so a change to this file is a change to the whole catalogue.

## When to use / when NOT to use

Use skill-writer when you:

- Create a new `SKILL.md` under `skills/<category>/`.
- Review a skill before you commit it.
- Rename or move a skill directory.
- Bump a skill version or edit a skill description.
- Need to read a validator error and fix the file it points at.

Do NOT use skill-writer when you:

- Write repository documentation such as `README.md` or `CONTRIBUTING.md`.
- Change the validator, the CI workflows, or the license files.
- Write application code, tests, or scripts.
- Edit any file that is not a `SKILL.md`.

## Workflow

1. Pick the category directory. It must be one of `review`, `ai-health`, `docs`, or `workflow`.
2. Pick the skill name. It must be lowercase-hyphenated, must match `^[a-z0-9]+(-[a-z0-9]+)*$`, and must be 1-64 characters.
3. Create the file at `skills/<category>/<skill-name>/SKILL.md`. The directory name must equal the frontmatter `name` exactly.
4. Write the frontmatter shown in Output format. Set `metadata.category` to the parent category directory. Set `metadata.version` to `"0.1.0"` for a new skill.
5. Write the `description` in third person, from its first word to its last. State what the skill does in the first sentence. Then list the trigger phrases a user would actually type. Keep it between 1 and 1024 characters. The description is injected into the system prompt, so a mixed point of view hurts discovery. Write `Processes Excel files and generates reports`. Never write `I can help you process Excel files`. Never write `You can use this to process Excel files`. Never open on a bare imperative such as `Process Excel files` while the rest of the sentence stays third person, because that mixes two voices inside one description.
6. Write the six body sections in the fixed order. Never add a seventh top-level section, never drop one, never reorder them.
7. Write in simple English. Use short sentences, active voice, and one instruction per sentence.
8. Verify every command, CLI flag, and URL you wrote. Run the command or open the link. Delete anything you could not verify.
9. Add the attribution footer as the last non-empty line, character for character.
10. Write `examples.md` beside the `SKILL.md`. Give it at least one worked scenario built from exactly three H2 sections in this order: `## Prompt`, `## Without skill`, `## With skill`. Feed both branches the identical input. Write the "Without skill" branch as the genuine baseline a competent agent reaches without the skill, and never weaken it to make the skill look better. Produce the "With skill" branch by following the new skill's own Workflow and Output format against that same input, not by paraphrasing the result you hoped for.
11. Run `bun run validate` from the repository root. Fix every `ERROR` line. Warnings do not block a commit.
12. Bump `metadata.version` and add a `CHANGELOG.md` line in the same change whenever you edit a published skill.
13. Walk the QA checklist below. Commit with a Conventional Commits message such as `feat(<category>): add <skill-name> skill`.

## Output format

Every `SKILL.md` in this repository uses this exact skeleton: the frontmatter block, one H1 that repeats the skill name, then exactly six H2 sections in this order, then the attribution footer.

````markdown
---
name: <skill-name>
description: <what the skill does, then the trigger phrases a user would type>
license: CC-BY-ND-4.0
metadata:
  version: "0.1.0"
  category: <review | ai-health | docs | workflow>
---

# <skill-name>

## Purpose

<One paragraph. What the skill does and who it serves.>

## When to use / when NOT to use

<Two short lists. Name concrete situations, not feelings.>

## Workflow

<Numbered, imperative steps. One instruction per step.>

## Output format

<The exact shape the skill must produce. Show a skeleton, not prose.>

## Guardrails

<Hard MUST and NEVER rules. No soft advice.>

## QA checklist

<Checkboxes an agent can self-verify before it commits.>

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
````

The footer contains a bare URL, so `markdownlint` rule MD034 fires on it. The footer string is fixed and cannot be rewritten as a markdown link. Keep the `markdownlint-disable-next-line MD034` comment directly above it. The comment is a comment, not content, so the footer stays the last non-empty line.

Frontmatter field rules:

- `name` — required. Lowercase-hyphenated, matches `^[a-z0-9]+(-[a-z0-9]+)*$`, 1-64 characters, and exactly equal to the skill directory name.
- `description` — required. 1-1024 characters. Must explain what the skill does and must include the trigger phrases that should load it.
- `license` — required. Exactly `CC-BY-ND-4.0`. No other value is accepted.
- `metadata.version` — required. A valid SemVer string. Quote it so it stays a string.
- `metadata.category` — required. Exactly the parent category directory name.

Section rules:

- The six H2 headings are fixed in wording and in order: `Purpose`, `When to use / when NOT to use`, `Workflow`, `Output format`, `Guardrails`, `QA checklist`.
- Use H3 headings inside a section when you need more structure. Never promote them to H2.
- The footer is the last non-empty line of the file. Nothing may follow it.

### examples.md

Every skill directory ships an `examples.md` beside its `SKILL.md`. The file holds at least one worked scenario in exactly this shape:

````markdown
## Prompt

<The request a user typed, or the input the skill was handed, quoted as given.>

## Without skill

<What a competent agent produces from that input with no skill loaded.>

## With skill

<What the same agent produces from the same input after following this skill.>
````

`examples.md` rules:

- The three H2 headings are fixed in wording and in order: `Prompt`, `Without skill`, `With skill`. The file opens on `## Prompt`; it needs no H1 and no preamble.
- Both branches take the identical input. Change the input between branches and the comparison proves nothing.
- Show the artefact each branch produced, not a description of it. Put it in a fenced block so the reader sees its real shape.
- A second scenario repeats the same three headings in the same order.

## Guardrails

MUST:

- MUST use the five frontmatter keys above and no other required key.
- MUST set `license` to `CC-BY-ND-4.0` and nothing else.
- MUST keep the frontmatter `name` identical to the skill directory name.
- MUST write the `description` in third person throughout, opening on a third-person present-tense verb such as "Reviews" or "Generates" so the first verb agrees with the rest of the sentence.
- MUST place the file at `skills/<category>/<skill-name>/SKILL.md`, exactly three levels under `skills/`.
- MUST include the six sections in the exact order given in Output format.
- MUST end the file with the attribution footer as the last non-empty line, matched character for character.
- MUST ship a non-empty `examples.md` in every skill directory, beside the `SKILL.md`.
- MUST build each `examples.md` scenario from the three H2 sections `Prompt`, `Without skill`, and `With skill`, in that order.
- MUST give both branches of a scenario the identical input: the same prompt, the same diff, the same ticket text.
- MUST stay tool-agnostic. The skill has to work in Claude Code, Cursor, and OpenCode.
- MUST verify every executable claim before you write it. A command, a CLI flag, or a URL goes in the file only after you ran it or opened it.
- MUST bump `metadata.version` and add a `CHANGELOG.md` line in the same change. Patch means a wording-only fix. Minor means a new capability was added. Major means the workflow or the output contract changed.
- MUST keep the tone direct. Write short sentences, active voice, one instruction per sentence.

NEVER:

- NEVER commit a secret. No API keys, no access tokens, no private key blocks, no passwords.
- NEVER include personal data. No personal email addresses, no names of private individuals, no account identifiers.
- NEVER include an internal URL, an internal hostname, or a local development address.
- NEVER include an absolute path from your own machine. Use repository-relative paths.
- NEVER invent a command, a flag, a file path, or a URL. Delete what you cannot verify.
- NEVER use tool-exclusive syntax or assume one agent's file layout, slash commands, or settings format.
- NEVER add filler praise, marketing language, or emphasis words such as "powerful" or "seamless".
- NEVER add, remove, or reorder the six top-level sections.
- NEVER commit a skill without its `examples.md`. A missing or blank file fails `bun run validate` with `MISSING_EXAMPLES`.
- NEVER weaken the "Without skill" branch to flatter the skill. Write the baseline a competent agent actually reaches, however good that baseline is.
- NEVER let the "With skill" branch drift from what the skill's own Output format specifies. Follow the skill, then record what came out.
- NEVER bump a version without a matching `CHANGELOG.md` line.
- NEVER republish a modified copy of a skill from this catalogue. The content is source-available and free to use with attribution, and modified redistribution needs written approval.

## QA checklist

Run this list before you commit a skill.

- [ ] The file is at `skills/<category>/<skill-name>/SKILL.md` and the category is `review`, `ai-health`, `docs`, or `workflow`.
- [ ] Line 1 is `---` and the frontmatter has a closing `---`.
- [ ] `name` is lowercase-hyphenated, is 1-64 characters, and equals the directory name.
- [ ] `description` is 1-1024 characters, says what the skill does, and lists trigger phrases.
- [ ] `description` is written in third person throughout, including its opening verb, with no first-person or second-person wording.
- [ ] `license` is exactly `CC-BY-ND-4.0`.
- [ ] `metadata.version` is a quoted, valid SemVer string.
- [ ] `metadata.category` equals the parent category directory.
- [ ] No frontmatter key is declared twice.
- [ ] The body has exactly six H2 sections, correctly worded and in the required order.
- [ ] Every command, flag, and URL in the file was verified by running or opening it.
- [ ] The file contains no secret, no personal data, no internal URL, and no absolute local path.
- [ ] The tone is direct, with short sentences and no marketing language.
- [ ] The skill makes no assumption that is specific to one agent tool.
- [ ] `metadata.version` was bumped and `CHANGELOG.md` gained a line in this same change, if the skill already existed.
- [ ] The last non-empty line is the attribution footer, matched character for character.
- [ ] `examples.md` sits beside the `SKILL.md`, is not blank, carries the sections `Prompt`, `Without skill`, and `With skill` in that order, and feeds both branches the identical input.
- [ ] `bun run validate` reports 0 errors.
- [ ] The `markdownlint-disable-next-line MD034` comment sits directly above the footer.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
