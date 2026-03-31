# Skill: Governance as Code

**Role:** Compliance & Legal
**Phase:** Design → Integration
**Autonomy Level:** Low (constrains all other autonomy levels)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Governance as Code is the practice of encoding an organisation's compliance rules, operational policies, and legal constraints as machine-readable, version-controlled configuration — rather than as human-readable policy documents that agents ignore at runtime. By 2026, with 40%+ of enterprise applications embedding AI agents, "Policy-as-Code" has become mandatory to ensure agents operate within organisational compliance and security boundaries.

In practice, this means: every agentic action type (send email, write to database, access customer PII, publish content) has a corresponding policy rule that the orchestrator enforces before execution. The agent never decides whether an action is "probably fine" — the policy file decides, deterministically, every time.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A single governance violation by an autonomous agent — sending an unauthorized email, accessing data outside its permitted scope, publishing inaccurate content attributed to the organisation — can trigger regulatory action, user trust collapse, or legal liability. Governance as Code prevents this class of failure at the architectural level.
- **Cost implication:** Retroactive compliance fixes after a governance violation are orders of magnitude more expensive than building the policy gate upfront. A policy file costs 1 engineer-day to design. A compliance incident costs weeks of remediation.
- **Latency implication:** Policy checks are deterministic rule evaluations (no LLM call) — they add <1ms per action. This is not a performance concern.
- **When to skip this:** Never. Even a minimal governance policy (a single rule: "never send external communications without human approval") is better than no policy. Start minimal and expand.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A defined list of action types your agents can perform
- Legal and compliance sign-off on the initial policy ruleset
- A policy evaluation function called by the orchestrator before every side-effect action

**Workflow:**

1. **Catalogue action types** — List every side-effect action the agent system can perform. Examples: `send_email`, `publish_content`, `write_database`, `access_pii`, `call_external_api`, `delete_record`.
2. **Define rules per action type** — For each action, specify: who can authorise it, under what conditions, with what data constraints, and what logging is required.
3. **Encode as policy config** — Write the rules in a structured, version-controlled format (YAML or JSON). This is the Policy File.
4. **Implement policy evaluator** — A deterministic function that takes `(action_type, context, actor_id)` and returns `ALLOW | DENY | REQUIRE_APPROVAL`. No LLM involved.
5. **Wire into orchestrator** — The policy evaluator is called at the side-effect gate in [`tool-orchestration`](../architect/tool-orchestration.md) before every `side_effects: true` step. The orchestrator cannot bypass it.
6. **Audit log** — Every policy evaluation (ALLOW and DENY) is logged with: timestamp, action type, context snapshot, decision, and actor. This log is the compliance evidence trail.

**Failure modes to watch:**
- `PolicyBypass` — Caused by: a developer adding a code path that calls a side-effect tool directly without routing through the policy evaluator. Fix: the policy evaluator must be called at the infrastructure level (in the MCP tool handler), not just in the orchestrator.
- `StalPolicy` — Caused by: the policy file not being updated when new action types are added. Fix: any new tool registration must include a corresponding policy rule. CI fails if a tool with `side_effects: true` has no policy entry.
- `OverPermissive` — Caused by: default policy being `ALLOW` for unknown action types. Fix: default must be `DENY` for any action type not explicitly listed in the policy file.
- `AuditGap` — Caused by: logging only denied actions, not allowed ones. Fix: log every policy evaluation. Compliance audits require the full record.

**Integration touchpoints:**
- Required by: [`tool-orchestration`](../architect/tool-orchestration.md) — policy check is the side-effect gate
- Required by: [`human-in-the-loop`](./human-in-the-loop.md) — `REQUIRE_APPROVAL` decisions route to HITL
- Required by: [`regional-legal-check`](./regional-legal-check.md) — regional rules are policy entries
- Feeds into: [`state-observability`](../architect/state-observability.md) — policy decisions are audit-trail spans

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable — policy evaluation is deterministic, not LLM-based.
- **Cost ceiling:** Policy evaluation is a local function call — zero API cost. Audit log storage: negligible.
- **Model requirement:** None. Policy evaluation must NOT use an LLM — LLM-based policy decisions are non-deterministic and cannot be used for compliance purposes.
- **Non-determinism:** Zero. Policy evaluation is fully deterministic. The same `(action_type, context)` always produces the same decision.
- **Human gate required:** Yes — for policy changes. Any modification to the policy file requires legal/compliance review and approval before deployment.

---

## 📦 Ready-to-Use Artifact: Policy File + Evaluator

### Option B · Policy File Schema (YAML)

```yaml
# File: config/governance/policy.yaml
# Governance policy for agentic actions.
# Changes require: legal/compliance review + PR approval + deployment sign-off.
# Default decision for unlisted action types: DENY

version: "1.0.0"
default_decision: DENY
audit_all_evaluations: true

policies:
  # External communications
  - action_type: send_email
    decision: REQUIRE_APPROVAL
    conditions:
      - "recipient must be in approved_contacts list OR have explicit user consent"
      - "content must not contain PII unless explicitly authorised"
    approver: human_operator
    log_level: HIGH

  - action_type: publish_content
    decision: REQUIRE_APPROVAL
    conditions:
      - "content must pass reflection-pattern evaluation with confidence=high"
      - "no customer-identifiable information in content"
    approver: human_operator
    log_level: HIGH

  # Database operations
  - action_type: write_database
    decision: ALLOW
    conditions:
      - "target_table must be in allowed_write_tables list"
      - "record must not contain PII fields: [ssn, passport_number, full_name+birthdate]"
    log_level: MEDIUM

  - action_type: delete_record
    decision: REQUIRE_APPROVAL
    conditions:
      - "deletion must be reversible (soft delete only)"
      - "record_id must match the session's authorised scope"
    approver: human_operator
    log_level: HIGH

  # Data access
  - action_type: access_pii
    decision: REQUIRE_APPROVAL
    conditions:
      - "requester must have data_access role"
      - "purpose must be logged and match an approved use case"
    approver: data_protection_officer
    log_level: HIGH

  # External APIs
  - action_type: call_external_api
    decision: ALLOW
    conditions:
      - "api_host must be in approved_external_hosts list"
      - "no authentication credentials sent in URL parameters"
    log_level: MEDIUM

  # Internal read operations (no approval needed)
  - action_type: query_database_read
    decision: ALLOW
    conditions:
      - "target_table must be in allowed_read_tables list"
    log_level: LOW

  - action_type: rag_query
    decision: ALLOW
    conditions:
      - "query must not include injection patterns"
    log_level: LOW

approved_external_hosts:
  - "api.tavily.com"
  - "api.openai.com"
  - "api.anthropic.com"

allowed_write_tables:
  - "agent_outputs"
  - "session_logs"
  - "user_preferences"

allowed_read_tables:
  - "products"
  - "knowledge_base"
  - "agent_outputs"
  - "session_logs"
```

### Option C · Go Policy Evaluator (Tool Layer)

```go
// File: internal/governance/policy_evaluator.go
// Deterministic policy evaluation. No LLM. No network calls.
// Called by the orchestrator before every side-effect action.

package governance

import (
	"fmt"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Decision string

const (
	Allow           Decision = "ALLOW"
	Deny            Decision = "DENY"
	RequireApproval Decision = "REQUIRE_APPROVAL"
)

type PolicyEntry struct {
	ActionType  string   `yaml:"action_type"`
	Decision    Decision `yaml:"decision"`
	Conditions  []string `yaml:"conditions"`
	Approver    string   `yaml:"approver"`
	LogLevel    string   `yaml:"log_level"`
}

type PolicyConfig struct {
	Version              string        `yaml:"version"`
	DefaultDecision      Decision      `yaml:"default_decision"`
	AuditAllEvaluations  bool          `yaml:"audit_all_evaluations"`
	Policies             []PolicyEntry `yaml:"policies"`
	ApprovedExternalHosts []string     `yaml:"approved_external_hosts"`
	AllowedWriteTables   []string      `yaml:"allowed_write_tables"`
	AllowedReadTables    []string      `yaml:"allowed_read_tables"`
}

type EvaluationContext struct {
	SessionID   string
	ActorID     string
	ActionType  string
	TargetHost  string // for call_external_api
	TargetTable string // for database operations
}

type EvaluationResult struct {
	Decision    Decision
	ActionType  string
	SessionID   string
	ActorID     string
	Timestamp   time.Time
	Reason      string
	RequiredApprover string
}

type PolicyEvaluator struct {
	config *PolicyConfig
	index  map[string]*PolicyEntry
}

func LoadPolicyEvaluator(configPath string) (*PolicyEvaluator, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("load policy: %w", err)
	}
	var cfg PolicyConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse policy: %w", err)
	}
	idx := make(map[string]*PolicyEntry, len(cfg.Policies))
	for i := range cfg.Policies {
		idx[cfg.Policies[i].ActionType] = &cfg.Policies[i]
	}
	return &PolicyEvaluator{config: &cfg, index: idx}, nil
}

// Evaluate returns the policy decision for an action. Always logs.
func (e *PolicyEvaluator) Evaluate(ctx EvaluationContext) EvaluationResult {
	result := EvaluationResult{
		ActionType: ctx.ActionType,
		SessionID:  ctx.SessionID,
		ActorID:    ctx.ActorID,
		Timestamp:  time.Now(),
	}

	entry, found := e.index[ctx.ActionType]
	if !found {
		result.Decision = e.config.DefaultDecision
		result.Reason = fmt.Sprintf("action_type %q not in policy — default: %s", ctx.ActionType, e.config.DefaultDecision)
		e.audit(result)
		return result
	}

	// Additional context-based checks
	if ctx.ActionType == "call_external_api" && !e.isApprovedHost(ctx.TargetHost) {
		result.Decision = Deny
		result.Reason = fmt.Sprintf("host %q not in approved_external_hosts", ctx.TargetHost)
		e.audit(result)
		return result
	}
	if strings.HasPrefix(ctx.ActionType, "write_database") && !e.isAllowedWriteTable(ctx.TargetTable) {
		result.Decision = Deny
		result.Reason = fmt.Sprintf("table %q not in allowed_write_tables", ctx.TargetTable)
		e.audit(result)
		return result
	}

	result.Decision = entry.Decision
	result.RequiredApprover = entry.Approver
	result.Reason = fmt.Sprintf("policy match: %s", entry.Decision)
	e.audit(result)
	return result
}

func (e *PolicyEvaluator) isApprovedHost(host string) bool {
	for _, h := range e.config.ApprovedExternalHosts {
		if h == host { return true }
	}
	return false
}

func (e *PolicyEvaluator) isAllowedWriteTable(table string) bool {
	for _, t := range e.config.AllowedWriteTables {
		if t == table { return true }
	}
	return false
}

func (e *PolicyEvaluator) audit(r EvaluationResult) {
	if e.config.AuditAllEvaluations {
		fmt.Printf("GOVERNANCE_AUDIT session=%s actor=%s action=%s decision=%s reason=%q ts=%s\n",
			r.SessionID, r.ActorID, r.ActionType, r.Decision, r.Reason, r.Timestamp.Format(time.RFC3339))
	}
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`human-in-the-loop`](./human-in-the-loop.md) | Compliance | `REQUIRE_APPROVAL` decisions route to HITL |
| [`regional-legal-check`](./regional-legal-check.md) | Compliance | Regional rules are policy entries in this file |
| [`tool-orchestration`](../architect/tool-orchestration.md) | Architect | Policy evaluator is the side-effect gate in the orchestrator |
| [`state-observability`](../architect/state-observability.md) | Architect | Audit log entries are compliance-grade spans |

---

## 📊 Evaluation Checklist

- [ ] Default decision is `DENY` for unlisted action types — verified
- [ ] Every tool with `side_effects: true` has a corresponding policy entry — verified by CI
- [ ] Policy evaluator is called at the infrastructure level (MCP tool handler) not just orchestrator
- [ ] All evaluations (ALLOW + DENY) logged — audit trail complete
- [ ] Policy file changes require PR + legal review — enforced via branch protection
- [ ] Adversarial test: unknown action type returns DENY

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Governance as Code" and "2025-2026 Operational Trends" sections.*
*Template version: v1.0.0*
