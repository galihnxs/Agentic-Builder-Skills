# Skill: JSON & XML Structured Output

**Role:** Orchestrator
**Phase:** Orchestration
**Autonomy Level:** Low → Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Structured output enforcement is the practice of constraining an LLM's response to a machine-readable format — JSON or XML — so that downstream code can parse and act on it without brittle text extraction. When an agent says "I'll check the price," the calling code has no idea whether that maps to `get_price(item="sunglasses")` or `lookup_cost(id=123)`. A structured output contract eliminates this ambiguity by creating a typed, predictable interface between the LLM's reasoning and the system's execution layer.

This skill is not just a formatting preference — it is the foundation of reliable multi-agent communication. Every hand-off between agents in a pipeline depends on a producer outputting a schema the consumer can parse. Without enforcement, one model update or prompt change silently breaks the entire downstream chain.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A pipeline where every agent hand-off is schema-validated eliminates an entire class of silent failures — the kind where the system "runs" but produces wrong answers because an upstream agent changed its output format.
- **Cost implication:** Parsing failures that require full pipeline restarts cost 3–10× the original call cost. Schema validation catches these at the boundary, not after 5 downstream LLM calls have consumed tokens.
- **Latency implication:** Native JSON mode (supported by GPT-4o, Claude, Gemini) adds zero latency. Schema validation via code adds <1ms. The ROI is asymmetric.
- **When to skip this:** Free-form creative output where the consumer is a human, not code (e.g., a blog post, a support reply). Structured output adds no value when there is no machine consumer.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A JSON schema defining the expected output structure (see artifact)
- A system prompt that instructs the LLM to output only JSON, with no prose before or after
- A parser in your application code that validates the LLM output against the schema before passing it downstream

**Workflow:**

1. **Define the contract** — Write the JSON schema for the output this agent must produce. Every field needs a type, description, and — where possible — an enum of valid values.
2. **Inject schema into system prompt** — Include the schema (or a simplified version) in the system prompt. Tell the LLM: "Respond ONLY with JSON matching this structure."
3. **Use native JSON mode** — If your model provider supports it (GPT-4o: `response_format: {type: "json_object"}`, Gemini: `response_mime_type: "application/json"`), enable it. This is more reliable than prompt engineering alone.
4. **Parse and validate** — After the LLM responds, parse the JSON string and validate it against the schema. Reject and re-request on validation failure (max 2 retries).
5. **Strip defensive patterns** — Pre-process the raw LLM response to remove accidental markdown fences (` ```json `) before parsing. Models occasionally add these despite instructions.
6. **Pass the typed object** — Never pass the raw JSON string to the next agent. Deserialise it into a typed struct first. The next agent receives a structured object, not a string.

**Failure modes to watch:**
- `MarkdownWrapped` — Caused by: LLM adding ` ```json ``` ` fences despite instructions. Fix: regex strip before parsing. Add "Do not wrap in markdown code blocks" to the system prompt.
- `ExtraFields` — Caused by: LLM adding fields not in the schema. Fix: use `additionalProperties: false` in JSON schema. Strict validation rejects these.
- `MissingRequired` — Caused by: LLM omitting required fields on edge-case inputs. Fix: include explicit examples of edge cases in the system prompt few-shot examples.
- `TypeMismatch` — Caused by: LLM returning `"true"` (string) instead of `true` (boolean). Fix: validate types strictly. Coerce only where safe, reject where not.
- `NestedHallucination` — Caused by: LLM inventing nested object keys not in the schema. Fix: keep schemas shallow (max 3 levels of nesting). Deep schemas increase hallucination rate.

**Integration touchpoints:**
- Required by: [`planning-pattern`](./planning-pattern.md) — plans MUST be structured JSON
- Required by: [`task-decomposition`](./task-decomposition.md) — decomposition blocks are JSON objects
- Required by: [`multi-agent-coordination`](./multi-agent-coordination.md) — all agent-to-agent messages use this contract
- Feeds into: [`component-evaluation`](../evaluator/component-evaluation.md) — schema adherence is the first eval check

---

## ⚠️ Constraints & Guardrails

- **Context window:** Including a large JSON schema in every system prompt adds 300–800 tokens per call. For complex schemas, include only the required fields and descriptions, not the full JSON Schema specification syntax.
- **Cost ceiling:** Schema validation retries add cost. Cap at 2 retries. If the third attempt fails, log the raw output and route to human review — do not silently discard.
- **Model requirement:** All frontier models (GPT-4o, Claude 3.5+, Gemini 1.5+) support reliable JSON output. Smaller models (7B–13B) struggle with complex nested schemas. Keep schemas flat for smaller models.
- **Non-determinism:** The same input may produce slightly different JSON structures (different field ordering, optional fields present/absent). Build consumers that handle both cases — do not rely on field order.
- **Human gate required:** No — schema validation is fully automated. Human review is triggered only on repeated validation failures (> 2 retries).

---

## 📦 Ready-to-Use Artifact: Structured Output Enforcement

### Option A · System Prompt Pattern (Skill Layer)

```markdown
## Output Contract
You MUST respond with valid JSON that exactly matches the schema below.

Rules:
- No text before the JSON object
- No text after the JSON object
- No markdown code fences (no ```json)
- All required fields must be present
- Use null for optional fields you cannot determine — never omit them
- String values must not contain unescaped newlines — use \n

Schema:
{
  "status": "success | failure | needs_human_review",
  "result": "<your primary output as a string>",
  "confidence": "high | medium | low",
  "reason": "<one sentence: why you produced this result>",
  "next_action": "<what the orchestrator should do next>",
  "metadata": {
    "tokens_used_estimate": <integer>,
    "sources_consulted": ["<source1>", "<source2>"]
  }
}

Example of a valid response:
{"status":"success","result":"The Q3 revenue was IDR 4.2B, up 18% YoY.","confidence":"high","reason":"Data sourced directly from the database query result.","next_action":"pass_to_creator","metadata":{"tokens_used_estimate":340,"sources_consulted":["query_database"]}}

Example of an INVALID response (do not do this):
Here is the analysis:
```json
{"status": "success" ...}
```
```

---

### Option B · JSON Schema (Output Validation)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentOutput",
  "description": "Standard output contract for all agents in the pipeline. Every agent must conform to this schema.",
  "type": "object",
  "additionalProperties": false,
  "required": ["status", "result", "confidence", "reason", "next_action"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success", "failure", "needs_human_review"],
      "description": "success = task completed. failure = task could not be completed. needs_human_review = uncertain output."
    },
    "result": {
      "type": "string",
      "description": "The primary output of this agent. For structured data, JSON-encode it as a string."
    },
    "confidence": {
      "type": "string",
      "enum": ["high", "medium", "low"],
      "description": "high = grounded in tool outputs or verified data. medium = partially grounded. low = inferred."
    },
    "reason": {
      "type": "string",
      "maxLength": 200,
      "description": "One sentence explaining why this result was produced. Used for tracing and debugging."
    },
    "next_action": {
      "type": "string",
      "description": "Instruction to the Orchestrator. Use registered action names: pass_to_creator | pass_to_evaluator | request_human_approval | terminate | retry"
    },
    "metadata": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "tokens_used_estimate": {
          "type": ["integer", "null"],
          "description": "Rough token count for this call. Used for cost tracking."
        },
        "sources_consulted": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tool names or data sources used to produce the result."
        }
      }
    }
  }
}
```

---

### Option C · Go Parser + Validator (Tool Layer)

```go
// File: internal/parser/agent_output.go
// Parses and validates LLM JSON output against the AgentOutput schema.
// Call this after every LLM response before passing the result downstream.

package parser

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

type AgentOutput struct {
	Status     string       `json:"status"`
	Result     string       `json:"result"`
	Confidence string       `json:"confidence"`
	Reason     string       `json:"reason"`
	NextAction string       `json:"next_action"`
	Metadata   *OutputMeta  `json:"metadata,omitempty"`
}

type OutputMeta struct {
	TokensUsedEstimate *int     `json:"tokens_used_estimate,omitempty"`
	SourcesConsulted   []string `json:"sources_consulted,omitempty"`
}

var (
	validStatuses    = map[string]bool{"success": true, "failure": true, "needs_human_review": true}
	validConfidences = map[string]bool{"high": true, "medium": true, "low": true}
	validNextActions = map[string]bool{
		"pass_to_creator": true, "pass_to_evaluator": true,
		"request_human_approval": true, "terminate": true, "retry": true,
	}
	mdFencePattern = regexp.MustCompile("(?s)```(?:json)?\\s*(\\{.*?\\})\\s*```")
)

// ParseAgentOutput strips markdown fences, parses JSON, and validates the schema.
// Returns the typed AgentOutput and a validation error if the schema is violated.
func ParseAgentOutput(raw string) (*AgentOutput, error) {
	cleaned := stripMarkdownFences(strings.TrimSpace(raw))

	var output AgentOutput
	if err := json.Unmarshal([]byte(cleaned), &output); err != nil {
		return nil, fmt.Errorf("JSON parse error: %w — raw: %.200s", err, cleaned)
	}

	if err := validateAgentOutput(&output); err != nil {
		return nil, err
	}

	return &output, nil
}

func validateAgentOutput(o *AgentOutput) error {
	if !validStatuses[o.Status] {
		return fmt.Errorf("invalid status %q: must be success | failure | needs_human_review", o.Status)
	}
	if o.Result == "" {
		return fmt.Errorf("result field is required and must be non-empty")
	}
	if !validConfidences[o.Confidence] {
		return fmt.Errorf("invalid confidence %q: must be high | medium | low", o.Confidence)
	}
	if o.Reason == "" {
		return fmt.Errorf("reason field is required")
	}
	if len(o.Reason) > 200 {
		return fmt.Errorf("reason exceeds 200 character limit (%d chars)", len(o.Reason))
	}
	if !validNextActions[o.NextAction] {
		return fmt.Errorf("invalid next_action %q: must be one of the registered action names", o.NextAction)
	}
	return nil
}

func stripMarkdownFences(s string) string {
	if matches := mdFencePattern.FindStringSubmatch(s); len(matches) > 1 {
		return matches[1]
	}
	// Try stripping plain ``` without json label
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`planning-pattern`](./planning-pattern.md) | Orchestrator | Plans are structured JSON — this skill enforces the contract |
| [`task-decomposition`](./task-decomposition.md) | Orchestrator | Decomposition blocks are typed JSON objects |
| [`multi-agent-coordination`](./multi-agent-coordination.md) | Orchestrator | All inter-agent messages use the AgentOutput schema |
| [`component-evaluation`](../evaluator/component-evaluation.md) | Evaluator | Schema adherence is the first automated check in component evals |

---

## 📊 Evaluation Checklist

- [ ] Parser rejects markdown-fenced JSON and retries correctly
- [ ] `additionalProperties: false` enforced — extra fields blocked
- [ ] All enum values validated — invalid values rejected, not silently accepted
- [ ] Retry logic capped at 2 — no infinite validation loops
- [ ] Parser tested with adversarial inputs: empty string, null, plain text, nested code blocks

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "Why Structure Matters: JSON & XML" section.*
*Template version: v1.0.0*
