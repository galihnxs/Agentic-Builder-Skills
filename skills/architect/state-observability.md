# Skill: State & Observability

**Role:** AI Architect
**Phase:** Integration → Post-Mortem
**Autonomy Level:** Low (infrastructure pattern)
**Layer:** Tool Layer (Go MCP)

---

## 📖 What is it?

State & Observability is the infrastructure pattern that transforms an agentic system from a black box into a transparent, debuggable execution graph. It covers two things: **State Management** (how shared context is stored and passed between agents and tools across a session) and **Tracing** (how every LLM call, tool invocation, and routing decision is recorded as a structured span for inspection and debugging).

Production-grade agentic systems require explicit state management, replayable executions, and robust logging. If you cannot track why a specific tool was called with specific arguments, you cannot debug failures. If state is implicit (passed via conversation history alone), you cannot replay a failed run with a fix applied to step 3 without rerunning steps 1 and 2.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Without observability, error analysis is guesswork. With it, when a report pipeline fails, you can open the trace, see that the SQL generation step produced an invalid query, and fix that exact component — without touching the rest of the pipeline.
- **Cost implication:** Observability reveals that the "obvious culprit" is rarely the real problem. In invoice processing case studies, LLM extraction failures (75% of errors) were misattributed to OCR — teams wasted weeks tuning OCR when the fix was a 5-line prompt change. Tracing prevents this "optimization trap."
- **Latency implication:** Tracing adds <1ms overhead per span when using async logging. Synchronous tracing to a remote service adds ~5–20ms per span — use async emit for production.
- **When to skip this:** Single-step, single-tool, stateless agents. If there is one LLM call and one tool call and no session state, a simple log line is sufficient. Build observability in from day one for any multi-step pipeline.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A state store (in-memory for development, Redis or Postgres for production)
- An observability backend (OpenTelemetry-compatible: Arize Phoenix, Jaeger, Honeycomb, Datadog)
- Span instrumentation at every LLM call, tool call, and routing decision

**Workflow:**

1. **Session init** — When a user request arrives, create a `session_id` and a root `Trace`. The trace is the complete journey of this request.
2. **Span per action** — Every LLM call, tool invocation, and routing decision creates a child `Span` inside the trace. Each span records: start time, end time, input, output, model/tool name, token count, cost, and status.
3. **State write** — When a step produces output, write it to the state store keyed by `session_id:step_number`. Downstream steps read from state — they do not rely on conversation history alone.
4. **Error attribution** — When a step fails, trace which upstream span provided its input. If upstream output was low quality, the fault belongs to that span — not the failing step. This prevents misdiagnosis.
5. **Replay** — To debug a failed run: load the session's state from the store, inject a fixed input at the failing step, and re-execute from that point forward. Steps 1–N-1 do not need to re-run.
6. **Export** — Spans are emitted asynchronously to the observability backend. The full trace is queryable by `session_id`, `step_number`, `tool_name`, or `status`.

**Failure modes to watch:**
- `StateLoss` — Caused by: storing state only in LLM conversation history (lost when context is truncated or session ends). Fix: always write step outputs to a persistent state store, keyed independently of conversation history.
- `AttributionError` — Caused by: blaming a downstream step for a failure caused by bad upstream output. Fix: always inspect the upstream span's output before diagnosing the failing span.
- `TraceExplosion` — Caused by: logging full LLM prompts (which can be 10,000+ tokens) as span attributes. Fix: log prompt hashes and token counts — not full prompt text — in the span. Store full prompts in a separate content store.
- `AsyncLag` — Caused by: spans not appearing in the observability backend by the time a developer checks during a live incident. Fix: use a buffered async emitter with a flush-on-shutdown hook.

**Integration touchpoints:**
- Receives from: every other skill — all LLM calls and tool invocations should emit spans
- Feeds into: [`eval-driven-development`](../product-manager/eval-driven-development.md) — evaluation datasets are built from production traces
- Required by: [`tool-orchestration`](./tool-orchestration.md) — every tool dispatch and result is a span

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable to the observability infrastructure. State passed to LLMs must still respect context limits — observability stores the full state externally, not in the LLM's context.
- **Cost ceiling:** State storage cost is negligible (Redis/Postgres). Observability backend cost scales with span volume — for high-frequency agents, sample spans at 10–20% in production and 100% in staging.
- **Model requirement:** Not applicable. State and observability operate at the infrastructure layer.
- **Non-determinism:** Trace content will vary across runs of the same query. This is expected and valuable — comparing traces from successful and failed runs of the same query reveals what differed.
- **Human gate required:** No — for observability infrastructure itself. Yes — for granting access to production traces (they may contain user data and must be handled under your data governance policy).

---

## 📦 Ready-to-Use Artifact: Session State + Span Tracer (Go)

### Option B · JSON Schema (Session State)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SessionState",
  "description": "The shared state object for a single agent session. Written by each step, read by downstream steps.",
  "type": "object",
  "required": ["session_id", "created_at", "status", "steps"],
  "properties": {
    "session_id": { "type": "string", "description": "Unique session identifier. Format: session-[uuid4]" },
    "created_at": { "type": "string", "format": "date-time" },
    "user_intent": { "type": "string", "description": "The original user query, unmodified." },
    "status": {
      "type": "string",
      "enum": ["in_progress", "completed", "failed", "budget_exceeded", "awaiting_human"],
      "description": "Current session status."
    },
    "budget": {
      "type": "object",
      "properties": {
        "max_turns": { "type": "integer" },
        "turns_used": { "type": "integer" },
        "max_usd": { "type": "number" },
        "usd_spent": { "type": "number" }
      }
    },
    "steps": {
      "type": "object",
      "description": "Map of step_number (string) to StepOutput. Keys are '1', '2', '3'...",
      "additionalProperties": {
        "type": "object",
        "required": ["step_number", "tool_name", "status", "output"],
        "properties": {
          "step_number": { "type": "integer" },
          "tool_name": { "type": "string" },
          "status": { "type": "string", "enum": ["success", "failed", "skipped", "pending"] },
          "output": { "type": ["string", "object", "null"] },
          "error": { "type": ["string", "null"] },
          "duration_ms": { "type": "integer" },
          "tokens_used": { "type": "integer" },
          "usd_cost": { "type": "number" }
        }
      }
    }
  }
}
```

### Option C · Go Tracer (Tool Layer)

```go
// File: internal/observability/tracer.go
// Lightweight span tracer. Emits spans to stdout (dev) or an OTLP-compatible
// backend (production) via OpenTelemetry.

package observability

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

type SpanStatus string

const (
	StatusOK      SpanStatus = "ok"
	StatusError   SpanStatus = "error"
	StatusSkipped SpanStatus = "skipped"
)

type Span struct {
	TraceID    string            `json:"trace_id"`
	SpanID     string            `json:"span_id"`
	ParentID   string            `json:"parent_id,omitempty"`
	SessionID  string            `json:"session_id"`
	Name       string            `json:"name"`        // e.g. "llm_call", "tool_call", "router"
	Component  string            `json:"component"`   // e.g. "orchestrator", "researcher"
	StartTime  time.Time         `json:"start_time"`
	EndTime    time.Time         `json:"end_time"`
	DurationMs int64             `json:"duration_ms"`
	Status     SpanStatus        `json:"status"`
	InputHash  string            `json:"input_hash"`  // SHA256 of input — NOT the full input
	OutputHash string            `json:"output_hash"` // SHA256 of output
	TokensIn   int               `json:"tokens_in"`
	TokensOut  int               `json:"tokens_out"`
	USDCost    float64           `json:"usd_cost"`
	Error      string            `json:"error,omitempty"`
	Attributes map[string]string `json:"attributes,omitempty"`
}

type Tracer struct {
	sessionID string
	traceID   string
}

func NewTracer(sessionID, traceID string) *Tracer {
	return &Tracer{sessionID: sessionID, traceID: traceID}
}

// StartSpan begins a span. Call End() on the returned span when the operation completes.
func (t *Tracer) StartSpan(name, component, parentID string) *ActiveSpan {
	return &ActiveSpan{
		tracer: t,
		span: Span{
			TraceID:   t.traceID,
			SpanID:    fmt.Sprintf("span-%d", time.Now().UnixNano()),
			ParentID:  parentID,
			SessionID: t.sessionID,
			Name:      name,
			Component: component,
			StartTime: time.Now(),
		},
	}
}

type ActiveSpan struct {
	tracer *Tracer
	span   Span
}

func (s *ActiveSpan) SetStatus(status SpanStatus) { s.span.Status = status }
func (s *ActiveSpan) SetError(err error)           { s.span.Error = err.Error(); s.span.Status = StatusError }
func (s *ActiveSpan) SetTokens(in, out int)        { s.span.TokensIn = in; s.span.TokensOut = out }
func (s *ActiveSpan) SetCost(usd float64)          { s.span.USDCost = usd }
func (s *ActiveSpan) SetAttr(k, v string)          { if s.span.Attributes == nil { s.span.Attributes = map[string]string{} }; s.span.Attributes[k] = v }
func (s *ActiveSpan) SpanID() string               { return s.span.SpanID }

// End finalises and emits the span.
func (s *ActiveSpan) End() {
	s.span.EndTime = time.Now()
	s.span.DurationMs = s.span.EndTime.Sub(s.span.StartTime).Milliseconds()
	if s.span.Status == "" {
		s.span.Status = StatusOK
	}
	// Emit: replace with your OTLP exporter in production
	b, _ := json.Marshal(s.span)
	log.Printf("SPAN %s", string(b))
}

// ContextKey for storing tracer in context
type contextKey struct{}

func WithTracer(ctx context.Context, t *Tracer) context.Context {
	return context.WithValue(ctx, contextKey{}, t)
}

func TracerFromContext(ctx context.Context) *Tracer {
	if t, ok := ctx.Value(contextKey{}).(*Tracer); ok {
		return t
	}
	return NewTracer("unknown", "unknown")
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`tool-orchestration`](./tool-orchestration.md) | Architect | Every tool dispatch creates a span |
| [`eval-driven-development`](../product-manager/eval-driven-development.md) | Product Manager | Evaluation datasets are curated from production traces |
| [`component-evaluation`](../evaluator/component-evaluation.md) | Evaluator | Component evals isolate specific spans for targeted testing |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Reflection cycle history maps 1:1 to spans |

---

## 📊 Evaluation Checklist

- [ ] Every LLM call emits a span with token counts and cost
- [ ] Every tool call emits a span with duration and status
- [ ] Session state persists across a simulated context window reset
- [ ] Replay tested: failed session re-run from step 3 without re-running steps 1–2
- [ ] Full prompt text NOT stored in span attributes — hashes only
- [ ] Async emitter verified — span emission does not block the critical path

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "State & Observability" and "I. Visibility: The Nervous System (Tracing)" sections.*
*Template version: v1.0.0*
