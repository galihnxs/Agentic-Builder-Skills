# Skill: Tool Orchestration

**Role:** AI Architect
**Phase:** Integration
**Autonomy Level:** Low (infrastructure pattern)
**Layer:** Tool Layer (Go MCP)

---

## 📖 What is it?

Tool Orchestration is the "glue" that prevents agentic systems from becoming fragmented, unmanageable codebases. It is the layer between the LLM's intent and the tools that act on the world — responsible for dispatching tool calls, managing execution order (sequential vs parallel), propagating results between steps, and enforcing cost and turn limits.

Without explicit orchestration, every agent developer re-implements the same dispatch logic ad hoc: a brittle switch statement, no parallel execution, no cost tracking, no retry logic. Tool Orchestration makes this infrastructure explicit, reusable, and observable.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Proper orchestration is what makes a system debuggable at 3am. When an agent fails, you need to know which tool call failed, what input it received, and what it returned — not just that the final answer was wrong.
- **Cost implication:** Orchestration platforms include budget/cost monitoring as a core feature. Without it, over-automation leads to unexpected API costs. A single misconfigured `max_turns=100` loop can generate thousands of dollars in LLM calls overnight.
- **Latency implication:** Parallel execution of independent tool calls — identified by the [`task-decomposition`](../orchestrator/task-decomposition.md) pattern — can reduce total pipeline latency by 50–70% on multi-source research tasks.
- **When to skip this:** A single-tool, single-turn agent (e.g., "call this one API and return the result"). Orchestration overhead is unjustified when there is no sequencing, no parallelism, and no retry logic needed.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A validated execution plan from [`planning-pattern`](../orchestrator/planning-pattern.md) or block list from [`task-decomposition`](../orchestrator/task-decomposition.md)
- A registered tool registry mapping tool names to handler functions
- A budget limit (max tokens, max cost, max turns) set by the PM

**Workflow:**

1. **Receive plan** — The orchestrator receives the validated JSON plan (array of steps with `tool_name`, `args`, `side_effects`, `parallel_group`).
2. **Group by parallel_group** — Steps sharing the same `parallel_group` integer are candidates for concurrent execution. Steps with different groups execute sequentially.
3. **Execute group** — For each parallel group: dispatch all tool calls in the group concurrently (goroutines). Wait for all to complete before advancing to the next group.
4. **Propagate results** — Each step's output is stored in the shared state object keyed by `step_number`. Downstream steps that reference earlier outputs read from this state.
5. **Enforce limits** — After each group: check total tokens consumed, total cost, and turn count against configured limits. If any limit is exceeded, halt execution and return the partial result with a `budget_exceeded` flag.
6. **Handle retries** — If a tool call fails, retry once with the original args. If it fails again, mark the step as `failed` and continue execution of non-dependent steps. Dependent steps are skipped and marked `skipped_due_to_dependency_failure`.
7. **Return summary** — After all groups complete (or halt), return the full execution trace to the caller.

**Failure modes to watch:**
- `SilentToolFailure` — Caused by: swallowing tool errors and passing empty results to downstream steps. Fix: every tool error must be explicit in the execution trace — never substitute an empty string for a failed result.
- `UnboundedParallelism` — Caused by: launching too many goroutines simultaneously on resource-constrained infrastructure. Fix: enforce a `max_concurrent_tools` limit (recommended: 5).
- `BudgetBlindness` — Caused by: no cost tracking per tool call. Fix: every tool call logs its token consumption and API cost to the execution trace. Budget checks happen after each group.
- `StatePollution` — Caused by: parallel steps writing to the same state key. Fix: state keys are namespaced by `step_number` — parallel steps can never share a key.

**Integration touchpoints:**
- Receives from: [`planning-pattern`](../orchestrator/planning-pattern.md) — the validated execution plan
- Feeds into: [`state-observability`](./state-observability.md) — every tool dispatch and result is a traceable event
- Required by: [`react-pattern`](../researcher/react-pattern.md) — the ReAct loop is a specialised single-skill orchestration
- Required by: [`multi-agent-coordination`](../orchestrator/multi-agent-coordination.md) — sub-agent invocations are tools in the orchestration graph

---

## ⚠️ Constraints & Guardrails

- **Context window:** The execution trace grows with every step. Do not pass the full trace to every tool — pass only the specific step's input and the outputs it depends on.
- **Cost ceiling:** Set hard budget limits per orchestration run: `max_tokens`, `max_usd_cost`, `max_turns`. Treat `max_turns` as the last-resort guard when cost limits fail to trigger.
- **Model requirement:** The orchestration layer itself is pure Go — no LLM calls. Only the tool handlers and plan generator use LLMs.
- **Non-determinism:** Parallel tool execution order is non-deterministic. Never write logic that assumes parallel steps complete in a specific order. Results are keyed by step number, not arrival time.
- **Human gate required:** Yes — before executing any step with `side_effects: true`. The orchestrator must pause, surface the pending action to the user, and wait for explicit approval before proceeding.

---

## 📦 Ready-to-Use Artifact: Tool Orchestrator (Go)

### Option C · Go Orchestrator (Tool Layer)

```go
// File: internal/orchestrator/executor.go
// Executes a validated plan: sequential groups, parallel dispatch within groups,
// budget enforcement, and retry logic.

package orchestrator

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type ToolHandler func(ctx context.Context, args map[string]any) (string, error)

type PlanStep struct {
	StepNumber    int            `json:"step_number"`
	ToolName      string         `json:"tool_name"`
	Args          map[string]any `json:"args"`
	SideEffects   bool           `json:"side_effects"`
	ParallelGroup int            `json:"parallel_group"`
}

type StepResult struct {
	StepNumber int
	ToolName   string
	Output     string
	Error      error
	DurationMs int64
	Skipped    bool
	SkipReason string
}

type ExecutionConfig struct {
	MaxConcurrentTools int
	MaxTurns           int
	TimeoutPerTool     time.Duration
	// HumanApprovalFn is called before any side-effect step.
	// Return true to approve, false to block.
	HumanApprovalFn func(step PlanStep) bool
}

func DefaultConfig() ExecutionConfig {
	return ExecutionConfig{
		MaxConcurrentTools: 5,
		MaxTurns:           10,
		TimeoutPerTool:     30 * time.Second,
		HumanApprovalFn:    func(step PlanStep) bool { return false }, // Block all by default
	}
}

type Executor struct {
	registry map[string]ToolHandler
	cfg      ExecutionConfig
}

func NewExecutor(registry map[string]ToolHandler, cfg ExecutionConfig) *Executor {
	return &Executor{registry: registry, cfg: cfg}
}

// Execute runs the full plan and returns an ordered list of step results.
func (e *Executor) Execute(ctx context.Context, plan []PlanStep) ([]StepResult, error) {
	results := make([]StepResult, 0, len(plan))
	state := make(map[int]StepResult) // keyed by step_number
	failedSteps := make(map[int]bool)

	// Group steps by parallel_group
	groups := groupByParallel(plan)

	totalTurns := 0
	for _, group := range groups {
		if totalTurns >= e.cfg.MaxTurns {
			break
		}

		groupResults := e.executeGroup(ctx, group, state, failedSteps)
		for _, r := range groupResults {
			results = append(results, r)
			state[r.StepNumber] = r
			if r.Error != nil {
				failedSteps[r.StepNumber] = true
			}
		}
		totalTurns++
	}

	return results, nil
}

func (e *Executor) executeGroup(ctx context.Context, steps []PlanStep, state map[int]StepResult, failedSteps map[int]bool) []StepResult {
	sem := make(chan struct{}, e.cfg.MaxConcurrentTools)
	var wg sync.WaitGroup
	mu := sync.Mutex{}
	results := make([]StepResult, 0, len(steps))

	for _, step := range steps {
		step := step

		// Check if any dependency failed
		dependencyFailed := false
		// (In production, map step dependencies explicitly. Here we use failedSteps as a proxy.)
		if failedSteps[step.StepNumber-1] { // simplified: previous step failed
			dependencyFailed = true
		}

		if dependencyFailed {
			r := StepResult{
				StepNumber: step.StepNumber,
				ToolName:   step.ToolName,
				Skipped:    true,
				SkipReason: "dependency_failure",
			}
			mu.Lock()
			results = append(results, r)
			mu.Unlock()
			continue
		}

		// Side-effect gate
		if step.SideEffects {
			if e.cfg.HumanApprovalFn == nil || !e.cfg.HumanApprovalFn(step) {
				r := StepResult{
					StepNumber: step.StepNumber,
					ToolName:   step.ToolName,
					Skipped:    true,
					SkipReason: "side_effect_not_approved",
				}
				mu.Lock()
				results = append(results, r)
				mu.Unlock()
				continue
			}
		}

		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			r := e.executeSingleStep(ctx, step)
			mu.Lock()
			results = append(results, r)
			mu.Unlock()
		}()
	}

	wg.Wait()
	return results
}

func (e *Executor) executeSingleStep(ctx context.Context, step PlanStep) StepResult {
	handler, ok := e.registry[step.ToolName]
	if !ok {
		return StepResult{
			StepNumber: step.StepNumber,
			ToolName:   step.ToolName,
			Error:      fmt.Errorf("unknown tool: %q", step.ToolName),
		}
	}

	toolCtx, cancel := context.WithTimeout(ctx, e.cfg.TimeoutPerTool)
	defer cancel()

	start := time.Now()
	output, err := handler(toolCtx, step.Args)

	// Retry once on failure
	if err != nil {
		output, err = handler(toolCtx, step.Args)
	}

	return StepResult{
		StepNumber: step.StepNumber,
		ToolName:   step.ToolName,
		Output:     output,
		Error:      err,
		DurationMs: time.Since(start).Milliseconds(),
	}
}

func groupByParallel(plan []PlanStep) [][]PlanStep {
	groupMap := make(map[int][]PlanStep)
	order := []int{}
	seen := make(map[int]bool)
	for _, step := range plan {
		if !seen[step.ParallelGroup] {
			order = append(order, step.ParallelGroup)
			seen[step.ParallelGroup] = true
		}
		groupMap[step.ParallelGroup] = append(groupMap[step.ParallelGroup], step)
	}
	groups := make([][]PlanStep, 0, len(order))
	for _, g := range order {
		groups = append(groups, groupMap[g])
	}
	return groups
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`planning-pattern`](../orchestrator/planning-pattern.md) | Orchestrator | Provides the validated plan this skill executes |
| [`state-observability`](./state-observability.md) | Architect | Every dispatch and result is logged as a traceable span |
| [`task-decomposition`](../orchestrator/task-decomposition.md) | Orchestrator | Decomposition produces the parallel group structure this executor relies on |
| [`human-in-the-loop`](../compliance/human-in-the-loop.md) | Compliance | Side-effect approval gate is implemented via HITL |

---

## 📊 Evaluation Checklist

- [ ] Parallel execution tested with 5 concurrent tool calls — no race conditions
- [ ] Side-effect gate verified — no `side_effects: true` step executes without approval
- [ ] `max_turns` hard limit verified — executor stops after N groups regardless
- [ ] Retry logic tested — tool failure triggers exactly one retry, then marks step failed
- [ ] Dependency failure propagation tested — downstream steps skip correctly
- [ ] Budget logging implemented — token count and cost tracked per step

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Tool Orchestration Best Practices" section.*
*Template version: v1.0.0*
