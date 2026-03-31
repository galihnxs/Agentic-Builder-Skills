# Skill: Cost & Latency Tradeoffs

**Role:** Lead PM
**Phase:** Design → Post-Mortem
**Autonomy Level:** Low (analytical framework)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Cost & Latency Tradeoffs is the PM's analytical framework for making explicit, documented decisions about where to spend engineering budget on optimisation — and where not to. In production agentic systems, a correct answer delivered too slowly is a failure. An efficient answer that costs $1.00 per query at 100K daily users is a $100K/day infrastructure bill. Both are product failures.

The golden rule is: **get it working, then get it fast and cheap** — in that order. This skill provides the measurement methodology (benchmark every span, calculate materiality) and the decision framework (optimise the 80% of cost/latency, ignore the 2%) to make those decisions with data rather than instinct.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Cost and latency analysis often reveals counterintuitive bottlenecks. A web search API call at $0.016 may be 40× more expensive than the LLM tokens used to process its result. Optimising prompt length saves pennies; reducing search calls saves dollars.
- **Cost implication:** Every span in the execution trace has a cost. Audit them: LLM calls charge by input + output tokens. Tool calls (search APIs, external APIs) charge per request. Compute (sandboxed code execution) charges by runtime. The total is the sum of all spans.
- **Latency implication:** Parallelism is the highest-leverage latency optimisation. Independent steps running sequentially instead of concurrently are wasted time. Identify parallelisable blocks in every pipeline using [`task-decomposition`](./task-decomposition.md).
- **When to skip this:** Pre-launch prototypes. Don't optimise before you have real production traffic patterns. Measure first, then optimise what matters.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- Execution traces with per-span duration and cost data (from [`state-observability`](../architect/state-observability.md))
- A baseline run of 50–100 real queries to establish measurement ground truth
- A definition of acceptable latency and cost per user-facing task

**Workflow:**

1. **Benchmark every span** — Time every LLM call, tool call, and routing decision. Record duration in ms and USD cost.
2. **Build the materiality table** — Sort spans by their contribution to total latency and total cost. The Pareto principle applies: 20% of spans usually drive 80% of cost and latency.
3. **Apply the materiality threshold** — Do not optimise any span contributing < 5% of total latency or < 5% of total cost. Engineering time spent there has negligible user impact.
4. **Identify parallelism opportunities** — Find sequential spans with no dependency on each other. Convert to parallel execution (see [`tool-orchestration`](../architect/tool-orchestration.md)).
5. **Evaluate model downsizing** — For simple spans (keyword extraction, search query generation), test if a smaller, faster model (Haiku, GPT-4o-mini) matches the quality of the current frontier model. If yes, swap.
6. **Evaluate provider swapping** — If a specific span is latency-critical, test alternative API providers. Some providers use specialised hardware (LPUs) for significantly faster token generation.
7. **Document the decision** — Every optimisation decision must be documented: what was measured, what was changed, what improved, and what the regression risk is.

**Failure modes to watch:**
- `PrematureOptimisation` — Caused by: optimising before measuring, or optimising spans with <5% materiality. Fix: always build the materiality table before touching any code.
- `LatencyRegression` — Caused by: adding parallelism to steps that have a hidden dependency. Fix: validate dependency graph before converting sequential steps to parallel.
- `QualityRegression` — Caused by: swapping to a smaller model without running an eval. Fix: every model swap must be validated against the EDD eval dataset before deploying.
- `SearchCostBlindness` — Caused by: optimising LLM prompt length while ignoring that the search API is 40× more expensive per call. Fix: always include external API costs in the materiality table, not just LLM token costs.

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable.
- **Cost ceiling:** Define cost ceilings before launch: per-query, per-user-per-day, per-feature-per-month. Budget overruns in agentic systems can compound rapidly with usage spikes.
- **Model requirement:** Not applicable to the framework. Model selection is an output of this analysis, not an input.
- **Non-determinism:** Latency benchmarks vary across runs. Run each benchmark 5× and use the median, not the mean. Outliers (cold starts, network spikes) skew means.
- **Human gate required:** Yes — for any optimisation that changes model routing in production. Even a "safe" model downgrade requires eval validation and PM approval.

---

## 📦 Ready-to-Use Artifact: Materiality Table Template + Optimisation Decision Log

### Option A · Optimisation Analysis Prompt (Skill Layer)

```markdown
## Role
You are the Cost & Latency Analyst. Given a set of execution trace data,
identify the highest-leverage optimisation opportunities.

## Input
You will receive a JSON array of span records with:
- span_name, component, duration_ms, tokens_in, tokens_out, usd_cost, status

## Your Process
1. Calculate total duration and total cost across all spans.
2. For each span, calculate: % of total duration, % of total cost.
3. Flag spans where either % > 5% as "material."
4. For material spans, identify the optimisation lever:
   - PARALLELISE: if this span has no dependency on other concurrent spans
   - DOWNSIZE_MODEL: if this span does simple formatting, extraction, or classification
   - REDUCE_CALLS: if this tool is called more than once with overlapping queries
   - SWAP_PROVIDER: if this span is latency-critical and alternative providers exist
   - NO_ACTION: if the span is already optimised or its quality requirement mandates the current approach
5. Rank optimisations by expected impact (% latency reduction × % cost reduction).

## Output Format
{
  "total_duration_ms": 12400,
  "total_cost_usd": 0.087,
  "materiality_threshold_pct": 5,
  "spans": [
    {
      "span_name": "web_search",
      "duration_ms": 4200,
      "usd_cost": 0.048,
      "pct_of_duration": 33.9,
      "pct_of_cost": 55.2,
      "material": true,
      "optimisation_lever": "REDUCE_CALLS",
      "recommendation": "Batch 3 search queries into 1 by broadening the query. Reduces calls from 3 to 1.",
      "expected_cost_reduction_pct": 66,
      "expected_latency_reduction_pct": 40,
      "regression_risk": "low | medium | high",
      "requires_eval": true
    }
  ],
  "priority_order": ["web_search", "llm_synthesis"]
}
```

### Option B · JSON Schema (Cost Audit Record)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CostAuditRecord",
  "description": "Per-task cost and latency breakdown for one production run",
  "type": "object",
  "required": ["session_id", "total_duration_ms", "total_cost_usd", "spans"],
  "properties": {
    "session_id": { "type": "string" },
    "total_duration_ms": { "type": "integer" },
    "total_cost_usd": { "type": "number" },
    "spans": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["span_name", "component", "duration_ms", "usd_cost"],
        "properties": {
          "span_name": { "type": "string" },
          "component": { "type": "string" },
          "duration_ms": { "type": "integer" },
          "tokens_in": { "type": "integer" },
          "tokens_out": { "type": "integer" },
          "usd_cost": { "type": "number" },
          "pct_of_duration": { "type": "number" },
          "pct_of_cost": { "type": "number" },
          "status": { "type": "string", "enum": ["success", "failed", "skipped"] }
        }
      }
    }
  }
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`state-observability`](../architect/state-observability.md) | Architect | Provides the per-span cost and duration data this analysis requires |
| [`task-decomposition`](../orchestrator/task-decomposition.md) | Orchestrator | Parallel group structure is the primary latency optimisation lever |
| [`eval-driven-development`](./eval-driven-development.md) | Product Manager | Every optimisation must be validated against the eval dataset |
| [`feasibility-framework`](./feasibility-framework.md) | Product Manager | Initial cost estimates from feasibility are validated against real measurements here |

---

## 📊 Evaluation Checklist

- [ ] Materiality table built from ≥ 50 real production runs, not synthetic benchmarks
- [ ] Latency benchmarks run 5× and reported as median
- [ ] External API costs included in the materiality table (not just LLM token costs)
- [ ] Every model swap validated against EDD eval before deployment
- [ ] Cost ceiling per query documented and alerted in production monitoring

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "IV. Efficiency: Trajectories and Convergence" and "The Materiality Principle" sections.*
*Template version: v1.0.0*
