# Nucleus — Frontend Design Spec

## Overview

Nucleus is a Google-integrated AI workspace for students. It connects Gmail, Google Calendar, Google Classroom, and Google Drive into one intelligent layer powered by Gemini. The UI follows a static sidebar + dynamic main panel layout. The color scheme draws directly from Google's brand palette to reinforce the deep Google Workspace integration.

---

## Design Principles

- **Google-native feel** — colors, iconography, and components should feel at home alongside Gmail and Google Calendar
- **Chat is primary** — the main interaction model is conversational; forms and buttons are secondary
- **AI is ambient but visible** — the student model updates in the background and is surfaced intentionally so users can see Nucleus learning about them
- **Reduce cognitive load** — students are already overwhelmed; every screen should have one clear thing to do
- **Light/dark mode toggle** — available globally, persists via localStorage

---

## Color Palette

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| `--primary` | #1A73E8 | #8AB4F8 | Primary actions, active nav, links |
| `--primary-surface` | #E8F0FE | #1E3A5F | Active nav background |
| `--google-red` | #EA4335 | #F28B82 | Overdue, urgent |
| `--google-yellow` | #FBBC04 | #FDD663 | Due soon, warnings |
| `--google-green` | #34A853 | #81C995 | Completed, sent, confirmed |
| `--surface` | #FFFFFF | #1E1E1E | Main panel background |
| `--surface-secondary` | #F8F9FA | #2D2D2D | Sidebar, cards, inputs |
| `--border` | #DADCE0 | #3C3C3C | All borders |
| `--text-primary` | #202124 | #E8EAED | Body text |
| `--text-secondary` | #5F6368 | #9AA0A6 | Labels, captions, muted text |

---

## Typography

- **Font**: Google Sans — import from Google Fonts (`https://fonts.google.com/specimen/Google+Sans`)
- **Fallback**: `system-ui, sans-serif`
- **Scale**:
  - Page title: 22px / 500
  - Section heading: 16px / 500
  - Body: 14px / 400
  - Caption / label: 12px / 400
  - Line height: 1.6

---

## Global Layout

```
┌──────────────────────────────────────────────────────┐
│  SIDEBAR (220px, fixed)  │  MAIN PANEL (flex-1)       │
│                          │                            │
│  [Logo]                  │  [Active Tab Content]      │
│                          │                            │
│  ○ Tasks         ←active │                            │
│  ○ Email Triage          │                            │
│  ○ Settings              │                            │
│                          │                            │
│  ──────────────────       │                            │
│  [Context Snapshot]      │                            │
│  [Light / Dark toggle]   │                            │
└──────────────────────────────────────────────────────┘
```

- Sidebar is always visible, never collapses
- Main panel renders the active tab
- No top navbar — all navigation lives in the sidebar

---

## Sidebar

### Logo
- Icon: small nucleus/atom mark in `--primary` blue
- Wordmark: "Nucleus" in Google Sans 500, 16px
- Padding: 20px sides, 28px bottom

### Navigation
Three items with icon + label:

| Tab | Icon | Notes |
|---|---|---|
| Tasks | checklist / task_alt | Primary tab, default on load |
| Email Triage | mark_email_unread | Badge showing pending count |
| Settings | settings | |

**Active state**: `--primary-surface` background, `--primary` text and icon, `3px solid --primary` left border

**Inactive state**: transparent background, `--text-secondary`, hover shows `--surface-secondary`

### Context Snapshot
Pinned to the bottom of the nav area. A small always-visible card showing live student context.

```
┌──────────────────────┐
│ Diego · Stanford      │
│ 3 tasks due soon     │
│ 2 emails to review   │
│ ⚡ You underestimate  │
│   writing tasks      │
│ Synced 2m ago        │
└──────────────────────┘
```

- Background: `--surface-secondary`, border: `0.5px solid --border`
- "Tasks due soon" count in `--google-yellow`
- The ⚡ insight line is pulled from the student profile — one rotating inference Nucleus has made
- Read only, no click action

### Light / Dark Toggle
- Bottom of sidebar, below context snapshot
- Pill toggle: ☀️ Light / 🌙 Dark
- Saves to localStorage

---

## Tab 1 — Tasks

This is the core tab. Chat is the primary interface. The task board is secondary.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Tasks                              [+ Add Task]      │
│                                                      │
│  ┌─────────────────────────┐  ┌──────────────────┐  │
│  │   CHAT PANEL (60%)      │  │  TASK BOARD (40%) │  │
│  │                         │  │                  │  │
│  │  [conversation thread]  │  │  [task cards]    │  │
│  │                         │  │                  │  │
│  │  ┌─────────────────┐    │  │                  │  │
│  │  │ Type a task...  │    │  │                  │  │
│  │  └─────────────────┘    │  │                  │  │
│  │  [📷] [🎤]   [Send →]   │  │                  │  │
│  └─────────────────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Chat Panel

**Message thread**
- User messages: right-aligned, `--primary` background, white text, rounded bubble
- Nucleus messages: left-aligned, `--surface-secondary` background, `--text-primary`, rounded bubble
- Small Nucleus avatar (atom icon) next to each Nucleus message
- Thread scrolls vertically, newest message at bottom

**Follow-up question flow**

When a user inputs a task, Nucleus asks 2–3 targeted follow-up questions inline before acting. This should feel like a conversation, not a form.

Example thread:
```
Diego: "I have a history essay due Friday"

Nucleus: "Got it — a few quick questions. What's the
          topic, and roughly how long does it need to be?
          Do you have a rubric I can look at?"

Diego: [uploads photo of rubric] "Causes of WWI, 8 pages"

Nucleus: "Perfect. You have Tuesday and Thursday evenings
          free this week. Want me to schedule two 2-hour
          writing blocks there?"

Diego: "Thursday is actually busy"

Nucleus: "No problem — scheduling Tuesday 7–9pm and
          Wednesday 6–8pm instead. Creating your doc
          outline now based on the rubric..."

          ✓ Google Doc created → [Open Doc]
          ✓ 2 calendar blocks added → [View Calendar]
```

- Action confirmations appear inline as green pill badges with links
- Maximum 3 follow-up questions before Nucleus acts — never over-ask
- If Nucleus finds a matching Google Classroom assignment it surfaces it: "This looks like it matches your HIST101 assignment — is that right?"

**Input bar**
```
┌──────────────────────────────────────────────────┐
│  📷  🎤  │  Type a task or ask anything...  │  → │
└──────────────────────────────────────────────────┘
```

- 📷 opens file picker / camera for multimodal input (syllabus photo, handwritten notes, whiteboard)
- 🎤 triggers Gemini Live voice input (stretch feature)
- Enter or → sends message
- Input expands to multiline on long input

### Add Task Button
- Top right of the Tasks tab: `+ Add Task` in `--primary` blue
- Opens a modal as an alternative to chat for users who prefer structured input
- Fields: Task name, Course (dropdown populated from Google Classroom), Due date, Estimated hours, Notes
- On submit → feeds into the same Gemini decomposition pipeline as chat

### Task Board (right panel)

Cards organized into four columns or a single scrollable list with color-coded labels:

| Status | Indicator color | Condition |
|---|---|---|
| This week | `--primary` blue | Scheduled, work blocks exist |
| Due soon | `--google-yellow` | Due within 3 days |
| Overdue | `--google-red` | Past due date |
| Done | `--google-green` | Marked complete |

**Task Card:**
```
┌───────────────────────────────────┐
│ ● History Essay          HIST101  │
│ Due Friday May 24                 │
│                                   │
│ Work blocks:                      │
│  Tue 7–9pm   ✓ on calendar       │
│  Wed 6–8pm   ✓ on calendar       │
│                                   │
│ [📄 Open Doc]  [📅 View Blocks]   │
└───────────────────────────────────┘
```

- Color dot maps to status
- Course tag top-right in muted pill badge
- Calendar confirmations shown with green checkmarks
- Two action links: open Google Doc, view calendar blocks
- Clicking the card expands it to show the full Gemini-generated breakdown

---

## Tab 2 — Email Triage

Nucleus reads incoming Gmail, drafts replies with full awareness of the student's academic context, and surfaces them for review. Nothing sends without the student approving it.

### Header
```
Email Triage                         [↻ Sync Gmail]
2 suggested replies ready
```

### Email Card

```
┌──────────────────────────────────────────────────────┐
│ Prof. Martinez <martinez@stanford.edu>               │
│ Re: CS 106A — Office Hours reminder                  │
│ 2 hours ago                                          │
│                                                      │
│ Nucleus suggests:                                    │
│ ┌────────────────────────────────────────────────┐   │
│ │ Hi Professor Martinez,                          │   │
│ │                                                │   │
│ │ Thank you for the reminder. I'll be there at   │   │
│ │ 3pm today. Looking forward to it.             │   │
│ │                                                │   │
│ │ Best,                                          │   │
│ │ Diego                                          │   │
│ └────────────────────────────────────────────────┘   │
│                                                      │
│  [✏️ Edit]      [✗ Dismiss]      [✓ Send Reply]      │
└──────────────────────────────────────────────────────┘
```

- Draft box becomes editable inline when Edit is clicked — full textarea, auto-focus
- Send Reply is `--primary` blue, prominent
- Dismiss fades the card out with a subtle animation
- After sending: card collapses and shows a green "Sent ✓" confirmation pill
- Nucleus drafts with awareness of student context — it knows your course load, your relationship with this professor, your tone from past emails

### Empty State
```
         ✉️

    You're all caught up.
    No pending replies right now.

    Nucleus will surface new suggestions
    as emails come in.
```

---

## Tab 3 — Settings

Two sections: Google connections and student profile.

### Section 1 — Connected Accounts

```
Connected Google Services

  Google Calendar     ✓ Connected    [Disconnect]
  Gmail               ✓ Connected    [Disconnect]
  Google Classroom    ✓ Connected    [Disconnect]
  Google Drive        ✓ Connected    [Disconnect]
  Google Docs         ✓ Connected    [Disconnect]

  [+ Connect another Google account]
```

- Each service shows connection status with a green dot
- Disconnect link in muted text
- Re-auth flow triggered if token expires

### Section 2 — Your Profile

Student context that Nucleus uses to personalize everything. User fills this in manually; Nucleus also updates it automatically over time.

```
About You

  Name            [Diego Raygada          ]
  School          [Stanford University    ]
  Year            [Sophomore      ▾]
  Major           [Data Science / CS      ]
  Age             [19                     ]

My Courses (synced from Google Classroom)

  + CS 106A — Programming Methodology
  + MATH 51 — Linear Algebra
  + HIST 101 — Modern World History
  [+ Add course manually]

My Preferences

  I work best      [Evenings (6–10pm) ▾]
  I prefer         [Longer focused blocks ▾]
  Remind me        [1 day before due dates ▾]
```

### Section 3 — What Nucleus Has Learned

This is the live student model made visible. Updates automatically as Nucleus infers things from behavior.

```
What Nucleus knows about you
Last updated 5 minutes ago

  ⚡ You tend to underestimate writing tasks by ~1 hour
  ⚡ You work most productively on Tuesday evenings
  ⚡ You often leave assignments starting 2 days before the due date
  ⚡ Your most stressful course this semester appears to be HIST101
  ⚡ Your email tone with professors is formal and concise

  [Clear learned data]
```

- Each insight is a single line, plain language
- Shown as a live list — new inferences appear at the top
- Clear button resets the learned profile (with confirmation modal)
- This section is a key demo moment — show judges this updating in real time after a few interactions

---

## Modals

### Add Task Modal
Triggered by `+ Add Task` button.

```
┌─────────────────────────────────────┐
│  Add a task                    [✕]  │
│                                     │
│  Task name                          │
│  [                              ]   │
│                                     │
│  Course                             │
│  [Select from Classroom     ▾]      │
│                                     │
│  Due date                           │
│  [May 24, 2026              📅]     │
│                                     │
│  Estimated hours                    │
│  [3 hours                   ▾]      │
│                                     │
│  Notes (optional)                   │
│  [                              ]   │
│                                     │
│           [Cancel]  [Add Task →]    │
└─────────────────────────────────────┘
```

### Confirmation Modal (for destructive actions)
Used for Disconnect account, Clear learned data, etc.

```
┌──────────────────────────────────┐
│  Are you sure?                   │
│                                  │
│  This will clear all of          │
│  Nucleus's learned insights      │
│  about you. This cannot          │
│  be undone.                      │
│                                  │
│       [Cancel]  [Clear data]     │
└──────────────────────────────────┘
```

---

## Component States

### Buttons
| Variant | Style | Usage |
|---|---|---|
| Primary | `--primary` bg, white text | Send, Add Task, Send Reply |
| Secondary | white bg, `--border` border | Cancel, Edit |
| Danger | `--google-red` bg, white text | Destructive actions only |
| Ghost | transparent, `--text-secondary` | Dismiss, minor actions |

### Loading States
- Chat: animated typing indicator (three dots) while Nucleus is generating
- Task board: skeleton card while decomposition is running
- Email: skeleton card while drafts are generating
- All async actions show a subtle spinner in the relevant button

### Error States
- API failure: inline red banner below the chat input — "Couldn't reach Nucleus. Check your connection."
- Google auth expired: yellow banner at top of main panel — "Your Google Calendar connection expired. Reconnect →"

---

## Responsive Behavior

This is a desktop-first app (targeting students at a laptop). Mobile is not a priority for the hackathon MVP.

Minimum supported width: 1024px

Below 1024px: task board collapses, chat takes full width. Email triage stacks cards vertically. Sidebar collapses to icon-only mode.

---

## Tech Stack Notes for Implementation

- **Framework**: React + Vite
- **Styling**: Plain CSS with CSS variables (no Tailwind) — consistent with Rumbo approach
- **Font**: Google Sans via Google Fonts
- **Icons**: Google Material Icons (`https://fonts.google.com/icons`)
- **State**: useState / useContext for UI state, Supabase for persistence
- **Auth**: Google OAuth 2.0 via Supabase Auth
- **Dark mode**: CSS class toggle on `<body>` (`body.dark`), variables swap via class