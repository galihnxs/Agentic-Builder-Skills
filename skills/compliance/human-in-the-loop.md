# Skill: Human-in-the-Loop (HITL)

**Role:** Compliance & Legal
**Phase:** Integration → Quality Control
**Autonomy Level:** Low (override pattern)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Human-in-the-Loop (HITL) is the architectural gate that pauses an agentic workflow at high-stakes decision points and routes the pending action to a human approver before execution. It is not a fallback for when the agent is confused — it is a deliberate design decision applied to specific action types that carry irreversible consequences, regulatory exposure, or trust risk that exceeds what an autonomous agent should bear alone.

HITL balances autonomy with control. The agent plans and prepares the action; the human decides whether to execute it. This preserves the efficiency of agentic workflows while keeping humans accountable for the decisions that matter.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** HITL is the mechanism that makes high-autonomy agents deployable in regulated industries. Without it, legal, healthcare, finance, and enterprise applications cannot use agents for consequential tasks. With it, the agent handles 80% of the workflow autonomously and surfaces only the high-stakes 20% for human decision.
- **Cost implication:** Human review adds human labor cost per HITL trigger. Design the policy so HITL triggers only for genuinely high-stakes actions — not as a catch-all for uncertainty. Measure HITL trigger rate and optimise the agent to reduce false positives.
- **Latency implication:** HITL introduces human latency — minutes to hours depending on the approval workflow. Design agent sessions to be pause-resumable. Never block a user-facing session while waiting for human approval — use async approval flows.
- **When to skip this:** Read-only, non-publishing, non-communicating actions. If the agent's action is fully reversible and contained (read a record, calculate a number, generate a draft), HITL adds latency with no risk reduction benefit.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A [`governance-as-code`](./governance-as-code.md) policy file with `REQUIRE_APPROVAL` entries
- An approval channel (Slack, email, internal dashboard, or webhook)
- A session state store that persists the paused agent state while waiting for approval
- A resume mechanism that re-enters the workflow from the exact pause point after approval

**Workflow:**

1. **Policy triggers HITL** — The governance evaluator returns `REQUIRE_APPROVAL` for a pending action. The orchestrator pauses the workflow before executing the action.
2. **Snapshot state** — The full session state (plan, completed steps, pending action, context) is written to the state store keyed by `session_id`. The agent does not lose work.
3. **Route to approver** — A notification is sent to the designated approver (from the policy entry) with: the pending action, the full context, and an approve/deny decision link.
4. **Wait** — The workflow is suspended. The orchestrator polls the state store for an approval decision (or listens via webhook). No LLM calls are made while waiting.
5. **Decision received** — If **approved**: the orchestrator resumes from the exact paused state, executes the action, and continues the chain. If **denied**: the orchestrator marks the step as `denied_by_human`, skips the action, and continues with the next non-dependent step (or halts if the denied step is critical path).
6. **Log** — Both decisions (approved and denied) are logged to the audit trail with: approver identity, timestamp, and stated reason.

**Failure modes to watch:**
- `ApprovalTimeout` — Caused by: no timeout on HITL waiting periods, causing sessions to hang indefinitely. Fix: set a maximum wait time (e.g., 24h). On timeout: deny the action, notify the approver, and log the timeout.
- `ApprovalBypass` — Caused by: a code path that executes the action if the approval system is unreachable. Fix: treat approval system unavailability as a DENY, not a fallback ALLOW.
- `ContextLoss` — Caused by: session state not being fully persisted before suspending. Fix: confirm state write success before sending the approval notification. If state write fails, don't send the notification.
- `FatiguedApprover` — Caused by: HITL triggering on too many low-stakes actions, causing approvers to approve reflexively. Fix: review HITL trigger rate monthly. If approval rate > 95%, the policy is too broad — narrow the REQUIRE_APPROVAL conditions.

**Integration touchpoints:**
- Triggered by: [`governance-as-code`](./governance-as-code.md) — `REQUIRE_APPROVAL` decisions
- Uses: [`state-observability`](../architect/state-observability.md) — session state persistence and audit logging
- Required by: [`tool-orchestration`](../architect/tool-orchestration.md) — HITL is the `HumanApprovalFn` implementation
- Feeds into: [`regional-legal-check`](./regional-legal-check.md) — regional rules determine which actions require HITL

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable to the approval flow itself. The context snapshot sent to the approver should be human-readable and concise — max 500 words. Do not send raw JSON to approvers.
- **Cost ceiling:** HITL cost = human reviewer time × hourly rate × HITL trigger rate. Budget this explicitly. High HITL trigger rates become expensive. Track and optimise.
- **Model requirement:** None. HITL is a workflow control mechanism — no LLM is involved in the approval process itself.
- **Non-determinism:** Zero. HITL decisions are made by humans and recorded deterministically. The resume path after approval is always the same regardless of when approval arrives.
- **Human gate required:** Yes — by definition. The HITL gate IS the human gate.

---

## 📦 Ready-to-Use Artifact: HITL Notification Schema + Resume Handler

### Option A · Approval Notification Template (Skill Layer)

```markdown
## HITL Approval Request

**Session:** {{session_id}}
**Requested by:** {{agent_name}} ({{role}})
**Time:** {{timestamp}}
**Approver:** {{required_approver}}

---

### Pending Action
**Type:** {{action_type}}
**Description:** {{action_description}}

### Why This Needs Your Approval
{{policy_reason}}

### Context
**User intent:** {{user_intent}}
**Steps completed so far:** {{completed_steps_summary}}
**What happens if approved:** {{approval_consequence}}
**What happens if denied:** {{denial_consequence}}

### Action Required
Please approve or deny within {{timeout_hours}} hours.

[APPROVE] → {{approve_url}}
[DENY] → {{deny_url}}

If you have questions, the full session trace is available at: {{trace_url}}

---
*This request was generated by the agentic governance system. Approval or denial will be logged.*
```

### Option B · JSON Schema (HITL Event)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "HITLEvent",
  "description": "The event recorded when a HITL gate is triggered",
  "type": "object",
  "required": ["event_id", "session_id", "action_type", "status", "created_at"],
  "properties": {
    "event_id": { "type": "string", "description": "Unique HITL event ID. Format: hitl-[uuid4]" },
    "session_id": { "type": "string" },
    "action_type": { "type": "string" },
    "action_description": { "type": "string", "description": "Human-readable description of what the agent wants to do" },
    "pending_action_payload": { "type": "object", "description": "The full action payload awaiting approval" },
    "required_approver": { "type": "string", "description": "Role or person ID who must approve. From policy entry." },
    "policy_reason": { "type": "string", "description": "Which policy rule triggered this HITL event" },
    "status": {
      "type": "string",
      "enum": ["pending", "approved", "denied", "timed_out"],
      "description": "Current status of this approval request"
    },
    "created_at": { "type": "string", "format": "date-time" },
    "expires_at": { "type": "string", "format": "date-time", "description": "After this time, status becomes timed_out and action is denied" },
    "decided_at": { "type": ["string", "null"], "format": "date-time" },
    "decided_by": { "type": ["string", "null"], "description": "Identity of the human who made the decision" },
    "decision_reason": { "type": ["string", "null"], "description": "Optional note from the approver" }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`governance-as-code`](./governance-as-code.md) | Compliance | Policy entries with `REQUIRE_APPROVAL` trigger this skill |
| [`regional-legal-check`](./regional-legal-check.md) | Compliance | Regional requirements determine HITL scope |
| [`state-observability`](../architect/state-observability.md) | Architect | Session state persists across the HITL pause-resume cycle |
| [`tool-orchestration`](../architect/tool-orchestration.md) | Architect | HITL is the `HumanApprovalFn` wired into the orchestrator |

---

## 📊 Evaluation Checklist

- [ ] Session state fully persisted before approval notification sent
- [ ] Approval timeout enforced — sessions don't hang indefinitely
- [ ] Approval system unavailability treated as DENY, not ALLOW
- [ ] Both approved and denied decisions logged with approver identity
- [ ] HITL trigger rate measured monthly — target < 20% of total actions
- [ ] Resume after approval tested — workflow continues from exact pause point

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Human-in-the-Loop (HITL) Gateway" section.*
*Template version: v1.0.0*
