# Resume prompt — smarter_chat_retrieval

Pick up the smarter_chat_retrieval push. Plan + reference doc are in this folder. All 6 sprints are code-complete; only DB-side steps remain.

**Confirm Supabase MCP is live** (it was just wired in `.mcp.json` at the project root). If `mcp__supabase__*` tools aren't registered, ask Kyle to approve via `/mcp` and restart.

**Then run, in order:**

1. Apply `db_migrations/0053_message_threads.sql` via the Supabase MCP `apply_migration` tool.
2. Apply `db_migrations/0054_job_status_pending_confirmation.sql`. (Separate migration because Postgres won't let a freshly-added enum value be used in the same transaction it's added.)
3. Regen types: `npx supabase gen types typescript --project-id soebpfvyoorstmbimrmj > src/types/database.types.ts` (run from repo root).
4. Strip the three `as any` casts I left as bridges — search for the comment `migration 0054` in `useJobs.ts`, `confirm-ofw-import.post.ts`, `ofw-ingest.ts`. Confirm `npx nuxi typecheck` from `src/` is clean for those files.
5. Smoke test the ingest path: re-upload the OFW fixture in dev. Verify `message_threads` rows populate within ~60s of the job finalizing, with prose `summary`, populated `flags`, and proper-noun `search_anchors`. (See plan Sprint 2 verification.)
6. Hit `POST /api/internal/backfill-thread-summaries` (employee-gated) with body `{}` to backfill the calling user's existing imports, OR `{ "allCases": true }` for everyone.
7. Re-run the chat eval set in `/chat`. Confirm `search_threads` is the agent's first move on "what happened with X" questions and that decomposed keyword queries (e.g. `"Katy"`) hit real threads.

**Drift gate** (Sprint 6) test optional but worth doing: upload an OFW PDF for a case that already has threads but is a substantively different file. The `/evidence` card should show the warning alert with Continue / Cancel buttons.

Plan doc: `internal_docs/20260428_smarter_chat_retrieval/implementation_plan.md`
Retrieval philosophy: `internal_docs/20260428_smarter_chat_retrieval/chat_retrieval.md`
