# ProcureFlow — Hackathon Submission

## Problem Statement

Enterprise procurement is fragmented, manual, slow, and inconsistently governed. An ordinary purchase request routinely passes through 4 to 6 people across 3 to 4 disconnected tools—static policy PDFs, departmental budget spreadsheets, vendor catalog portals, email approval chains, and ERP forms. As a result, even routine orders suffer days of delay, procurement policies and approval floors are applied unevenly, department budgets risk uncoordinated over-commitment, and stock-outs force manual back-and-forth re-quoting. Worse, when auditors review past spend, the decision trail is scattered across inboxes with no tamper-evident record of why a vendor was chosen or who approved an exception.

## Solution Description

**ProcureFlow** is an autonomous multi-agent procurement platform that turns plain-language purchase requests into policy-verified, budget-backed Purchase Orders in about a minute or two. Employees describe what they need in natural language, and a coordinated pipeline of seven specialized AI agents (`Orchestrator`, `Policy`, `Budget`, `Vendor`, `Approval`, `Execution`, and `Auditor`) plans the workflow, checks enterprise policy rules, verifies and reserves departmental budgets in INR (`₹`), evaluates suppliers, autonomously recovers from vendor stock-outs, routes exceptions to human approvers, generates Purchase Orders, and seals every step into a tamper-evident SHA-256 audit log.

### How AI Is Integrated

ProcureFlow uses the official Google Gemini SDK (`@google/genai`) with structured function calling, per-agent tool allow-lists, token-bucket rate limiting, and Zod-validated JSON schemas:

- **Gemini Function Calling with Per-Agent Tool Allow-Lists:** Each of the 7 agents (`Orchestrator`, `Policy`, `Budget`, `Vendor`, `Approval`, `Execution`, `Auditor`) can only invoke the tools explicitly registered in its server-side allow-list. Contextual identity (`userId`, `role`, `department`, `requestId`, `runId`) is bound server-side and never trusted from model arguments.
- **JSON-Validated Outputs & Self-Repair:** Every agent concludes its turn with a structured JSON output validated against a strict Zod schema; if validation fails, the runtime executes an automatic repair turn before falling back to deterministic logic if needed.
- **Planning & Autonomous Re-Planning:** The `Orchestrator` parses free-text requests into structured procurement parameters, emits a 6-step execution plan, and inspects downstream outcomes—automatically triggering up to 2 re-plans when `check_stock` reveals an out-of-stock primary supplier.
- **End-to-End Reflection by the Auditor:** On every terminal run (`completed` or `rejected`), the `Auditor` agent inspects the full trace via `get_run_summary` to verify policy adherence, budget integrity, and approval compliance.
- **"LLM Proposes, Code Disposes":** While Gemini agents interpret unstructured intent, gather evidence via tools, and write human-readable rationales, deterministic TypeScript and PostgreSQL guardrails make the binding decisions—computing weighted vendor scores, enforcing upward-only approval routing and category floors, and executing atomic budget reservations.

### Key Features

- **Live Agent Trace over SSE:** Real-time timeline streaming each agent's thoughts, tool calls, tool results, decisions, confidence scores, and vendor comparison tables over Server-Sent Events with automatic polling fallback.
- **Autonomous Re-Planning:** Automatic detection and recovery when a top-ranked supplier fails live stock verification (`check_stock`), banning the out-of-stock vendor and selecting the next best approved supplier with an amber **"Recovered automatically"** badge.
- **Human-in-the-Loop Only for Exceptions with Approver Brief:** Compliant purchases within category policy limits execute autonomously with zero clicks. Escalated orders present managers with an executive brief (headline, total, vendor, savings, risk flags, confidence) and quick-comment chips.
- **Manual vs ProcureFlow Impact Panel:** Side-by-side comparison on the run trace and dashboard contrasting typical manual process assumptions (handoffs, tools, wait days) against actual agent execution active time, steps, tool calls, and automated checks.
- **Pre-Flight Preview Card & Voice Input:** Real-time debounced preview on the request form computing category, estimated cost range, expected approval route, and policy/budget warnings deterministically without LLM calls. Built-in voice input via Web Speech API (`en-IN`).
- **Smart Alternatives on Rejection:** On budget rejection, deterministically calculates the maximum affordable quantity at the cheapest approved supplier with a one-click resubmission button. On policy blocks, displays all permitted procurement categories.
- **Quote Savings Calculation & PO PDF Export:** Deterministic savings calculation vs highest approved quote and next-best vendor, displayed across the PO card, approver brief, and dashboard KPI. One-click PO print / PDF export via print stylesheets.
- **Replay at 4x:** Interactive client-side playback simulating agent execution steps sequentially at 4x speed for demonstrations.
- **Explainable Decisions with Confidence Scores:** Every agent step records a structured rationale, tool inputs/outputs, and calibrated confidence percentage with low-confidence badges (`< 0.5`).
- **Immutable Hash-Chained Audit Log:** Every state change is appended via PostgreSQL's `append_audit_log` RPC under `pg_advisory_xact_lock`, linking `prev_hash` to `entry_hash` (`SHA-256`) with database triggers blocking `UPDATE`, `DELETE`, and `TRUNCATE`.
- **Analytics with Time Saved & Savings KPIs:** Executive dashboard tracking departmental budget utilization (`spent`, `reserved`, `available`), run resolution breakdowns (including Failed and Awaiting Approval), spend by category, estimated savings, and hours saved.

## Business Impact

ProcureFlow quantifies operational efficiency and governance compliance directly from live run telemetry:

- **Time-Saved Calculation:** Each completed or resolved run compares active agent processing time (`active_ms`, excluding human wait time while paused in `awaiting_approval`) against enterprise manual baselines:
  - **Auto-approved run baseline:** `90 minutes`
  - **Human-escalated run baseline:** `60 minutes`
  - **Formula:**
    $$\text{time\_saved\_minutes} = \max\left(0,\ \text{baseline} - \lceil \text{active\_ms} / 60000 \rceil\right)$$
- **Compliance & Risk Metrics:** 100% of requests pass through deterministic policy rule checks, unapproved vendor exclusion (`QuickDeals Traders` blocked despite lower price), atomic PostgreSQL budget locking (preventing race conditions or overdrafts), and cryptographic audit verification (`GET /api/audit/verify`).

## Tech Stack and Architecture

- **Frontend (`client/`):** React 18, TypeScript, Vite, Tailwind CSS v3, React Router v6, Axios, Recharts, Lucide React, `@microsoft/fetch-event-source` (deployed on Vercel).
- **Backend (`server/`):** Node.js 20+, Express.js, TypeScript, `@google/genai`, `@supabase/supabase-js`, `pg`, `jsonwebtoken`, `bcryptjs`, `zod`, `helmet`, `cors`, `express-rate-limit` (deployed on Render).
- **Database (`supabase/`):** Supabase Cloud PostgreSQL with Row Level Security (RLS) deny-all public access, atomic stored procedures (`reserve_budget`, `commit_budget`, `release_budget`, `append_audit_log`), and cryptographic hash-chain triggers.
- **Architecture Flow:** The React SPA authenticates via JWT and communicates exclusively with the Express API over REST and SSE. The Express orchestrator drives the 7-agent loop against Google Gemini, enforces TypeScript guardrails, and persists all state transitions and audit hashes in Supabase PostgreSQL using the server-only `service_role` key.

## Links

- **GitHub Repository:** https://github.com/muddamkavyasreetpt-gif/ProCure-Flow
- **Deployed Application:** 
- **Demo Video:** 
