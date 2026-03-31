# Skill: ReAct Pattern (Reason + Act)

**Role:** Researcher
**Phase:** Execution
**Autonomy Level:** Semi → High
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

ReAct (Reason + Act) is the foundational iterative loop that powers every tool-using agent. In each cycle, the LLM follows a strict three-step rhythm: **Thought** (reason about what to do next), **Action** (request a specific tool call with exact arguments), **Observation** (receive the tool's real output and incorporate it). This loop repeats until the agent decides it has enough information to produce a final answer.

ReAct is what separates an LLM that "knows things" from an agent that "does things." Without this loop, the LLM is frozen at its training cutoff and limited to what it memorised. With ReAct, it can fetch live data, query databases, run code, and search the web — grounding every answer in real-world, up-to-date information rather than probabilistic recall.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Enables agents to answer questions that require current data (stock prices, live inventory, customer records) without a model retrain or fine-tune. The same base model becomes capable of answering yesterday's questions today.
- **Cost implication:** A targeted ReAct loop with 3 tool calls costs a fraction of a RAG pipeline that embeds and retrieves from a 100K-document corpus. Use ReAct for precision retrieval, RAG for broad knowledge lookup.
- **Latency implication:** Each Thought-Action-Observation cycle adds 1 LLM call + 1 tool call (~2–5s per cycle). Set `max_turns` based on your SLA. For user-facing flows: max 5 turns. For background research: max 15 turns.
- **When to skip this:** The answer is deterministic and fully available in the LLM's training data. ReAct adds latency and cost with no benefit when no tool call is actually needed.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A registered toolbox with at least one callable tool
- A system prompt that defines the Thought/Action/Observation format (see artifact)
- A `max_turns` hard limit in the execution loop
- A state object that carries the full conversation history across turns

**Workflow:**

1. **Initialise** — Load the system prompt with the available tools list. Pass the user query as the first user message.
2. **Thought** — The LLM outputs its reasoning: "I need to find X. I should use tool Y because Z."
3. **Action** — The LLM outputs a structured tool call request: tool name + arguments. Modern models output this as native JSON function calls — not text parsing.
4. **Execute** — Your application code intercepts the tool call request, runs the actual function, and captures the result. The LLM never executes code directly.
5. **Observation** — The tool result is added to the conversation as a `tool_result` message and sent back to the LLM.
6. **Loop** — The LLM reads the Observation and either: (a) calls another tool if more information is needed, or (b) outputs a `FINAL_ANSWER` signalling the loop should terminate.
7. **Hard stop** — If `max_turns` is reached without a `FINAL_ANSWER`, terminate and return the best available answer with `confidence: low`.

**Failure modes to watch:**
- `ToolHallucination` — Caused by: LLM calling a tool that doesn't exist or with wrong argument names. Fix: provide the exact tool schema (name, description, parameters with types) in the system prompt. Validate every tool call against the registry before execution.
- `ObservationIgnored` — Caused by: not passing the tool result back into the conversation history. Fix: the Observation must be a first-class message in the conversation — not appended as a footnote to the next user message.
- `InfiniteLoop` — Caused by: no `max_turns` guard, or a tool that always returns an error the LLM keeps retrying. Fix: hard limit + exponential backoff on tool errors (max 2 retries per tool per turn).
- `ShallowReasoning` — Caused by: asking a weak model to reason about complex multi-hop queries. Fix: use a capable reasoning model for the Thought step on complex research tasks.
- `ContextExplosion` — Caused by: each Observation adding 2,000+ tokens (e.g., full web page HTML). Fix: tool outputs should return summaries or extracted fields, never raw payloads.

**Integration touchpoints:**
- Feeds into: [`rag-skill`](./rag-skill.md) — when the Researcher needs to search a private knowledge base instead of the open web
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — the FINAL_ANSWER should pass through the Evaluator
- Receives from: [`planning-pattern`](../orchestrator/planning-pattern.md) — individual TOOL_CALL blocks in a plan execute via this loop
- Required by: [`web-search-integration`](./web-search-integration.md) — web search is a tool within a ReAct loop

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each Thought-Action-Observation cycle adds ~500–2,000 tokens depending on tool output size. A 10-turn loop with verbose tool responses can consume 20,000+ tokens. Keep tool outputs lean — extract only what the LLM needs, never dump raw payloads.
- **Cost ceiling:** 5 ReAct turns on GPT-4o ≈ $0.02–0.05 per query. 15 turns ≈ $0.10–0.15. Set `max_turns` based on acceptable cost per query, not just quality.
- **Model requirement:** Requires a model with native function-calling / tool-use support. Do not attempt to emulate tool calls via prompt engineering ("output CALL_TOOL in all caps") — this is the "old way" and produces unreliable results in production.
- **Non-determinism:** The same query may take different tool-call paths across runs. This is expected. What matters is that the final answer is correct, not that the path was identical.
- **Human gate required:** Yes — for any tool with `side_effects: true` (writes, deletes, sends). The ReAct loop must pause and request human approval before executing side-effect tools.

---

## 📦 Ready-to-Use Artifact: ReAct Researcher System Prompt

*Paste into your Researcher agent's system prompt. The tool list is injected at runtime.*

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Researcher in a multi-agent system. Your single responsibility is:
Answer a specific question by using the available tools to gather real, current information.

You NEVER answer from memory alone when a tool can verify or update your knowledge.
You ALWAYS reason before calling a tool.

## Available Tools
{{TOOL_LIST}}
Each tool entry includes: name, description, and required parameters.

## Your Loop
For every question, follow this exact loop until you have a complete answer:

**Thought:** [Reason about what you know, what you need, and which tool to call next. Be specific.]
**Action:** [Call exactly one tool with valid arguments.]
**Observation:** [You will receive the tool result here. Read it carefully.]
... repeat Thought/Action/Observation as needed ...
**FINAL_ANSWER:** [Your complete, grounded answer. Cite which tool calls produced the key facts.]

## Rules for Tool Calls
- Call ONE tool per turn. Do not request multiple tools simultaneously.
- Use the exact tool name and parameter names from the tool list.
- If a tool returns an error, retry ONCE with corrected arguments. If it fails again, note it and try an alternative tool.
- NEVER fabricate a tool result. If no tool provides the answer, say so explicitly.

## Rules for the Final Answer
- Only output FINAL_ANSWER when you have enough information to answer completely.
- Cite your sources: "According to [tool_name] called with [key_argument]..."
- If the answer is uncertain after all tool calls, state the uncertainty explicitly — do not guess.
- If `max_turns` is reached before a complete answer, output the best available answer prefixed with: "INCOMPLETE (max turns reached):"

## Hard Constraints
- NEVER call a tool with side_effects without explicit human approval in the conversation
- NEVER include tool call syntax in FINAL_ANSWER — only in Action steps
- NEVER truncate Observations — read the full tool result before reasoning
- Maximum turns: {{MAX_TURNS}} (set by the orchestrator at runtime)
```

---

### Option B · JSON Schema (ReAct Turn State)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ReActTurnState",
  "description": "The state object passed to the LLM at each turn of the ReAct loop",
  "type": "object",
  "required": ["session_id", "turn", "max_turns", "query", "history", "available_tools"],
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Unique session identifier for this ReAct loop"
    },
    "turn": {
      "type": "integer",
      "minimum": 1,
      "description": "Current turn number. Increments after each Observation."
    },
    "max_turns": {
      "type": "integer",
      "default": 5,
      "description": "Hard limit. When turn > max_turns, terminate and return best available answer."
    },
    "query": {
      "type": "string",
      "description": "The original user question. Never modified across turns."
    },
    "history": {
      "type": "array",
      "description": "Full conversation history: all Thoughts, Actions, and Observations in order.",
      "items": {
        "type": "object",
        "required": ["role", "content"],
        "properties": {
          "role": {
            "type": "string",
            "enum": ["system", "user", "assistant", "tool"],
            "description": "system = setup, user = query, assistant = Thought+Action, tool = Observation"
          },
          "content": { "type": "string" },
          "tool_call_id": {
            "type": ["string", "null"],
            "description": "For tool role messages: the ID linking this Observation to its Action."
          }
        }
      }
    },
    "available_tools": {
      "type": "array",
      "description": "Tools available in this session. Injected into system prompt at runtime.",
      "items": {
        "type": "object",
        "required": ["name", "description", "parameters", "side_effects"],
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" },
          "parameters": { "type": "object" },
          "side_effects": {
            "type": "boolean",
            "description": "true = this tool writes, sends, or deletes. Requires human approval before execution."
          }
        }
      }
    },
    "status": {
      "type": "string",
      "enum": ["in_progress", "final_answer", "max_turns_reached", "error"],
      "description": "Current loop status."
    }
  }
}
```

---

### Option C · Go Tool Registration (Tool Layer — MCP Server)

```go
// File: internal/tools/react_executor.go
// Manages one turn of a ReAct loop: validates the tool call, executes it,
// and returns the Observation to be appended to conversation history.
// Requires: modelcontextprotocol/go-sdk v1.2.0+

package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// ReActTurnParams represents one Action step in the ReAct loop.
type ReActTurnParams struct {
	SessionID   string         `json:"session_id"    description:"Unique identifier for this ReAct session"`
	Turn        int            `json:"turn"          description:"Current turn number (1-indexed)"`
	MaxTurns    int            `json:"max_turns"     description:"Hard limit on turns. Terminate if turn > max_turns."`
	ToolName    string         `json:"tool_name"     description:"Exact name of the tool to execute"`
	ToolArgs    map[string]any `json:"tool_args"     description:"Arguments for the tool, matching its parameter schema"`
	SideEffects bool           `json:"side_effects"  description:"true = this tool modifies external state. Requires human_approved=true."`
	HumanApproved bool         `json:"human_approved" description:"Must be true before executing any tool with side_effects=true"`
}

// ReActObservation is the Observation returned to the conversation history.
type ReActObservation struct {
	SessionID   string `json:"session_id"`
	Turn        int    `json:"turn"`
	ToolName    string `json:"tool_name"`
	Success     bool   `json:"success"`
	Result      string `json:"result"`      // Lean summary — not raw payload
	ErrorMsg    string `json:"error_msg"`   // Populated on failure
	ShouldRetry bool   `json:"should_retry"` // true if a retry with corrected args may succeed
}

// RegisterReActExecutorTool registers the ReAct turn executor with the MCP server.
func RegisterReActExecutorTool(server *mcp.Server, toolRegistry map[string]func(context.Context, map[string]any) (string, error)) {
	server.AddTool(mcp.Tool{
		Name:        "react_execute_turn",
		Description: "Executes one Action step in a ReAct loop. Validates tool existence, checks side-effect approval, calls the tool, and returns a lean Observation.",
		InputSchema: mcp.MustGenerateSchema[ReActTurnParams](),
	}, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return handleReActTurn(ctx, req, toolRegistry)
	})
}

func handleReActTurn(ctx context.Context, req mcp.CallToolRequest, registry map[string]func(context.Context, map[string]any) (string, error)) (*mcp.CallToolResult, error) {
	var params ReActTurnParams
	if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
	}

	obs := ReActObservation{
		SessionID: params.SessionID,
		Turn:      params.Turn,
		ToolName:  params.ToolName,
	}

	// Guard: max turns
	if params.Turn > params.MaxTurns {
		obs.Success = false
		obs.ErrorMsg = fmt.Sprintf("max_turns (%d) exceeded — terminate loop", params.MaxTurns)
		obs.ShouldRetry = false
		return marshalObservation(obs)
	}

	// Guard: side effects require human approval
	if params.SideEffects && !params.HumanApproved {
		obs.Success = false
		obs.ErrorMsg = "tool has side_effects=true but human_approved=false — request human approval before proceeding"
		obs.ShouldRetry = false
		return marshalObservation(obs)
	}

	// Guard: tool must exist in registry
	toolFn, exists := registry[params.ToolName]
	if !exists {
		obs.Success = false
		obs.ErrorMsg = fmt.Sprintf("unknown tool: %q — check available_tools list", params.ToolName)
		obs.ShouldRetry = true
		return marshalObservation(obs)
	}

	// Execute the tool
	result, err := toolFn(ctx, params.ToolArgs)
	if err != nil {
		obs.Success = false
		obs.ErrorMsg = err.Error()
		obs.ShouldRetry = true
		return marshalObservation(obs)
	}

	obs.Success = true
	obs.Result = result
	return marshalObservation(obs)
}

func marshalObservation(obs ReActObservation) (*mcp.CallToolResult, error) {
	output, err := json.Marshal(obs)
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
| [`rag-skill`](./rag-skill.md) | Researcher | A RAG lookup is a tool within a ReAct loop for private knowledge bases |
| [`web-search-integration`](./web-search-integration.md) | Researcher | Web search is the most common tool invoked in a ReAct loop |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | FINAL_ANSWER passes through reflection before reaching the user |
| [`planning-pattern`](../orchestrator/planning-pattern.md) | Orchestrator | TOOL_CALL blocks in a plan are executed via this loop |
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Any CODE_EXECUTION tool in the loop must be sandboxed |

---

## 📊 Evaluation Checklist

Before considering this skill "production-ready" in your system:

- [ ] `max_turns` hard limit verified — loop cannot run indefinitely
- [ ] Tool registry validation tested — hallucinated tool names rejected 100% of the time
- [ ] Observation history correctly passed across all turns — no truncation
- [ ] Side-effect tools blocked without explicit human approval
- [ ] Tool output size validated — no raw payloads > 2,000 tokens passed as Observations
- [ ] Retry logic tested — max 2 retries per tool per turn, then escalate
- [ ] Component-level eval: 20 queries with known correct tool-call paths, measure path accuracy

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — ReAct Pattern |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "ReAct (Reason + Act)" and "How Tool Use Works" sections.*
*Template version: v1.0.0 — see [`_template/SKILL_TEMPLATE.md`](../../_template/SKILL_TEMPLATE.md)*
