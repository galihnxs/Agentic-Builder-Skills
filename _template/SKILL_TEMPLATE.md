# Skill: [Name of the Skill]

<!--
  HOW TO USE THIS TEMPLATE
  ─────────────────────────
  1. Copy this file to the correct /skills/[role]/ folder
  2. Rename it to: [kebab-case-skill-name].md
  3. Fill every section below — do NOT delete any section headers
  4. The artifact MUST be copy-paste ready. No placeholders left unfilled.
  5. Open a PR with the title: "skill: [role] / [skill-name]"

  WHAT NOT TO DO
  ──────────────
  ✗ Do not write essays. Use bullet points.
  ✗ Do not use Lorem Ipsum. Use realistic domain copy.
  ✗ Do not leave the artifact as pseudo-code with "// your logic here"
  ✗ Do not skip the PM Perspective. Unjustified skills don't get shipped.
  ✗ Do not skip the Constraints section. Unknown limits become production incidents.
-->

**Role:** [Who owns this? Choose one: AI Architect · Lead PM · Evaluator · Orchestrator · Researcher · Data Analyst · Creator · Compliance · Protector]
**Phase:** [Where in the agent lifecycle? Choose one: Design · Orchestration · Execution · Quality Control · Integration · Safety · Post-Mortem]
**Autonomy Level:** [What degree of LLM autonomy does this pattern enable? Choose one: Low · Semi · High]
**Layer:** [Which repo layer? Choose one: Skill Layer (Markdown/JSON) · Tool Layer (Go MCP)]

---

## 📖 What is it?

<!--
  2-3 sentences max. Define the concept.
  Base this strictly on the provided source material (Andrew Ng's course PDF).
  Do NOT invent concepts not grounded in the pattern literature.
-->

[Concept definition — what this pattern/skill/role is, grounded in agentic AI fundamentals.]

[Second paragraph: what problem it solves at a systems level — not just "it's useful" but specifically what failure mode it prevents.]

---

## 💡 Why it Matters (The PM Perspective)

<!--
  This is the sprint justification. Answer ONE of these questions:
  - How does this reduce API cost or token usage?
  - How does this lower latency?
  - How does this prevent hallucinations reaching users?
  - How does this solve the M × N integration problem?
  - How does this reduce engineering time or rework?
  Be specific. Use numbers where possible.
-->

- **Business impact:** [Concrete outcome — e.g., "Reduces hallucination rate from ~40% to <5% on structured extraction tasks"]
- **Cost implication:** [e.g., "Eliminates re-runs by catching errors before they propagate downstream — saves N LLM calls per failed task"]
- **Latency implication:** [e.g., "Adds ~2s per reflection cycle but prevents full pipeline restarts that cost 30s+"]
- **When to skip this:** [Be honest. e.g., "Not worth implementing for tasks with a single deterministic output and verified ground truth"]

---

## 🛠️ How it Works (The Engineering Perspective)

<!--
  Step-by-step technical breakdown. Use numbered steps for sequences,
  bullet points for parallel considerations.
  Name the specific components, files, or Go structs where relevant.
-->

**Prerequisites:**
- [What must exist before this skill can run? e.g., "A running MCP server with tool registration"]
- [e.g., "State object with `context`, `history`, and `tool_results` fields"]

**Workflow:**

1. **[Step Name]** — [What happens. Who/what does it. What the output is.]
2. **[Step Name]** — [What happens. What triggers the next step.]
3. **[Step Name]** — [What happens. What the success condition is.]
4. **[Step Name]** — [What happens. What the failure path looks like.]

**Failure modes to watch:**
- `[ErrorType]` — Caused by: [reason]. Fix: [action].
- `[ErrorType]` — Caused by: [reason]. Fix: [action].

**Integration touchpoints:**
- Feeds into: [`skill-name`](../[role]/[skill-name].md)
- Receives from: [`skill-name`](../[role]/[skill-name].md)
- Required by: [`skill-name`](../[role]/[skill-name].md)

---

## ⚠️ Constraints & Guardrails

<!--
  Every skill has limits. Document them honestly.
  This section prevents misuse more than any other section.
-->

- **Context window:** [e.g., "Reflection adds ~800 tokens per cycle. Cap at 3 cycles for GPT-3.5, 5 for GPT-4o."]
- **Cost ceiling:** [e.g., "Each ReAct loop iteration costs ~$0.003 on GPT-4o. Set max_turns=10 hard limit."]
- **Model requirement:** [e.g., "Requires a model with function-calling/tool-use support. Does NOT work with base completion models."]
- **Non-determinism:** [e.g., "Output varies across runs. Never use for tasks requiring bit-identical outputs."]
- **Human gate required:** [Yes/No + condition. e.g., "Yes — for any action that modifies external state (send email, DB write, API POST)."]

---

## 📦 Ready-to-Use Artifact: [Name of Artifact]

*Save this in your codebase to instantly implement this skill.*

<!--
  ARTIFACT RULES
  ──────────────
  - Must be ONE of: System Prompt (markdown), JSON Schema, Go Struct + Handler
  - Must be complete — no "// TODO" or placeholder values
  - Must use realistic domain copy — not "example text" or "lorem ipsum"
  - For system prompts: write as if speaking directly to the LLM agent persona
  - For JSON schemas: include all required fields, types, and a description per field
  - For Go structs: include the full tool registration pattern with struct tags

  CHOOSE THE RIGHT FORMAT FOR YOUR LAYER:
  ┌─────────────────────────────────────────────────────────────────┐
  │ SKILL LAYER (copy into Claude Project or LLM system prompt):   │
  │   → Use: markdown system prompt block                           │
  │                                                                  │
  │ TOOL LAYER (implement as Go MCP server):                        │
  │   → Use: Go struct with JSON tags + tool registration snippet   │
  │                                                                  │
  │ EVALUATION / ROUTING (language-agnostic schema):                │
  │   → Use: JSON schema                                            │
  └─────────────────────────────────────────────────────────────────┘
-->

### Option A · System Prompt (Skill Layer — paste into Claude Project or API `system` field)

```markdown
## Role
You are the [Role Name] in a multi-agent system. Your single responsibility is:
[One sentence. What this agent does and nothing more.]

## Inputs
You will receive:
- `context`: [description of what context you receive]
- `task`: [description of the specific task object]
- `constraints`: [any hard constraints passed at runtime]

## Your Process
1. [Step 1 — be explicit about what the LLM should think/do first]
2. [Step 2 — what to check or validate]
3. [Step 3 — what to produce]

## Output Format
Respond ONLY in the following JSON structure. No preamble. No explanation outside the JSON.

{
  "status": "success | failure | needs_human_review",
  "result": "[your primary output]",
  "confidence": "high | medium | low",
  "reason": "[one sentence — why you produced this result]",
  "next_action": "[what the orchestrator should do next]"
}

## Hard Constraints
- NEVER [specific prohibited action for this role]
- NEVER [specific prohibited action for this role]
- If you are uncertain, set status to "needs_human_review" — do not guess
```

---

### Option B · JSON Schema (Evaluation / Routing Layer)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "[SkillName]Input",
  "description": "Input contract for the [Role Name] agent skill",
  "type": "object",
  "required": ["task_id", "context", "task"],
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Unique identifier for this task run. Format: [role]-[uuid4]",
      "example": "orchestrator-a1b2c3d4"
    },
    "context": {
      "type": "object",
      "description": "Shared state passed from the router",
      "properties": {
        "session_id": { "type": "string" },
        "user_intent": { "type": "string" },
        "history": {
          "type": "array",
          "items": { "type": "object" },
          "description": "Previous agent outputs in this session"
        }
      },
      "required": ["session_id", "user_intent"]
    },
    "task": {
      "type": "object",
      "description": "The specific work this agent must perform",
      "properties": {
        "instruction": { "type": "string" },
        "input_data": { "type": "object" },
        "output_format": {
          "type": "string",
          "enum": ["json", "markdown", "plain_text"]
        }
      },
      "required": ["instruction"]
    },
    "constraints": {
      "type": "object",
      "description": "Runtime guardrails passed from the orchestrator",
      "properties": {
        "max_tokens": { "type": "integer", "default": 1000 },
        "max_turns": { "type": "integer", "default": 5 },
        "require_human_approval": { "type": "boolean", "default": false }
      }
    }
  }
}
```

---

### Option C · Go Tool Registration (Tool Layer — MCP Server)

```go
// File: internal/tools/[skill_name].go
// MCP Server tool registration for [Skill Name]
// Requires: modelcontextprotocol/go-sdk v1.2.0+

package tools

import (
    "context"
    "encoding/json"
    "fmt"

    "github.com/modelcontextprotocol/go-sdk/mcp"
)

// [SkillName]Params defines the input contract for this tool.
// Struct tags are the source of truth for the LLM's tool schema —
// never rely on comments or docstrings.
type [SkillName]Params struct {
    // Required fields
    TaskID      string `json:"task_id"      description:"Unique run identifier. Format: [role]-[uuid4]"`
    Instruction string `json:"instruction"  description:"The specific task this agent must perform"`
    
    // Optional fields with defaults
    MaxTurns    int    `json:"max_turns,omitempty"     description:"Hard limit on ReAct loop iterations. Default: 5"`
    OutputFormat string `json:"output_format,omitempty" description:"json | markdown | plain_text. Default: json"`
}

// [SkillName]Result defines the output contract.
// The Orchestrator reads this struct to decide next routing.
type [SkillName]Result struct {
    Status     string `json:"status"`      // "success" | "failure" | "needs_human_review"
    Result     string `json:"result"`
    Confidence string `json:"confidence"`  // "high" | "medium" | "low"
    Reason     string `json:"reason"`
    NextAction string `json:"next_action"`
}

// Register[SkillName]Tool registers this skill with the MCP server.
// Call this from your server's tool registration block.
func Register[SkillName]Tool(server *mcp.Server) {
    server.AddTool(mcp.Tool{
        Name:        "[skill-name]",
        Description: "[One sentence: what this tool does and when to call it]",
        InputSchema: mcp.MustGenerateSchema[[SkillName]Params](),
    }, handle[SkillName])
}

func handle[SkillName](ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
    var params [SkillName]Params
    if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
        return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
    }

    // Apply defaults
    if params.MaxTurns == 0 {
        params.MaxTurns = 5
    }
    if params.OutputFormat == "" {
        params.OutputFormat = "json"
    }

    // TODO: Replace with your actual skill logic
    result := [SkillName]Result{
        Status:     "success",
        Result:     "implement your logic here",
        Confidence: "high",
        Reason:     "task completed within constraints",
        NextAction: "return_to_orchestrator",
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
| [`skill-name`](../[role]/[skill-name].md) | [Role] | [e.g., "Feeds output into this skill"] |
| [`skill-name`](../[role]/[skill-name].md) | [Role] | [e.g., "Required as a prerequisite"] |
| [`skill-name`](../[role]/[skill-name].md) | [Role] | [e.g., "Alternative when X condition is true"] |

---

## 📊 Evaluation Checklist

Before considering this skill "production-ready" in your system:

- [ ] System prompt tested with ≥ 20 real examples from your domain
- [ ] Failure modes documented and reproducing test cases written
- [ ] Output schema validated — consumer (next agent) confirmed it can parse the output
- [ ] Human-in-the-loop gate defined (even if it's "never" — document the decision)
- [ ] Cost per-run estimated and approved by PM
- [ ] Component-level eval written (see [`component-evaluation`](../evaluator/component-evaluation.md))

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v0.1.0 | YYYY-MM-DD | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course (DeepLearning.AI) and extended with production engineering patterns.*
*Template version: v1.0.0 — see [`_template/SKILL_TEMPLATE.md`](../../_template/SKILL_TEMPLATE.md)*
