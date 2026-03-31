# Skill: Non-Determinism Handling

**Role:** Protector (Principal Engineer)
**Phase:** Design → Quality Control
**Autonomy Level:** Low (constrains all other autonomy levels)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Non-Determinism Handling is the engineering discipline of designing agentic systems to be robust against the fundamental property of LLMs: the same input does not always produce the same output. Unlike traditional software (deterministic) where unit tests produce identical results, LLM agents can have multiple execution paths for the same query — and improving agents relies on data, not on fixing a single deterministic bug.

This skill covers four practices: **variance measurement** (quantifying how much outputs differ across runs), **confidence gating** (blocking low-confidence outputs from reaching users), **majority voting** (running multiple calls and selecting the consensus output), and **determinism boundaries** (identifying which parts of the system must be deterministic and enforcing it with code, not prompts).

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A user who gets a different answer to the same question on two consecutive days loses trust in the system. Non-determinism handling is what separates "impressive demo" from "reliable product."
- **Cost implication:** Majority voting (running 3× and selecting consensus) triples LLM call cost for the voted steps. Apply only to high-stakes, high-variance outputs — not every step. Variance measurement tells you which steps need it.
- **Latency implication:** Majority voting can run calls in parallel — 3 parallel calls take the latency of 1 sequential call. Confidence gating adds <1ms (deterministic threshold check). Neither is a latency blocker when implemented correctly.
- **When to skip this:** For tasks where variation in output is acceptable and even desirable (creative writing, brainstorming, style variation). Non-determinism handling is a constraint — only apply it where consistency is a product requirement.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- An evaluation metric for the output type (see [`evaluation-matrix`](../evaluator/evaluation-matrix.md))
- A `confidence` field in every agent's output schema
- A variance measurement baseline (run 10 identical queries, measure output difference)

**Workflow:**

1. **Measure variance baseline** — For each agent in the system, run 10 identical queries. Measure: output schema validity rate, factual consistency rate, and confidence score distribution. This tells you which agents have high non-determinism.
2. **Classify each agent's non-determinism level:**
   - **Low** (schema validity > 95%, factual consistency > 90%): standard single-call with confidence gate
   - **Medium** (schema validity 80–95%, factual consistency 70–90%): single-call with reflection and confidence gate
   - **High** (schema validity < 80% or factual consistency < 70%): majority voting or deterministic replacement
3. **Apply the right pattern per agent:**
   - **Confidence gate**: block outputs with `confidence: low` from passing to downstream agents or users
   - **Reflection loop**: apply [`reflection-pattern`](../evaluator/reflection-pattern.md) to high-variance outputs
   - **Majority voting**: run 3 parallel calls, use [`llm-as-judge`](../evaluator/llm-as-judge.md) to select the best
   - **Deterministic replacement**: replace the LLM call entirely with a code-based computation (for math, formatting, validation tasks where non-determinism should be zero)
4. **Enforce determinism boundaries** — Identify system components that must produce identical output for identical input (IDs, timestamps, calculation results, schema validation). These components must never be LLM-based — replace with code.
5. **Monitor in production** — Track per-agent confidence score distribution over time. A declining confidence score distribution signals model drift or prompt degradation.

**Failure modes to watch:**
- `ConfidenceHallucination` — Caused by: the LLM consistently outputting `confidence: high` even for incorrect outputs. Fix: calibrate confidence against ground truth — if an agent outputs `high` confidence on 90% of runs but is correct only 60% of the time, the confidence signal is uncalibrated. Use external validation, not self-reported confidence.
- `VotingTie` — Caused by: 3 majority voting calls producing 3 different outputs (no consensus). Fix: default to a 4th call with the highest-quality model, or escalate to human review. Never resolve ties by random selection.
- `DeterminismAssumption` — Caused by: treating an LLM-based step as if it were deterministic in downstream logic (e.g., caching the output and serving it indefinitely). Fix: LLM outputs must never be cached without a confidence threshold and an expiry.
- `UncalibratedTemperature` — Caused by: using `temperature=1.0` for tasks requiring consistency. Fix: use `temperature=0` for factual extraction, schema generation, and routing decisions. Reserve higher temperatures for creative tasks.

**Integration touchpoints:**
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — medium-variance outputs route to reflection
- Feeds into: [`llm-as-judge`](../evaluator/llm-as-judge.md) — majority voting selection uses LLM-as-Judge
- Feeds into: [`human-in-the-loop`](../compliance/human-in-the-loop.md) — `confidence: low` outputs with no auto-recovery route to HITL
- Required by: [`eval-driven-development`](../product-manager/eval-driven-development.md) — variance measurement is an EDD input
- Informs: [`cost-latency-tradeoffs`](../product-manager/cost-latency-tradeoffs.md) — majority voting cost must be included in per-task budget

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable to the handling patterns themselves. Majority voting makes 3 independent calls — each must fit within the model's context window.
- **Cost ceiling:** Majority voting triples call cost for the voted steps. Measure variance first — only apply majority voting to agents with Medium or High variance. Do not apply universally.
- **Model requirement:** Use `temperature=0` for deterministic outputs (routing, schema extraction, factual retrieval). Use `temperature=0.3–0.7` for synthesis and narrative. Never use `temperature=1.0` for production agentic tasks.
- **Non-determinism:** By definition, this skill addresses non-determinism. The goal is not to eliminate it (impossible) but to contain it within acceptable bounds and gate outputs that fall outside those bounds.
- **Human gate required:** Yes — for any output where: (a) confidence is low and no auto-recovery is available, or (b) majority voting produces no consensus. Do not deliver uncertified outputs to users.

---

## 📦 Ready-to-Use Artifact: Variance Measurement Schema + Majority Voter

### Option B · JSON Schema (Variance Report)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentVarianceReport",
  "description": "Per-agent non-determinism measurement. Run before deploying any agent to production.",
  "type": "object",
  "required": ["agent_name", "skill_ref", "sample_size", "results"],
  "properties": {
    "agent_name": { "type": "string" },
    "skill_ref": { "type": "string" },
    "sample_size": { "type": "integer", "minimum": 10, "description": "Number of identical queries run" },
    "temperature_used": { "type": "number" },
    "model_used": { "type": "string" },
    "results": {
      "type": "object",
      "properties": {
        "schema_validity_rate": { "type": "number", "minimum": 0, "maximum": 1, "description": "% of runs producing valid JSON output" },
        "factual_consistency_rate": { "type": "number", "minimum": 0, "maximum": 1, "description": "% of runs producing factually consistent core claims" },
        "confidence_high_rate": { "type": "number", "minimum": 0, "maximum": 1, "description": "% of runs reporting confidence=high" },
        "confidence_calibration_rate": { "type": "number", "minimum": 0, "maximum": 1, "description": "% of high-confidence outputs that are actually correct" }
      }
    },
    "non_determinism_level": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "description": "Classification based on results thresholds"
    },
    "recommended_pattern": {
      "type": "string",
      "enum": ["confidence_gate", "reflection_loop", "majority_voting", "deterministic_replacement"],
      "description": "Recommended handling pattern based on variance level"
    }
  }
}
```

### Option C · Go Majority Voter (Tool Layer)

```go
// File: internal/reliability/majority_voter.go
// Runs N parallel LLM calls and selects the best output by consensus or judge score.

package reliability

import (
	"context"
	"sync"
)

type CallResult struct {
	Output     string
	Confidence string // "high" | "medium" | "low"
	Error      error
}

type MajorityVoterConfig struct {
	N          int    // Number of parallel calls (recommended: 3)
	MinConsensus int  // Minimum matching outputs to declare consensus (recommended: 2)
}

// DefaultVoterConfig returns safe defaults for majority voting.
func DefaultVoterConfig() MajorityVoterConfig {
	return MajorityVoterConfig{N: 3, MinConsensus: 2}
}

// VoteResult contains the selected output and voting metadata.
type VoteResult struct {
	SelectedOutput string
	ConsensusReached bool
	ConsensusCount   int
	AllOutputs       []CallResult
	Method           string // "consensus" | "judge" | "escalated"
}

// RunMajorityVote executes the callFn N times in parallel and selects the best output.
// judgeFn compares two outputs and returns the better one (used when no consensus).
func RunMajorityVote(
	ctx context.Context,
	callFn func(context.Context) CallResult,
	judgeFn func(ctx context.Context, outputs []string) (string, error),
	cfg MajorityVoterConfig,
) VoteResult {
	results := make([]CallResult, cfg.N)
	var wg sync.WaitGroup

	for i := 0; i < cfg.N; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = callFn(ctx)
		}()
	}
	wg.Wait()

	// Filter successful results
	successful := []CallResult{}
	for _, r := range results {
		if r.Error == nil && r.Output != "" {
			successful = append(successful, r)
		}
	}

	if len(successful) == 0 {
		return VoteResult{AllOutputs: results, Method: "escalated"}
	}

	// Check for consensus (identical outputs)
	counts := make(map[string]int)
	for _, r := range successful {
		counts[r.Output]++
	}
	for output, count := range counts {
		if count >= cfg.MinConsensus {
			return VoteResult{
				SelectedOutput:   output,
				ConsensusReached: true,
				ConsensusCount:   count,
				AllOutputs:       results,
				Method:           "consensus",
			}
		}
	}

	// No consensus — use judge to select best
	outputs := make([]string, len(successful))
	for i, r := range successful {
		outputs[i] = r.Output
	}
	best, err := judgeFn(ctx, outputs)
	if err != nil {
		return VoteResult{AllOutputs: results, Method: "escalated"}
	}
	return VoteResult{
		SelectedOutput:   best,
		ConsensusReached: false,
		AllOutputs:       results,
		Method:           "judge",
	}
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Medium-variance outputs route to reflection before delivery |
| [`llm-as-judge`](../evaluator/llm-as-judge.md) | Evaluator | Judge selects best output when majority voting finds no consensus |
| [`eval-driven-development`](../product-manager/eval-driven-development.md) | Product Manager | Variance measurement feeds into EDD baseline metrics |
| [`human-in-the-loop`](../compliance/human-in-the-loop.md) | Compliance | Unresolvable low-confidence outputs escalate to HITL |
| [`sandboxing-defense`](./sandboxing-defense.md) | Protector | Deterministic code execution is the strongest non-determinism remedy |

---

## 📊 Evaluation Checklist

- [ ] Variance baseline measured for every agent before production deployment
- [ ] Confidence calibration verified — `high` confidence correlates with actual correctness
- [ ] Majority voting tested — no-consensus case routes to judge, not random selection
- [ ] `temperature=0` enforced for routing, schema extraction, and factual retrieval
- [ ] LLM outputs never cached without confidence threshold + expiry
- [ ] Low-confidence gate verified — `confidence: low` outputs block before user delivery

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "LLM Agents are non-deterministic", "LLM Agents can have multiple paths", and "Improving agents relies on data" sections.*
*Template version: v1.0.0*
