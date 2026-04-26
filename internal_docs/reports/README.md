# Reports

One-off analytical writeups. The genre: "what happened?", "is X working?", "should we do Y?"

These are not strategy docs and not roadmaps. A report exists to take a specific question, look hard at the data + code + behavior + conversations, and write down what was found in a form Kyle (or a future agent) can act on without re-doing the work.

## When to write one

When a question deserves more than a Slack message but less than a planning push:

- A surprising data signal — a spike, a drop, a cluster, a quiet metric that suddenly matters
- A retrospective on a launch, experiment, or campaign
- A read of user behavior to inform a decision
- A "before we ship X, let's understand Y" pre-mortem
- A periodic check-in (monthly funnel, quarterly cohort review) — these can be templated from prior reports

If the answer changes how Daylight gets built, sold, or priced, write it down. If it's a one-shot curiosity that won't outlive the conversation, don't.

## File naming

Each report is a single file: `YYYYMMDD_short_slug.md`. Lowercase, underscores. Date-prefix is the date the question was asked (or the analysis was run), not when it's revised.

Examples:
- `20260425_signup_cohort_review.md`
- `20260512_export_pdf_drop_off.md`
- `20260601_q2_funnel_retrospective.md`

Don't make a directory per report unless you're producing multiple artifacts (charts, exported CSVs, screenshots) — in that case, follow the planning-push pattern: `internal_docs/reports/YYYYMMDD_topic/` with `report.md` inside.

## Structure

Every report follows this shape, in order. Skip a section only if you genuinely have nothing to say in it — and explain why in one line.

### 1. Header

```
**Date:** YYYY-MM-DD
**Question:** <one-sentence prompt, the way it was asked out loud>
**Author:** <who wrote it>
```

The Question field is load-bearing. Future readers need to know what triggered this look — the answer often makes sense only in the light of the question.

### 2. TL;DR

2–4 bullets. The version Kyle would quote in Slack. If a reader stops after the TL;DR, what should they walk away knowing? Lead with the most surprising or load-bearing finding, not a recap.

### 3. What we looked at

Bulleted list of sources: tables queried, code paths read, third-party tools consulted, conversations referenced. Makes the report auditable — anyone (including a future agent) can re-run it from these pointers.

When listing tables, name the schema and the relevant columns. When listing code, give file paths. When listing conversations, give a date and counterparty.

### 4. What we found

Numbered findings. Each lands with a one-sentence claim, then supporting specifics — numbers, dates, user IDs, file paths, quotes. Be concrete enough that someone reading this in three months can verify a claim by going back to the data.

If you can include a small table or histogram inline (markdown table, ASCII chart), do — visual shape often communicates more than prose. Don't gold-plate the chart.

### 5. What it means

Interpretation. The story underneath the numbers. Why does the data look this way? What does it tell us about the product, users, or market that wasn't obvious from the findings alone?

This section is where you earn your keep. Findings without interpretation are a SQL dump. Interpretation without findings is a vibe. Together they're a report.

### 6. Recommendations

Tiered, ordered by what to do first. Each rec gets:

- **What:** the action, in imperative form
- **Why:** the finding it ties to
- **Effort:** rough size (minutes / hours / days)

Distinguish "do this now" from "consider eventually." If a recommendation is contingent on another being done first, say so.

### 7. Open questions

What we couldn't answer with the data we had. What we'd need to look at next, and what new instrumentation would make it answerable. Be honest about gaps — a report that names what it doesn't know is more useful than one that pretends to have all the answers.

## Tone

Match Kyle's: direct, specific, warm-not-effusive. Numbers > adjectives. Name people and files where relevant. Don't bury the lede.

## What not to put here

- **Strategy docs / roadmaps** — those go in their own planning push (e.g., `internal_docs/YYYYMMDD_topic/`)
- **Live metrics / dashboards** — wire into the app, not a markdown file
- **Code or migration plans** — also belong in a planning push
- **Speculation untethered from data** — if there's nothing in the data, say so in Open questions and stop

## PII

Reports often touch real user data. The repo is private, but write defensively:

- Use first name + last initial for users (not full names)
- Redact children's names and replace with role + age ("her 10-year-old daughter")
- Don't reproduce unproven third-party allegations verbatim — the analytical fact is "user reported X about co-parent Y," not the allegation itself
- State / stage / age-of-child are fair game; specific addresses, court case numbers, or full names of opposing parties aren't useful and shouldn't appear

If a future report needs to be shared outside the repo, do a redaction pass first.
