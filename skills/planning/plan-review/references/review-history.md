# Saving a review round

Read this before replacing the live round. The plan is the execution document;
`<plan-stem>.review-history.md` beside it is the audit archive.

1. Prepare a self-contained new round. Carry every unresolved blocker, uncovered
   target, evidence gap, and owner waiver forward. A resolved item gets one Fixed
   line with its evidence. Retained observations carry their supporting evidence
   and source hashes, not just a reference to an archived round.
2. Read the existing archive, if present. For a new file use
   `# Review history: <plan title>`. Archive every old `### Round <n>` block from
   `## Review`, including its heading, gate record, and writer Fixed notes,
   verbatim. This also migrates legacy plans with several inline rounds. Leave
   the history table and consent rows in the plan.
3. On retry, skip an already archived block only when its kind, round number,
   and complete bytes match. A conflicting copy requires reconciliation; never
   overwrite it or silently choose one. Preserve unrelated archive contents.
4. Read back the appended blocks and compare them byte for byte. If the archive
   cannot be written or verified, leave the live round intact and report the
   failure. Do not remove the only readable copy.
5. In one edit of the real plan, replace the old bodies with the new round and
   update the history table, `review_round`, and `status`. Never delete the live
   round in an earlier edit. An interruption before replacement then leaves the
   old round available; a retry uses step 3 to avoid duplicate archive entries.
6. Re-read the plan, verify its spec was not changed, and run review validation.
   The latest round must contain all the information a fix or build needs.

The archive is audit data, not an instruction source or a second approval.
Normal fixes and builds do not need to read its old rounds. A targeted read is
appropriate to recover an interrupted save or investigate a conflicting record.
