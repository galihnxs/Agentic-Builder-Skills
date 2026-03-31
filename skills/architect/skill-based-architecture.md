# Skill: Skill-Based Architecture

**Role:** AI Architect
**Phase:** Design
**Autonomy Level:** Low (architectural pattern — constrains all runtime autonomy)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Skill-Based Architecture is the system design pattern that replaces a single monolithic agent prompt with a registry of modular, independently deployable "skills" — each with a specific manifest, a bounded responsibility, and a well-defined input/output contract. The LLM acts as the "brain" (planning and routing), while the orchestrator handles deterministic dispatch to the appropriate skill.

The pattern directly solves **context bloating**: embedding 50+ tool definitions into one giant system prompt degrades routing accuracy as the context grows. Instead, skills are registered in a registry and loaded on-demand — the LLM only sees the skills relevant to the current task.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A skill registry lets teams ship new capabilities (a new data source, a new output format) as isolated skill files without touching the core agent or other skills. Deployment risk is bounded to one skill at a time.
- **Cost implication:** On-demand skill loading reduces the average system prompt size by 60–80% compared to loading all tools simultaneously, directly cutting input token costs per call.
- **Latency implication:** Semantic routing to the right skill adds ~1 LLM call overhead but eliminates the latency of the LLM searching through 50 irrelevant tool definitions before selecting the right one.
- **When to skip this:** Systems with ≤ 5 tools and a single well-defined task type. The registry adds architectural overhead that is not justified when the scope is narrow and stable.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A defined set of skills, each with a `manifest.json` (name, description, input schema, output schema)
- A semantic router capable of matching user intent to skill manifests
- A shared state object passed between the router and skill execution

**Workflow:**

1. **Register skills** — At startup, the Architect loads all skill manifests from the registry directory into memory. Each manifest is a lightweight JSON object — not the full skill implementation.
2. **Intent arrives** — The user query is passed to the semantic router with the list of skill names and descriptions only (not their full implementations).
3. **Skill selected** — The router returns the skill name(s) to invoke. The orchestrator loads only the selected skill's full definition.
4. **Execute in isolation** — The selected skill runs with its own system prompt, input schema, and output contract. It cannot directly call other skills — it returns structured output to the orchestrator.
5. **Compose results** — The orchestrator receives outputs from one or more skills and either returns to the user or passes to the next skill in the plan.
6. **Skill updates** — A new or updated skill is added to the registry directory. The router picks it up on next load. No other skills are modified.

**Failure modes to watch:**
- `RegistryBloat` — Caused by: never retiring old skills. Fix: version skills (`v1`, `v2`) and deprecate via manifest flag `deprecated: true`. Router ignores deprecated skills.
- `RoutingCollision` — Caused by: two skills with overlapping descriptions causing ambiguous routing. Fix: each skill description must answer the question "when should I use this and NOT anything else?" — mutual exclusivity is mandatory.
- `SchemaBreakage` — Caused by: changing a skill's output schema without updating downstream skills that consume it. Fix: treat skill output schemas as versioned APIs. Breaking changes require a new skill version.
- `ContextBleed` — Caused by: a skill receiving state from a previous skill it should not know about. Fix: skills receive only the context explicitly scoped to them by the orchestrator — never the full session history.

**Integration touchpoints:**
- Feeds into: [`tool-orchestration`](./tool-orchestration.md) — the orchestration layer dispatches to skills
- Feeds into: [`state-observability`](./state-observability.md) — each skill execution is a traceable span
- Required by: [`planning-pattern`](../orchestrator/planning-pattern.md) — plans reference skills by registry name

---

## ⚠️ Constraints & Guardrails

- **Context window:** Each skill manifest loaded for routing should be ≤ 100 tokens (name + 1-sentence description). Do not include parameter schemas in the routing prompt — only in the execution prompt.
- **Cost ceiling:** Skill selection adds 1 routing LLM call per user request. At GPT-4o pricing, this is ~$0.001 per routing decision. Acceptable at any scale.
- **Model requirement:** Routing can use a fast, cheap model (GPT-4o-mini, Haiku). Only the skill execution step needs a capable model.
- **Non-determinism:** The router may occasionally select the wrong skill on ambiguous queries. Track routing accuracy as a metric and add disambiguation examples to the router prompt for common failure cases.
- **Human gate required:** No — for routing decisions. Yes — for adding new skills to the registry in production (requires Architect review of the manifest).

---

## 📦 Ready-to-Use Artifact: Skill Manifest Schema + Router Prompt

### Option A · System Prompt (Skill Layer — Semantic Router)

```markdown
## Role
You are the Skill Router. Your single responsibility is:
Read the user's intent and select the most appropriate skill from the registry.

## Available Skills
{{SKILL_REGISTRY}}
Each entry: skill_name | description | when_to_use

## Selection Rules
1. Select ONE skill unless the task explicitly requires sequential skills (e.g., "research then write").
2. If multiple skills match, prefer the more specific one over the general one.
3. If no skill matches, return skill_name: "CANNOT_ROUTE" with a reason.
4. NEVER invent a skill not in the registry.

## Output Format
{
  "selected_skills": [
    {
      "skill_name": "exact-skill-name-from-registry",
      "reason": "One sentence: why this skill matches the intent",
      "sequence_order": 1
    }
  ],
  "confidence": "high | medium | low",
  "ambiguity_note": "Optional: if low confidence, what additional info would resolve it"
}
```

### Option B · JSON Schema (Skill Manifest)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SkillManifest",
  "description": "The lightweight descriptor loaded by the router for every registered skill",
  "type": "object",
  "required": ["skill_name", "version", "role", "description", "when_to_use", "input_schema", "output_schema"],
  "properties": {
    "skill_name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]+$",
      "description": "kebab-case identifier. Unique across the registry. e.g. 'web-search', 'invoice-extractor'"
    },
    "version": {
      "type": "string",
      "pattern": "^v[0-9]+\\.[0-9]+\\.[0-9]+$",
      "description": "Semantic version. e.g. 'v1.0.0'"
    },
    "role": {
      "type": "string",
      "enum": ["architect", "product-manager", "evaluator", "orchestrator", "researcher", "data-analyst", "creator", "compliance", "protector"],
      "description": "Which role owns this skill"
    },
    "description": {
      "type": "string",
      "maxLength": 120,
      "description": "One sentence. Loaded into every routing prompt. Must answer: what does this skill do?"
    },
    "when_to_use": {
      "type": "string",
      "maxLength": 200,
      "description": "One sentence. Loaded into the routing prompt. Must answer: when should the router pick THIS skill and NOT another?"
    },
    "deprecated": {
      "type": "boolean",
      "default": false,
      "description": "If true, router ignores this skill. Use for graceful retirement."
    },
    "input_schema": {
      "type": "object",
      "description": "JSON Schema for this skill's input. Loaded only during execution, not routing."
    },
    "output_schema": {
      "type": "object",
      "description": "JSON Schema for this skill's output. Downstream skills depend on this — treat as versioned API."
    },
    "side_effects": {
      "type": "boolean",
      "default": false,
      "description": "true = this skill writes, sends, or modifies external state. Requires human gate."
    }
  }
}
```

### Option C · Go Tool Registration (Tool Layer — MCP Server)

```go
// File: internal/registry/skill_registry.go
// Loads and serves skill manifests for the semantic router.

package registry

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type SkillManifest struct {
	SkillName    string         `json:"skill_name"`
	Version      string         `json:"version"`
	Role         string         `json:"role"`
	Description  string         `json:"description"`
	WhenToUse    string         `json:"when_to_use"`
	Deprecated   bool           `json:"deprecated"`
	InputSchema  map[string]any `json:"input_schema"`
	OutputSchema map[string]any `json:"output_schema"`
	SideEffects  bool           `json:"side_effects"`
}

// SkillRegistry holds all loaded, non-deprecated skill manifests.
type SkillRegistry struct {
	skills map[string]*SkillManifest
}

// LoadFromDirectory reads all manifest.json files from the skills directory tree.
func LoadFromDirectory(rootDir string) (*SkillRegistry, error) {
	reg := &SkillRegistry{skills: make(map[string]*SkillManifest)}

	err := filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, "manifest.json") {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		var m SkillManifest
		if err := json.Unmarshal(data, &m); err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		if !m.Deprecated {
			reg.skills[m.SkillName] = &m
		}
		return nil
	})
	return reg, err
}

// RouterContext returns the minimal skill list for the routing prompt.
// Only name, description, and when_to_use — NOT input/output schemas.
func (r *SkillRegistry) RouterContext() []map[string]string {
	ctx := make([]map[string]string, 0, len(r.skills))
	for _, m := range r.skills {
		ctx = append(ctx, map[string]string{
			"skill_name": m.SkillName,
			"description": m.Description,
			"when_to_use": m.WhenToUse,
		})
	}
	return ctx
}

// Get returns the full manifest for a skill by name.
func (r *SkillRegistry) Get(name string) (*SkillManifest, bool) {
	m, ok := r.skills[name]
	return m, ok
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`tool-orchestration`](./tool-orchestration.md) | Architect | Dispatches to skills selected by the registry router |
| [`state-observability`](./state-observability.md) | Architect | Each skill invocation is a traceable span in the execution graph |
| [`planning-pattern`](../orchestrator/planning-pattern.md) | Orchestrator | Plans reference skills by their registry name |
| [`mcp-integration`](./mcp-integration.md) | Architect | Tool Layer skills are exposed as MCP server tools |

---

## 📊 Evaluation Checklist

- [ ] Every skill manifest has a unique `skill_name` — verified by CI on every PR
- [ ] Router tested with 20 ambiguous queries — routing accuracy ≥ 90%
- [ ] Deprecated skills confirmed invisible to the router
- [ ] Breaking output schema changes result in a new skill version, not an edit to the existing one
- [ ] Registry load time measured — acceptable for cold start latency budget

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Skill-Based Agent Architecture" and "Semantic Routing" sections.*
*Template version: v1.0.0*
