## Evidence Communications Schema (Text, Email, Screenshots)

*Last Updated: November 2025*

---

### Overview

This document defines the **initial MVP schema** for communication evidence (primarily **text messages** and **emails**) and how it maps onto the existing database tables:

- `evidence` (per file / artifact)
- `events` (legal/timeline events)
- `event_evidence` (links between them)
- `evidence_mentions` (references from voice notes etc.)

The goal is to:

- Keep the **database schema unchanged** for now (reuse `evidence_source_type` and `event_type` enums).
- Have AI produce a **simple, structured JSON** from an **image (screenshot/photo)** that:
  - Classifies the **communication medium**.
  - Extracts a **clean text version** of the communication.
  - Suggests **event metadata** that fits the `events` table.
  - Suggests **evidence metadata** that fits the `evidence` table.

This JSON can then be used to:

- Power the **UI review experience**.
- Drive **insertion into Supabase** (via a separate step) using the existing tables.

---

### Existing Database Anchors

**Key enums and tables (from `database.types.ts`):**

- `public.Enums.evidence_source_type`:
  - `"text" | "email" | "photo" | "document" | "recording" | "other"`
- `public.Enums.event_type`:
  - `"incident" | "positive" | "medical" | "school" | "communication" | "legal"`

- `public.Tables.evidence`:
  - `source_type` (`evidence_source_type`)
  - `storage_path`, `original_filename`, `mime_type`
  - `summary` (text)
  - `tags` (string[])

- `public.Tables.events`:
  - `type` (`event_type`)
  - `title`, `description`
  - `primary_timestamp`, `timestamp_precision`
  - `duration_minutes`, `location`
  - `child_involved`, `agreement_violation`, `safety_concern`
  - `welfare_impact`

- Linking tables:
  - `event_evidence` (event ↔ evidence)
  - `evidence_mentions` (evidence referenced in voice notes)

---

### MVP Scope for Communications Evidence

For the first version, we support **images/screenshots** of:

- **Text messages / chat apps**
- **Emails** (full message or snippet)

We will:

- Treat everything as **one or more communication “items”** extracted from a single image.
- For each item, produce:
  - A **communication-level object** (what the user sees/edits).
  - A **suggested `event` payload** (for `events` table).
  - A **suggested `evidence` payload fragment** (for `evidence` table).

We deliberately **do not** change the DB schema yet; we just:

- Use `event.type = "communication"`.
- Use `evidence.source_type` as either `"text"` or `"email"` (AI-predicted).

---

### Target JSON Output Shape (from AI)

The image-to-JSON AI route should return a **single JSON object** of this shape:

```json
{
  "extraction": {
    "communications": [
      {
        "medium": "text|email|unknown",
        "direction": "incoming|outgoing|mixed|unknown",
        "subject": "Email subject or null",
        "summary": "1–2 sentence neutral summary of what this communication shows",
        "body_text": "Cleaned, concatenated text content of the message or thread",
        "participants": {
          "from": "Sender label or identifier if known",
          "to": ["Primary recipient labels or identifiers"],
          "others": ["CC/BCC/other participants if visible"]
        },
        "sent_at": "ISO-8601 string or null if unknown",
        "timestamp_precision": "exact|approximate|unknown",
        "child_involved": true,
        "agreement_violation": null,
        "safety_concern": null,
        "welfare_impact": "none|minor|moderate|significant|positive|unknown"
      }
    ],
    "db_suggestions": {
      "events": [
        {
          "type": "communication",
          "title": "Short neutral title",
          "description": "Factual description suitable for the timeline",
          "primary_timestamp": "ISO-8601 string or null",
          "timestamp_precision": "exact|day|approximate|unknown",
          "duration_minutes": null,
          "location": null,
          "child_involved": true,
          "agreement_violation": null,
          "safety_concern": null,
          "welfare_impact": "none|minor|moderate|significant|positive|unknown"
        }
      ],
      "evidence": [
        {
          "source_type": "text|email|photo|document|recording|other",
          "summary": "Suggested summary for evidence.summary",
          "tags": ["communication", "co-parent", "school"]
        }
      ]
    },
    "metadata": {
      "image_analysis_confidence": 0.0,
      "raw_ocr_text": "Best-effort raw text OCR of the whole image",
      "ambiguities": [
        "List of short notes about uncertain senders, dates, or content"
      ]
    }
  }
}
```

**Notes:**

- `communications[]` is **UI-friendly**, focused on how the user understands the message/thread.
- `db_suggestions.events[]` and `db_suggestions.evidence[]` are **payload templates**:
  - They **do not** contain `user_id`, `id`, or `storage_path`.
  - They are **meant to be merged** with runtime context (user id, evidence row, etc.) by a later step.
- The `welfare_impact` and related flags align directly with the existing `events` schema and enums.

---

### Mapping to Database Tables

**1. Evidence row (`evidence` table)**

- `source_type`:
  - `"text"` → screenshots of SMS/iMessage/WhatsApp/other chat threads.
  - `"email"` → screenshots of email UIs or `.eml` uploads.
  - `"photo"`/`"document"` → left as-is if the AI cannot confidently classify.
- `summary`:
  - Use `db_suggestions.evidence[0].summary`.
  - Example: `"Screenshot of text thread where co-parent confirms late pickup."`
- `tags`:
  - Start with AI-suggested tags like `["communication", "co-parent", "school"]`.

**2. Event row (`events` table)**

- `type`:
  - Always `"communication"` for this flow.
- `title`, `description`:
  - From `db_suggestions.events[0].title` / `.description`.
  - Keep tone neutral and factual (same philosophy as voice extraction).
- `primary_timestamp`, `timestamp_precision`:
  - From `db_suggestions.events[0]`.
  - If screenshot has an explicit timestamp → `precision = "exact"`.
  - If only a day is inferable → `precision = "day"`.
  - Else → `precision = "unknown"` and `primary_timestamp = null`.
- `child_involved`, `agreement_violation`, `safety_concern`, `welfare_impact`:
  - Copied directly from suggestions when present.
  - If AI is unsure, it should prefer `null` or `"unknown"`.

**3. Linking (`event_evidence`)**

- After the evidence file is uploaded and the event is created:
  - Create an `event_evidence` row linking them.
  - The new AI route **does not** perform this write; it only provides suggestions.

---

### MVP AI Behavior Guidelines (for Prompting)

When we prompt the image-to-JSON model, we should instruct it to:

- **Identify the medium**:
  - Use `"text"` when the screenshot looks like a conversation/chat app.
  - Use `"email"` when headers like “From”, “To”, “Subject” or email client UI are visible.
  - Fall back to `"unknown"` and `"photo"`/`"document"` when unsure.
- **Extract clean text**:
  - Normalize emoji and formatting.
  - Concatenate multi-bubble threads into coherent `body_text`.
- **Be conservative**:
  - Prefer `"unknown"` for medium, direction, timestamps, or welfare impact when not clear.
  - Avoid legal conclusions or advice.
- **Align with existing enums**:
  - Only emit values allowed by:
    - `evidence_source_type`
    - `event_type` (always `"communication"` here)
    - `timestamp_precision`
    - `welfare_impact`

---

### Future Extensions (Post-MVP)

Later, we may:

- Add dedicated **communication tables** (e.g. `communications`, `communication_messages`) for richer structure.
- Store per-message **sender/receiver** and threading.
- Support **non-image** inputs (raw `.eml`, exported SMS JSON, etc.).
- Auto-link communications back to **voice-extracted events** (`evidence_mentions`).

For now, this MVP keeps things **simple and aligned** with the current schema while giving AI enough structure to be immediately useful for:

- Timeline creation (`events`)
- Evidence repository (`evidence`)
- Export and interpreter use cases.


