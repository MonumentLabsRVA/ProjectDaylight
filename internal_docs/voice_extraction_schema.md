# Voice Note Extraction Schema for Project Daylight MVP

*Last Updated: November 2024*

---

## Overview

This document defines what information should be extracted from voice notes in Project Daylight's MVP. The extraction process should balance comprehensiveness with practicality, focusing on legally relevant information while avoiding over-processing or making subjective interpretations.

## Core Philosophy

1. **Extract Facts, Not Feelings** - Focus on observable events, not emotional interpretations
2. **Preserve Original Context** - Keep the user's actual words accessible
3. **Legal Relevance First** - Prioritize information that matters in family court
4. **Structured Yet Flexible** - Allow for varied input styles while producing consistent output

---

## Primary Extraction Fields

### 1. Event Identification

#### Basic Event Information
- **Event Type** (required)
  - `incident` - Concerning behaviors, violations, safety issues
  - `positive` - Positive parenting moments, achievements
  - `medical` - Health-related events, medication, doctor visits
  - `school` - School events, meetings, communications
  - `communication` - Interactions with co-parent or third parties
  - `legal` - Court-related, attorney meetings, documentation
  
- **Primary Timestamp** (required)
  - Best estimate of when the event occurred
  - Can be relative ("yesterday afternoon") or specific
  - Should handle phrases like "last Tuesday" or "this morning"
  
- **Duration** (optional)
  - For events that span time (visits, calls, incidents)
  - Format: minutes, hours, or date range

#### Event Details
- **Title** (required)
  - Brief, factual summary (5-10 words)
  - No emotional language
  - Example: "Late pickup from school" not "Another irresponsible pickup"

- **Description** (required)
  - Factual narrative of what happened
  - Include relevant details mentioned
  - Preserve important quotes if mentioned
  - 2-5 sentences typically

- **Location** (optional)
  - Physical location or context
  - Can be specific address or general ("at school", "my house")

### 2. Participant Identification

#### People Involved
- **Primary Participants** (required)
  - Who was directly involved
  - Standardize references (co-parent, child, self)
  - Include professional roles when mentioned (teacher, doctor)

- **Witnesses** (optional)
  - Third parties who observed
  - Important for credibility

- **Child Involvement** (flag)
  - Boolean: Was child present/affected?
  - Critical for custody relevance

### 3. Evidence & Documentation

#### Mentioned Evidence
- **Evidence Type**
  - Text messages mentioned
  - Photos taken
  - Emails referenced
  - Documents discussed
  - Audio/video recordings mentioned

- **Evidence Status**
  - Already captured/saved
  - Need to obtain
  - Need to document

#### Documentation Gaps
- **Missing Information**
  - What details weren't captured
  - What follow-up is needed
  - What evidence should be gathered

### 4. Legal Relevance Markers

#### Pattern Indicators
- **Recurring Issues** (extracted keywords)
  - Late pickups
  - Missed medications
  - Communication problems
  - Schedule violations
  - Safety concerns

- **Custody Agreement References**
  - Violations mentioned
  - Compliance noted
  - Schedule adherence

#### Impact Assessment
- **Child Welfare Indicators**
  - Safety concerns
  - Emotional impact mentioned
  - Routine disruption
  - Medical needs

- **Documentation Quality**
  - Specificity level (high/medium/low)
  - Corroboration available (yes/no/partial)

### 5. Action Items & Follow-ups

#### Immediate Actions
- **Urgent Flags**
  - Safety concerns requiring immediate action
  - Time-sensitive documentation needs
  - Court deadline mentions

- **Required Follow-ups**
  - Need to contact someone
  - Need to obtain documentation
  - Need to file something

---

## Metadata & Context

### Recording Context
- **Recording Timestamp** - When the voice note was created
- **Recording Duration** - Length of audio
- **Transcription Confidence** - How clear/complete the transcription was

### Processing Metadata
- **Extraction Confidence** - How confident the AI is in the extraction
- **Ambiguities Noted** - Unclear references or dates
- **Processing Flags** - Special conditions noted

---

## Special Extraction Rules

### Temporal Processing
1. **Relative Date Resolution**
   - "Yesterday" → Actual date based on recording time
   - "Last week" → Date range
   - "This morning" → Timestamp estimate
   - Preserve original phrasing for context

2. **Recurring Events**
   - Note patterns: "every Tuesday", "always late"
   - Extract both specific instance and pattern

### Identity Standardization
1. **Person References**
   - "Ex", "my ex", "their father/mother" → "co-parent"
   - "My daughter/son", "the kids" → "child/children" (with names if provided)
   - "Her teacher", "his doctor" → Role + name if provided

2. **Relationship Context**
   - Maintain professional relationships clearly
   - Note authority figures (teachers, doctors, therapists)

### Emotional Content Handling
1. **Preserve But Don't Emphasize**
   - Keep factual core
   - Note if extreme emotional state affects clarity
   - Don't interpret or judge emotions

2. **Convert to Observations**
   - "I'm so angry about..." → Focus on the triggering event
   - "I'm worried that..." → Extract the concern as potential issue

---

## Output Schema Structure

```json
{
  "extraction": {
    "events": [
      {
        "type": "incident|positive|medical|school|communication|legal",
        "title": "Brief factual summary",
        "description": "Detailed factual narrative",
        "primary_timestamp": "2024-11-20T15:30:00Z",
        "timestamp_precision": "exact|day|approximate",
        "duration_minutes": null,
        "location": "School name or address",
        "participants": {
          "primary": ["co-parent", "child", "self"],
          "witnesses": ["teacher", "school staff"],
          "professionals": ["Dr. Smith", "Ms. Johnson (teacher)"]
        },
        "child_involved": true,
        "evidence_mentioned": [
          {
            "type": "text|email|photo|document|recording",
            "description": "What was mentioned",
            "status": "have|need_to_get|need_to_create"
          }
        ],
        "patterns_noted": ["late_pickup", "medication_missed"],
        "custody_relevance": {
          "agreement_violation": false,
          "safety_concern": false,
          "welfare_impact": "none|minor|moderate|significant"
        }
      }
    ],
    "action_items": [
      {
        "priority": "urgent|high|normal|low",
        "type": "document|contact|file|obtain",
        "description": "What needs to be done",
        "deadline": null
      }
    ],
    "metadata": {
      "recording_timestamp": "2024-11-20T14:00:00Z",
      "recording_duration_seconds": 180,
      "transcription_confidence": 0.95,
      "extraction_confidence": 0.88,
      "ambiguities": [
        "Unclear which Tuesday was referenced",
        "Name of teacher not captured clearly"
      ]
    },
    "original_transcript": "Full transcribed text..."
  }
}
```

---

## Examples of Extraction

### Example 1: Simple Incident Report

**Voice Note:**
> "Just picked up Emma from school, it's 4:15 PM and her dad was supposed to get her at 3:30. The school called me because they couldn't reach him. This is the third time this month. The office staff saw the whole thing and Emma was really upset, crying in the office. I took a photo of the sign-in sheet showing the time."

**Extracted:**
```json
{
  "events": [{
    "type": "incident",
    "title": "Late pickup from school",
    "description": "Co-parent failed to pick up child at 3:30 PM as scheduled. School contacted me at 4:15 PM after being unable to reach co-parent. This is the third occurrence this month.",
    "primary_timestamp": "2024-11-20T16:15:00",
    "timestamp_precision": "exact",
    "duration_minutes": 45,
    "location": "School",
    "participants": {
      "primary": ["co-parent", "child", "self"],
      "witnesses": ["school office staff"]
    },
    "child_involved": true,
    "evidence_mentioned": [{
      "type": "photo",
      "description": "Photo of sign-in sheet with timestamp",
      "status": "have"
    }],
    "patterns_noted": ["late_pickup", "repeated_incident"],
    "custody_relevance": {
      "agreement_violation": true,
      "safety_concern": false,
      "welfare_impact": "moderate"
    }
  }]
}
```

### Example 2: Positive Parenting Moment

**Voice Note:**
> "Want to document that we had a really good evening tonight. Did homework together from 5 to 6, then made dinner together - Emma helped make the salad. Read two chapters of Harry Potter before bed and she was asleep by 8:30 which is right on schedule. She said she had a good day at school too."

**Extracted:**
```json
{
  "events": [{
    "type": "positive",
    "title": "Completed homework and bedtime routine",
    "description": "Supervised homework from 5-6 PM, prepared dinner together with child helping, read two chapters before bed. Child asleep by 8:30 PM on schedule.",
    "primary_timestamp": "2024-11-20T20:30:00",
    "timestamp_precision": "day",
    "location": "My home",
    "participants": {
      "primary": ["self", "child"]
    },
    "child_involved": true,
    "patterns_noted": ["consistent_routine", "on_time_bedtime"],
    "custody_relevance": {
      "agreement_violation": false,
      "safety_concern": false,
      "welfare_impact": "positive"
    }
  }]
}
```

### Example 3: Complex Multi-Event Note

**Voice Note:**
> "Okay, I need to get this all down. Yesterday Emma's teacher called me about her being tired in class again. She said it's been happening on Mondays and Tuesdays, which are right after her dad's weekends. I asked Emma about it last night and she said daddy lets her stay up watching movies. Also, I still haven't gotten the medical insurance card from him that I've been asking for since last month - we have a doctor's appointment next week and I need it. Oh, and I should mention that he did drop her off on time on Sunday, so that was good."

**Extracted:**
```json
{
  "events": [
    {
      "type": "school",
      "title": "Teacher reported child tired in class",
      "description": "Teacher called reporting child showing fatigue on Mondays and Tuesdays following co-parent's weekend custody. Pattern observed over multiple weeks.",
      "primary_timestamp": "2024-11-19T14:00:00",
      "timestamp_precision": "day",
      "participants": {
        "primary": ["self"],
        "professionals": ["teacher"]
      },
      "child_involved": true,
      "patterns_noted": ["fatigue_pattern", "post_weekend_issue"],
      "custody_relevance": {
        "welfare_impact": "moderate"
      }
    },
    {
      "type": "communication",
      "title": "Child reported late bedtimes at co-parent's",
      "description": "Child disclosed being allowed to stay up late watching movies during co-parent's custody time.",
      "primary_timestamp": "2024-11-19T19:00:00",
      "timestamp_precision": "approximate",
      "participants": {
        "primary": ["self", "child"]
      },
      "child_involved": true,
      "patterns_noted": ["bedtime_violation"],
      "custody_relevance": {
        "agreement_violation": true,
        "welfare_impact": "moderate"
      }
    },
    {
      "type": "incident",
      "title": "Medical insurance card not provided",
      "description": "Co-parent has not provided medical insurance card despite repeated requests over past month. Card needed for upcoming doctor appointment.",
      "primary_timestamp": "2024-11-20T14:00:00",
      "timestamp_precision": "day",
      "participants": {
        "primary": ["self", "co-parent"]
      },
      "patterns_noted": ["documentation_withholding"],
      "custody_relevance": {
        "agreement_violation": true,
        "welfare_impact": "minor"
      }
    },
    {
      "type": "positive",
      "title": "On-time custody exchange",
      "description": "Co-parent completed Sunday custody exchange on time.",
      "primary_timestamp": "2024-11-17T18:00:00",
      "timestamp_precision": "day",
      "participants": {
        "primary": ["self", "co-parent", "child"]
      },
      "child_involved": true,
      "custody_relevance": {
        "welfare_impact": "positive"
      }
    }
  ],
  "action_items": [
    {
      "priority": "high",
      "type": "obtain",
      "description": "Get medical insurance card from co-parent before doctor appointment",
      "deadline": "next week"
    },
    {
      "priority": "normal",
      "type": "document",
      "description": "Follow up with teacher for written documentation of fatigue pattern"
    }
  ]
}
```

---

## Implementation Considerations

### For LLM Prompt Engineering
1. **Instruct the model to:**
   - Be conservative with interpretations
   - Prefer "unknown" over guessing
   - Extract multiple events from single recording
   - Flag when information is ambiguous
   - Maintain factual, neutral tone

2. **Avoid having the model:**
   - Make legal judgments
   - Interpret emotions as facts  
   - Fill in missing information
   - Make medical or psychological assessments
   - Provide advice or recommendations

### For Database Schema
1. **Core Tables Needed:**
   - `voice_recordings` - Original audio and transcripts
   - `events` - Extracted events with all fields
   - `participants` - People involved in events
   - `evidence_mentions` - References to evidence in recordings
   - `action_items` - Follow-ups needed
   - `patterns` - Recurring issues identified

2. **Key Relationships:**
   - Recordings → Events (one-to-many)
   - Events → Participants (many-to-many)
   - Events → Evidence (many-to-many)
   - Events → Patterns (many-to-many)

### For UI/UX Presentation
1. **Show extracted events in timeline view**
2. **Allow editing/correction of extractions**
3. **Link events to evidence as it's uploaded**
4. **Surface patterns and action items prominently**
5. **Maintain access to original transcript**

---

## Success Metrics

- **Extraction Accuracy**: 90%+ of events correctly identified
- **Timestamp Resolution**: 80%+ of relative dates correctly resolved
- **Participant Identification**: 95%+ accuracy on primary participants
- **False Positive Rate**: <5% non-events extracted
- **Processing Time**: <10 seconds per minute of audio

---

## Future Enhancements (Post-MVP)

1. **Sentiment Analysis** - Track emotional patterns over time
2. **Contradiction Detection** - Flag inconsistencies across events
3. **Auto-linking** - Connect related events automatically
4. **Predictive Insights** - Suggest what documentation might be needed
5. **Multi-language Support** - Handle code-switching or non-English content
6. **Voice Recognition** - Identify different speakers in recordings

---

*This schema prioritizes extracting legally relevant, factual information while maintaining flexibility for the varied and often emotional nature of family court documentation needs.*
