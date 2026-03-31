# Skill: Task Decomposition

**Role:** Orchestrator
**Phase:** Design → Orchestration
**Autonomy Level:** Low → Semi
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Task Decomposition is the process of breaking a large, ambiguous goal into a sequence of discrete, independently executable blocks — each small enough that a single LLM call or tool invocation can complete it reliably. It is the most critical developer skill in agentic system design: not writing a better prompt, but knowing how to divide work so each piece is testable, attributable, and replaceable.

The pattern has four steps: **Decompose** (break the big task), **Evaluate** (decide LLM vs. tool per block), **Refine** (if quality is low, decompose further), **Sequence** (wire outputs to inputs). A system that skips decomposition will eventually fail on any task that exceeds a single LLM context window or requires branching logic — and that failure will be impossible to debug.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Decomposed tasks are independently debuggable. When a 10-step report pipeline fails, you can pin the failure to step 4 in under 5 minutes. Without decomposition, the same investigation takes hours.
- **Cost implication:** Monolithic "do everything in one prompt" calls are expensive and unreliable. Decomposition lets you route cheap tasks (keyword extraction, formatting) to smaller models (Haiku, Llama-3.1-8B) and expensive tasks (synthesis, reasoning) to frontier models — reducing per-task cost by 40–70% on mixed workflows.
- **Latency implication:** Decomposed steps can run in parallel when there are no dependencies. A research task that serially takes 30s can run in 12s when three independent search sub-tasks execute concurrently.
- **When to skip this:** Tasks with a single, fully deterministic output and zero branching (e.g., "translate this string to Bahasa Indonesia"). Decomposition adds overhead with no benefit when there is only one block.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A clear user intent or goal statement
- The registered toolbox (list of available tools with descriptions)
- An understanding of which model tiers are available (fast/cheap vs. capable/expensive)

**Workflow:**

1. **Identify the "big task"** — State the goal in one sentence. If it requires more than one sentence, it's already multiple tasks.
2. **List atomic blocks** — Write out every distinct action required. An action is atomic if: (a) it has one input and one output, (b) it can fail independently without cascading, (c) it can be tested in isolation with a fixed input.
3. **Classify each block: LLM or Tool?**
   - Use an **LLM** for: reasoning, summarisation, classification, generation, reflection
   - Use a **Tool** for: data retrieval, computation, external API calls, file I/O, code execution
   - Use a **smaller LLM** for: simple formatting, keyword extraction, entity recognition
4. **Identify dependencies** — Draw the dependency graph. Block B depends on Block A if it needs A's output. Blocks with no dependency on each other are parallelisable.
5. **Refine undersized blocks** — If a block still feels vague ("process the data"), decompose it further until every block has a named, verifiable output.
6. **Sequence into a plan** — Pass the decomposed block list to the [`planning-pattern`](./planning-pattern.md) to produce the executable JSON plan.

**Failure modes to watch:**
- `OversizedBlock` — Caused by: stopping decomposition too early ("summarise everything"). Fix: keep decomposing until each block fits in a single LLM call with room for context.
- `UndersizedBlock` — Caused by: over-decomposing into trivial one-liner steps that add orchestration overhead without value. Fix: merge steps that always execute together with no branching between them.
- `MisclassifiedBlock` — Caused by: routing a computation (e.g., "calculate the revenue delta") to an LLM instead of a code execution tool. Fix: any block involving math, exact counts, or data transformation should be a Tool, not an LLM call.
- `HiddenDependency` — Caused by: marking two blocks as parallel when one actually needs the other's output. Fix: explicitly trace every input source for each block before marking it independent.

**Integration touchpoints:**
- Feeds into: [`planning-pattern`](./planning-pattern.md) — decomposed blocks become plan steps
- Feeds into: [`multi-agent-coordination`](./multi-agent-coordination.md) — blocks may be assigned to specialised sub-agents
- Receives from: [`eval-driven-development`](../product-manager/eval-driven-development.md) — PM defines acceptance criteria per block
- Required by: [`reflection-pattern`](../evaluator/reflection-pattern.md) — reflection only works if each block's output is a bounded, evaluatable artifact

---

## ⚠️ Constraints & Guardrails

- **Context window:** A decomposed block should fit within 2,000 tokens input + 500 tokens output. If the block requires reading a 10-page document AND reasoning about it, split into: (a) extract relevant sections, (b) reason about extracted sections.
- **Cost ceiling:** Routing ALL blocks to frontier models eliminates the cost benefit. Document the model tier assignment per block type and get PM sign-off on the routing table.
- **Model requirement:** The decomposition step itself (analysing the task and producing blocks) should use a capable reasoning model. The execution of simple blocks can use smaller models.
- **Non-determinism:** Decomposition of the same task may produce different block structures across runs. For production systems, prefer **semi-autonomous** decomposition where the block structure is defined by an engineer and only the block execution is LLM-driven.
- **Human gate required:** Yes — for the initial decomposition of any new task type. An engineer should review the block structure before it goes into production. Automate only after 20+ successful runs of the same decomposition.

---

## 📦 Ready-to-Use Artifact: Task Decomposition System Prompt + Routing Table

*Use Option A to guide the LLM in producing a decomposition. Use Option B to enforce routing rules in your codebase.*

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Task Decomposer. Your single responsibility is:
Receive a user goal and break it into the minimum number of atomic, independently executable blocks.

You do NOT execute the blocks. You ONLY produce the decomposition.

## Definition of Atomic
A block is atomic if ALL of the following are true:
1. It has exactly one input and one output
2. It can fail without cascading to other blocks
3. It can be tested with a fixed input in under 30 seconds
4. It maps to exactly one of: LLM_CALL | TOOL_CALL | CODE_EXECUTION | HUMAN_REVIEW

## Your Process
1. State the goal in one sentence. If you cannot, the goal is ambiguous — ask for clarification.
2. List every action required to achieve the goal.
3. For each action: assign a type (LLM_CALL | TOOL_CALL | CODE_EXECUTION | HUMAN_REVIEW).
4. Identify dependencies: does any block need another block's output?
5. Assign parallel_group: blocks with no dependencies on each other share the same group number.
6. Output the decomposition.

## Output Format
Respond ONLY with a valid JSON array. No preamble. No markdown fences.

[
  {
    "block_id": "b1",
    "description": "Fetch the last 30 days of sales data from the database",
    "type": "TOOL_CALL",
    "tool_or_model": "query_database",
    "input_from": null,
    "output": "sales_records_array",
    "depends_on": [],
    "parallel_group": 1,
    "model_tier": null
  },
  {
    "block_id": "b2",
    "description": "Calculate total revenue and top 3 products from sales records",
    "type": "CODE_EXECUTION",
    "tool_or_model": "python_sandbox",
    "input_from": ["b1"],
    "output": "revenue_summary_json",
    "depends_on": ["b1"],
    "parallel_group": 2,
    "model_tier": null
  },
  {
    "block_id": "b3",
    "description": "Write a 3-sentence executive summary from the revenue summary",
    "type": "LLM_CALL",
    "tool_or_model": "claude-haiku",
    "input_from": ["b2"],
    "output": "executive_summary_text",
    "depends_on": ["b2"],
    "parallel_group": 3,
    "model_tier": "fast"
  }
]

## Hard Constraints
- NEVER create a block that combines two distinct action types
- NEVER assign math or data transformation to LLM_CALL — use CODE_EXECUTION
- NEVER exceed 8 blocks — if the task requires more, it must be split into sub-tasks first
- NEVER leave `depends_on` empty for a block that uses another block's output
- If the goal is too vague to decompose, return: [{"block_id": "clarify", "type": "HUMAN_REVIEW", "description": "Goal is ambiguous: [explain what is unclear]"}]
```

---

### Option B · JSON Schema (Block Routing Validation)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TaskDecomposition",
  "description": "Validated block structure produced by the Task Decomposer",
  "type": "array",
  "minItems": 1,
  "maxItems": 8,
  "items": {
    "type": "object",
    "required": ["block_id", "description", "type", "tool_or_model", "output", "depends_on", "parallel_group"],
    "properties": {
      "block_id": {
        "type": "string",
        "pattern": "^b[0-9]+$",
        "description": "Unique block identifier. Format: b1, b2, b3..."
      },
      "description": {
        "type": "string",
        "description": "One sentence: what this block does and what it produces."
      },
      "type": {
        "type": "string",
        "enum": ["LLM_CALL", "TOOL_CALL", "CODE_EXECUTION", "HUMAN_REVIEW"],
        "description": "Execution type. CODE_EXECUTION for all math and data ops. Never LLM_CALL for computation."
      },
      "tool_or_model": {
        "type": "string",
        "description": "For TOOL_CALL: exact registered tool name. For LLM_CALL: model identifier (e.g. claude-haiku, gpt-4o). For CODE_EXECUTION: sandbox name."
      },
      "input_from": {
        "type": ["array", "null"],
        "items": { "type": "string" },
        "description": "block_ids this block reads output from. null or [] if no dependency."
      },
      "output": {
        "type": "string",
        "description": "Named output artifact this block produces. Used by downstream blocks."
      },
      "depends_on": {
        "type": "array",
        "items": { "type": "string" },
        "description": "block_ids that must complete before this block can start."
      },
      "parallel_group": {
        "type": "integer",
        "minimum": 1,
        "description": "Blocks sharing the same integer run concurrently. Sequential groups increment by 1."
      },
      "model_tier": {
        "type": ["string", "null"],
        "enum": ["fast", "capable", "reasoning", null],
        "description": "For LLM_CALL blocks only. fast = small/cheap. capable = frontier. reasoning = thinking model."
      }
    }
  }
}
```

---

### Option C · Go Tool Registration (Tool Layer — MCP Server)

```go
// File: internal/tools/task_decomposer.go
// Validates a task decomposition and returns the execution order with parallel groups.
// Requires: modelcontextprotocol/go-sdk v1.2.0+

package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type DecompositionBlock struct {
	BlockID       string   `json:"block_id"       description:"Unique block ID. Format: b1, b2..."`
	Description   string   `json:"description"    description:"One sentence describing what this block does"`
	Type          string   `json:"type"           description:"LLM_CALL | TOOL_CALL | CODE_EXECUTION | HUMAN_REVIEW"`
	ToolOrModel   string   `json:"tool_or_model"  description:"Registered tool name or model identifier"`
	InputFrom     []string `json:"input_from"     description:"block_ids this block reads from"`
	Output        string   `json:"output"         description:"Named output artifact"`
	DependsOn     []string `json:"depends_on"     description:"block_ids that must complete first"`
	ParallelGroup int      `json:"parallel_group" description:"Blocks with same value run concurrently"`
	ModelTier     *string  `json:"model_tier"     description:"fast | capable | reasoning | null"`
}

type ValidateDecompositionParams struct {
	Blocks          []DecompositionBlock `json:"blocks"           description:"The decomposition produced by the Task Decomposer"`
	RegisteredTools []string             `json:"registered_tools" description:"Valid tool names in this session"`
}

type ValidationResult struct {
	Valid          bool     `json:"valid"`
	Errors         []string `json:"errors"`
	ExecutionOrder [][]string `json:"execution_order"` // Groups of block_ids that can run concurrently
}

func RegisterValidateDecompositionTool(server *mcp.Server) {
	server.AddTool(mcp.Tool{
		Name:        "validate_task_decomposition",
		Description: "Validates a task decomposition: checks block count ≤ 8, tool names exist, dependency graph has no cycles, and returns parallel execution groups.",
		InputSchema: mcp.MustGenerateSchema[ValidateDecompositionParams](),
	}, handleValidateDecomposition)
}

func handleValidateDecomposition(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var params ValidateDecompositionParams
	if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
	}

	result := ValidationResult{Valid: true}

	if len(params.Blocks) > 8 {
		result.Valid = false
		result.Errors = append(result.Errors, fmt.Sprintf("%d blocks exceeds maximum of 8", len(params.Blocks)))
	}

	registry := make(map[string]bool)
	for _, t := range params.RegisteredTools {
		registry[t] = true
	}

	blockIDs := make(map[string]bool)
	for _, b := range params.Blocks {
		blockIDs[b.BlockID] = true
	}

	for _, block := range params.Blocks {
		if block.Type == "TOOL_CALL" && !registry[block.ToolOrModel] {
			result.Valid = false
			result.Errors = append(result.Errors,
				fmt.Sprintf("block %s references unknown tool: %q", block.BlockID, block.ToolOrModel))
		}
		for _, dep := range block.DependsOn {
			if !blockIDs[dep] {
				result.Valid = false
				result.Errors = append(result.Errors,
					fmt.Sprintf("block %s depends on unknown block: %q", block.BlockID, dep))
			}
		}
	}

	// Build execution order from parallel groups
	groupMap := make(map[int][]string)
	for _, b := range params.Blocks {
		groupMap[b.ParallelGroup] = append(groupMap[b.ParallelGroup], b.BlockID)
	}
	groups := make([]int, 0, len(groupMap))
	for g := range groupMap {
		groups = append(groups, g)
	}
	sort.Ints(groups)
	for _, g := range groups {
		result.ExecutionOrder = append(result.ExecutionOrder, groupMap[g])
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
| [`planning-pattern`](./planning-pattern.md) | Orchestrator | Receives the decomposed blocks and produces the executable JSON plan |
| [`react-pattern`](../researcher/react-pattern.md) | Researcher | TOOL_CALL blocks may internally use a ReAct loop |
| [`code-execution-pattern`](../data-analyst/code-execution-pattern.md) | Data Analyst | CODE_EXECUTION blocks route to this skill |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Each block's output should be evaluated before being passed downstream |
| [`eval-driven-development`](../product-manager/eval-driven-development.md) | Product Manager | PM defines what "good output" looks like per block type |

---

## 📊 Evaluation Checklist

Before considering this skill "production-ready" in your system:

- [ ] Every block in production has been tested in isolation with ≥ 5 fixed inputs
- [ ] No block is classified as LLM_CALL for a task that involves math or exact data retrieval
- [ ] Dependency graph validated — no circular dependencies
- [ ] Parallel groups confirmed correct — no hidden dependencies between "parallel" blocks
- [ ] Model tier routing documented and cost estimate approved by PM
- [ ] Decomposition of 20+ real queries reviewed by an engineer before automation

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — Task Decomposition |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "The Critical Skill: Task Decomposition" and "The Workflow Developer's Mindset" sections.*
*Template version: v1.0.0 — see [`_template/SKILL_TEMPLATE.md`](../../_template/SKILL_TEMPLATE.md)*
