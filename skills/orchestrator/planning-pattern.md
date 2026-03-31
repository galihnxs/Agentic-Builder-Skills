# Skill: Planning Pattern

**Role:** Orchestrator
**Phase:** Orchestration
**Autonomy Level:** Semi → High
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The Planning Pattern is the core cognitive loop of a highly autonomous agent. Instead of following a hard-coded script, the LLM is given a goal and a toolbox, then asked to generate a step-by-step plan at runtime before executing anything. Each step names the tool to call, the arguments to pass, and the expected output — creating a machine-readable "contract" that downstream code can reliably execute.

This pattern prevents the single biggest failure mode in naive agent design: giving an LLM a complex task and hoping it figures out the steps implicitly. When steps are explicit and structured, every failure becomes attributable to a specific node — not lost somewhere in a 2,000-token black box.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Enables agents to handle complex, multi-step requests that were never explicitly anticipated by the developer — without rewriting the routing logic every time a new use case emerges.
- **Cost implication:** A bad plan caught before execution saves every downstream LLM call in that chain. A 5-step plan with a wrong first step wastes 4 additional calls if not caught early. Planning externalises the "thinking" into a reviewable artifact.
- **Latency implication:** Adds ~1 LLM call (the planning call) upfront. Saves 2–5 calls on average by eliminating mid-chain failures and restarts on complex tasks.
- **When to skip this:** Single-step, deterministic tasks with a clear ground truth (e.g., "extract the invoice date from this PDF"). Use a direct tool call instead — planning overhead is not justified.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A defined toolbox: every tool the agent can call must be registered with a name, description, and typed parameter schema
- A state object carrying `session_id`, `user_intent`, and `history`
- A system prompt that instructs the LLM to output plans strictly in JSON (see artifact below)

**Workflow:**

1. **Receive intent** — The router passes the raw user query and available tools to the Orchestrator.
2. **Generate plan** — The LLM outputs a JSON array of steps. Each step has `step_number`, `tool_name`, `args`, and `expected_output`. No execution happens yet.
3. **Validate plan** — Your application code parses the JSON. If it fails schema validation, the plan is rejected and re-requested with the error as feedback (max 2 retries).
4. **Execute step-by-step** — For each step, the code dispatches the named tool with the provided args. The real output replaces `expected_output` in the state object.
5. **Pass context forward** — Each step's actual output is appended to `history` and fed into the next step's context. The LLM never sees a step in isolation.
6. **Synthesise final answer** — After all steps complete, a final LLM call receives the full history and produces the user-facing response.

**Failure modes to watch:**
- `JSONDecodeError` — Caused by: LLM ignoring the JSON-only constraint and adding prose. Fix: add `"Respond ONLY with a JSON array. No explanation before or after."` to the system prompt. Add a regex pre-parser to strip accidental markdown fences.
- `UnknownToolError` — Caused by: LLM hallucinating a tool name not in the registered toolbox. Fix: include the exact list of available tool names in the system prompt. Reject and re-plan on detection.
- `ContextDriftError` — Caused by: step 4 outputs not being passed to step 5, causing the LLM to reason from stale context. Fix: enforce that `history` is always the full execution trace, never truncated mid-plan.
- `InfinitePlanLoop` — Caused by: no `max_turns` guard. Fix: enforce a hard limit of 10 steps per plan. Anything over is a design smell — decompose the task instead.

**Integration touchpoints:**
- Feeds into: [`task-decomposition`](./task-decomposition.md) — when a plan step is itself too large
- Feeds into: [`json-xml-output`](./json-xml-output.md) — for output format enforcement
- Receives from: [`react-pattern`](../researcher/react-pattern.md) — when a plan step requires iterative tool use
- Required by: [`multi-agent-coordination`](./multi-agent-coordination.md) — the Manager agent uses this pattern to delegate to sub-agents

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each plan step adds ~200–400 tokens to history. A 10-step plan with tool outputs can consume 6,000–8,000 tokens. Use `gpt-4o` or `claude-sonnet` — do not use context-limited models for plans with > 5 steps.
- **Cost ceiling:** Planning call (~500 tokens) + 5 execution calls (~300 tokens each) = ~2,000 tokens per task. At GPT-4o pricing (~$5/1M tokens), this is ~$0.01/task. Budget accordingly at scale.
- **Model requirement:** Requires a model with reliable JSON output mode or native function-calling support. Base completion models without instruction tuning will not reliably output valid JSON plans.
- **Non-determinism:** The same query may produce different plans across runs. This is by design for highly autonomous agents — but if your use case requires reproducibility, fix the plan structure in a lower-autonomy workflow instead.
- **Human gate required:** Yes — for any plan that contains steps with `side_effects: true` (DB writes, emails sent, API POSTs). Gate those specific steps before execution, not the whole plan.

---

## 📦 Ready-to-Use Artifact: Orchestrator Planning System Prompt

*Paste this into your Claude Project custom instructions or the `system` field of your API call.*

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Orchestrator in a multi-agent system. Your single responsibility is:
Receive a user goal, reason about the available tools, and produce a structured execution plan.

You do NOT execute steps. You ONLY produce plans.

## Available Tools
You will be given a list of available tools at runtime in the `tools` field of the user message.
Each tool has: `name`, `description`, and `parameters`.

## Your Process
1. Read the user's goal carefully.
2. Identify which tools are needed and in what order.
3. Check: does any step depend on the output of a previous step? If yes, sequence them — do not parallelise dependent steps.
4. Check: can any steps run in parallel (no dependency)? Mark them with the same `parallel_group` integer.
5. Produce the plan. Nothing else.

## Output Format
Respond ONLY with a valid JSON array. No preamble. No explanation. No markdown fences.

[
  {
    "step_number": 1,
    "description": "One sentence describing what this step accomplishes",
    "tool_name": "exact_tool_name_from_registry",
    "args": {
      "param_name": "param_value"
    },
    "expected_output": "One sentence describing what a successful result looks like",
    "side_effects": false,
    "parallel_group": null
  }
]

## Hard Constraints
- NEVER invent a tool name not provided in the available tools list
- NEVER include more than 10 steps — if the task requires more, the task must be decomposed first
- NEVER combine two distinct actions into one step
- NEVER skip the `side_effects` field — set to true for any step that writes, sends, or deletes
- If the goal is impossible with the available tools, return: [{"step_number": 1, "tool_name": "CANNOT_COMPLETE", "reason": "explain why"}]
```

---

### Option B · JSON Schema (Plan Validation Layer)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ExecutionPlan",
  "description": "The structured plan produced by the Orchestrator before any tool is called",
  "type": "array",
  "minItems": 1,
  "maxItems": 10,
  "items": {
    "type": "object",
    "required": ["step_number", "description", "tool_name", "args", "expected_output", "side_effects"],
    "properties": {
      "step_number": {
        "type": "integer",
        "minimum": 1,
        "description": "Execution order. Steps with the same parallel_group can run concurrently."
      },
      "description": {
        "type": "string",
        "description": "One sentence: what this step accomplishes and why it is needed."
      },
      "tool_name": {
        "type": "string",
        "description": "Must exactly match a registered tool name. Reject if not found in registry."
      },
      "args": {
        "type": "object",
        "description": "Key-value pairs matching the tool's parameter schema."
      },
      "expected_output": {
        "type": "string",
        "description": "What a successful execution of this step looks like. Used for validation."
      },
      "side_effects": {
        "type": "boolean",
        "description": "true = this step writes, sends, deletes, or modifies external state. Requires human gate."
      },
      "parallel_group": {
        "type": ["integer", "null"],
        "description": "Steps sharing the same integer value can execute concurrently. null = sequential."
      }
    }
  }
}
```

---

### Option C · Go Tool Registration (Tool Layer — MCP Server)

```go
// File: internal/tools/orchestrator_plan.go
// Validates and executes a structured plan produced by the Planning Pattern.
// Requires: modelcontextprotocol/go-sdk v1.2.0+

package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// PlanStep mirrors the JSON schema for a single execution step.
type PlanStep struct {
	StepNumber     int            `json:"step_number"     description:"Execution order (1-indexed)"`
	Description    string         `json:"description"     description:"One sentence: what this step accomplishes"`
	ToolName       string         `json:"tool_name"       description:"Must match a registered tool name exactly"`
	Args           map[string]any `json:"args"            description:"Parameters matching the target tool's schema"`
	ExpectedOutput string         `json:"expected_output" description:"What success looks like for this step"`
	SideEffects    bool           `json:"side_effects"    description:"true = requires human gate before execution"`
	ParallelGroup  *int           `json:"parallel_group"  description:"Steps with same value run concurrently. null = sequential"`
}

// ValidatePlanParams is the input contract for the plan validator tool.
type ValidatePlanParams struct {
	Plan           []PlanStep `json:"plan"             description:"The execution plan produced by the Orchestrator"`
	RegisteredTools []string  `json:"registered_tools" description:"List of valid tool names in this session"`
}

// ValidatePlanResult reports whether the plan is safe to execute.
type ValidatePlanResult struct {
	Valid        bool     `json:"valid"`
	Errors       []string `json:"errors"`
	SideEffectSteps []int `json:"side_effect_steps"` // Step numbers requiring human approval
}

// RegisterValidatePlanTool registers the plan validator with the MCP server.
func RegisterValidatePlanTool(server *mcp.Server) {
	server.AddTool(mcp.Tool{
		Name:        "validate_execution_plan",
		Description: "Validates an Orchestrator plan before execution: checks tool names exist, step count ≤ 10, and flags side-effect steps requiring human approval.",
		InputSchema: mcp.MustGenerateSchema[ValidatePlanParams](),
	}, handleValidatePlan)
}

func handleValidatePlan(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var params ValidatePlanParams
	if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
	}

	result := ValidatePlanResult{Valid: true}

	// Rule 1: Max 10 steps
	if len(params.Plan) > 10 {
		result.Valid = false
		result.Errors = append(result.Errors, fmt.Sprintf("plan has %d steps; maximum is 10 — decompose the task", len(params.Plan)))
	}

	// Build tool registry for O(1) lookup
	registry := make(map[string]bool, len(params.RegisteredTools))
	for _, t := range params.RegisteredTools {
		registry[t] = true
	}

	for _, step := range params.Plan {
		// Rule 2: Tool must exist in registry
		if !registry[step.ToolName] && step.ToolName != "CANNOT_COMPLETE" {
			result.Valid = false
			result.Errors = append(result.Errors,
				fmt.Sprintf("step %d references unknown tool: %q", step.StepNumber, step.ToolName))
		}
		// Rule 3: Flag side-effect steps for human gate
		if step.SideEffects {
			result.SideEffectSteps = append(result.SideEffectSteps, step.StepNumber)
		}
	}

	output, err := json.Marshal(result)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal error: %v", err)), nil
	}

	return mcp.NewToolResultText(string(output)), nil
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`task-decomposition`](./task-decomposition.md) | Orchestrator | Used when a single plan step is too large — breaks it into a sub-plan |
| [`json-xml-output`](./json-xml-output.md) | Orchestrator | Enforces the structured output contract the parser depends on |
| [`react-pattern`](../researcher/react-pattern.md) | Researcher | Individual plan steps may invoke a ReAct loop internally |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | The final synthesis step should pass through the Evaluator before reaching the user |
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Any plan step with `side_effects: true` must route through the sandbox guardrail |

---

## 📊 Evaluation Checklist

Before considering this skill "production-ready" in your system:

- [ ] System prompt tested with ≥ 20 real user queries from your domain
- [ ] Plan validator rejects hallucinated tool names 100% of the time
- [ ] Side-effect steps correctly flagged and routed to human gate
- [ ] `max_turns = 10` hard limit enforced in the execution loop
- [ ] History passed correctly between steps — no context truncation mid-plan
- [ ] Cost per plan estimated: planning call + N execution calls, approved by PM
- [ ] Component-level eval written: feed 20 queries, check output is valid JSON matching schema

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — Planning Pattern |

---

*Source: Grounded in Andrew Ng's Agentic AI course (DeepLearning.AI) — Planning Design Pattern section.*
*Template version: v1.0.0 — see [`_template/SKILL_TEMPLATE.md`](../../_template/SKILL_TEMPLATE.md)*
