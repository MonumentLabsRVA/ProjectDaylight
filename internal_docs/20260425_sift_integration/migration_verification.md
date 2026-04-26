# Sift integration — migration verification log

## 0047_case_scoping (applied 2026-04-26)

### Pre-flight dry-run
- Users needing a `My case` insert: **1**
- Rows that would be left with NULL case_id after backfill: **0** (across events / evidence / journal_entries / action_items / evidence_mentions)

### Post-migration verification
| Check | Result |
|---|---|
| events with NULL case_id | 0 |
| evidence with NULL case_id | 0 |
| journal_entries with NULL case_id | 0 |
| action_items with NULL case_id | 0 |
| evidence_mentions with NULL case_id | 0 |
| events: case.user_id ≠ row.user_id | 0 |
| evidence: case.user_id ≠ row.user_id | 0 |
| journal_entries: case.user_id ≠ row.user_id | 0 |
| action_items: case.user_id ≠ row.user_id | 0 |
| evidence_mentions: case.user_id ≠ row.user_id | 0 |
| total cases | 14 (was 13; 1 auto-inserted) |

### Notes
- Audit log churn: each backfill UPDATE fired the existing `audit_<table>` trigger, so `audit_logs` got ~600 + ~60 + ~100 + ~240 + ~280 = ~1,280 new rows. Acceptable.
- `action_items.case_id` and `evidence_mentions.case_id` left nullable per plan; backfilled rows all populated, but future inserts may omit.
- `voice_recordings` deliberately untouched (table is deprecated, 0 rows).
