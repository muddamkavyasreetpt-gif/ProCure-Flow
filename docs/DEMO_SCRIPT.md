# ProcureFlow — Demo Script (3 to 5 Minutes)

## Before You Record

- [ ] Run `npm --prefix server run seed:reset-demo` so all department budgets, vendor stock counts, and demo requests start from a clean state.
- [ ] Wake the Render backend service by opening `/api/health` in a browser tab (Render free tier can take about a minute or two to wake after inactivity).
- [ ] Ensure `LLM_MODE=live` with a valid `GEMINI_API_KEY` (and `LLM_FALLBACK=true` enabled as safety net).
- [ ] Open one browser profile/window per role (`employee@procureflow.demo` and `finance@procureflow.demo`), set browser zoom to **110%–125%**, and close unrelated tabs.

---

## Beat-by-Beat Timeline & Narration

| Time | Beat |
|---|---|
| **0:00–0:25** | **The problem in one breath, then the idea: a team of agents that plans, reasons and acts** |
| **0:25–0:55** | **Log in with a demo button, dashboard tour, Demo Scenario Guide & Before vs After Impact** |
| **0:55–1:50** | **Scenario 3: five licenses, watch Plan, Policy, Budget, Vendor, Approval, Execution, Audit; auto-approved, PO and emails, time saved, pre-flight preview & voice input** |
| **1:50–3:20** | **Scenario 2: ten laptops; point at QuickDeals excluded, TechNova failing stock, the amber re-plan "Recovered automatically", Prime Infotech chosen; switch to the finance account, read approver brief with quick-comment chips, approve; run resumes live; download PO PDF & inspect Outbox** |
| **3:20–3:50** | **Scenario 4 & 5: gift cards blocked by Policy Agent, marketing 10 laptops rejected by Budget Agent showing smart alternative (resubmit with max affordable quantity)** |
| **3:50–4:30** | **Audit log with the valid hash-chain badge, analytics numbers & estimated savings KPI** |
| **4:30–5:00** | **Architecture in one sentence, guardrails ("LLM proposes, code disposes"), 4x Replay demonstration, close** |

---

## Detailed Spoken Script & Screen Actions

### [0:00–0:25] The Problem & The Idea
- **Screen:** Start on the `/login` page of ProcureFlow.
- **Narration:**
  > *"In most companies, a simple purchase request passes through four to six people and three or four disconnected tools—policy PDFs, budget spreadsheets, vendor portals, and email threads—taking days and leaving no unified audit trail. ProcureFlow replaces that manual chain with a coordinated team of seven AI agents—Orchestrator, Policy, Budget, Vendor, Approval, Execution, and Auditor—that plans, reasons, calls tools, and acts in about a minute or two."*

### [0:25–0:55] Demo Login, Dashboard Tour & Demo Scenario Guide
- **Screen:** Click the **`employee@procureflow.demo` (Design)** quick-fill button and sign in. Scroll slowly across the KPI cards, Department Budgets in INR (`₹`), and expand the **Demo Scenario Guide**.
- **Narration:**
  > *"We sign in with one click as a Design employee. On the Dashboard, we see real-time KPIs, department budget bars showing spent, reserved, and available funds in Indian Rupees, and the built-in Demo Scenario Guide where any of our six verification scenarios can be launched or inspected."*

### [0:55–1:50] Scenario 3 — Five Software Licenses (Autonomous End-to-End Approval)
- **Screen:** Switch to `eng.employee@procureflow.demo` and click **New Request** (or click **Use this prompt** on Scenario 3 in the guide: *"Buy 5 annual project-management software licenses for Engineering."*). Watch the **Live Agent Trace** stream each step over SSE.
- **Narration:**
  > *"Let's run Scenario 3: buying 5 annual project-management seats for Engineering at ₹4,800 each. The Orchestrator parses the request and builds a 6-step plan. Watch the timeline stream live: the Policy Agent verifies Software Licenses rules; the Budget Agent checks Engineering's ₹40,00,000 budget; the Vendor Agent selects SoftSuite Reseller at ₹24,000; deterministic code atomically reserves ₹24,000. Because ₹24,000 is under the ₹25,000 Software Licenses auto-approve limit with low vendor risk and no policy floor, the Approval Agent auto-approves it, the Execution Agent issues Purchase Order PO-2026-XXXXXX and sends notifications, and the Auditor Agent seals the run—saving manual work with zero human clicks."*

### [1:50–3:20] Scenario 2 — Ten Developer Laptops (Vendor Exclusion, Stock-Out Re-plan & Finance Approval)
- **Screen:** Switch to `employee@procureflow.demo` (or click **Use this prompt** on Scenario 2: *"10 laptops for the new design team, around ₹12 lakh, needed in 3 weeks."*). Point to the **Vendor Comparison Table**, the amber **"Recovered automatically"** re-plan card, and the **Awaiting Finance Approval** banner. Then switch to the `finance@procureflow.demo` window, open `/approvals`, inspect the rationale, and click **Approve**. Watch the trace resume live to completion.
- **Narration:**
  > *"Now let's run Scenario 2 as a Design employee requesting 10 laptops. First, notice the Vendor Comparison table: QuickDeals Traders offered ₹85,000 per unit, but deterministic guardrails excluded it with 'Vendor not approved'. Next, TechNova Systems ranked first at ₹98,000, but when the Vendor Agent called `check_stock`, TechNova had only 4 units in stock for our order of 10. Instead of failing, the Orchestrator triggers an autonomous re-plan—marked with this amber 'Recovered automatically' badge—excludes TechNova Systems, and re-evaluates the remaining suppliers. Prime Infotech at ₹10,40,000 with 7-day delivery beats Globex Distribution's slow 21-day medium-risk quote. Because ₹10,40,000 exceeds the IT Hardware manager limit of ₹5,00,000, the run pauses for Finance approval. Switching to our Finance Controller account, we review the full agent rationale, click Approve, and watch the run resume live—issuing the PO and committing ₹10,40,000."*

### [3:20–3:50] Scenario 4 — Prohibited Gift Cards Blocked by Policy Agent
- **Screen:** Launch Scenario 4 (*"Purchase 200 gift cards worth ₹500 each as employee rewards."*). Show the Policy Agent `blocked` decision and the Auditor Agent's final explanation.
- **Narration:**
  > *"What if someone requests prohibited items? In Scenario 4, an employee asks for 200 gift cards worth ₹500 each. The Policy Agent immediately flags the request against the Prohibited Items policy and blocks the run. Notice that zero budget is reserved, no vendor tools are called, and the Auditor Agent still runs to record a clear compliance explanation."*

### [3:50–4:30] Tamper-Evident Audit Log & Analytics Numbers
- **Screen:** Navigate to `/audit` and point to the green **Chain Valid (SHA-256 Verified)** badge and hash columns (`prev_hash`, `entry_hash`). Then click **Dashboard** to show updated spend, re-plan count, and time saved.
- **Narration:**
  > *"Every action across every run is written via PostgreSQL's `append_audit_log` function under an advisory lock, chaining each row's SHA-256 hash to the previous entry while database triggers reject UPDATE, DELETE, and TRUNCATE. Here on the Audit page, the entire hash chain verifies as valid, and our Dashboard analytics reflect the exact committed spend, re-plan count, and hours saved."*

### [4:30–5:00] Architecture & Guardrails Close
- **Screen:** Stay on the Dashboard or a completed Run Trace showing both the Purchase Order and Run Summary cards.
- **Narration:**
  > *"In one sentence: ProcureFlow pairs a React and Express SSE architecture with Google Gemini function calling and Supabase PostgreSQL RPCs. Most importantly, we follow 'LLM proposes, code disposes'—where AI agents handle unstructured reasoning and planning, while deterministic TypeScript and PostgreSQL guardrails enforce every rupee of budget, vendor ranking, approval routing, and tamper-evident auditing. Thank you!"*
