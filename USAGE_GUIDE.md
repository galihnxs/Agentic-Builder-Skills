# Agentic Skills Library - Usage Guide

## Quick Start

Your 31 agentic skills are now available in Claude Code. Here's how to use them.

---

## 🎯 Finding a Skill

### Option 1: Browse All Skills
Open `SKILL.md` to see all 31 skills organized by role.

### Option 2: By Use Case
What problem are you solving?

| Problem | Try This Skill | Role |
|---------|---|---|
| Structuring a multi-agent system | skill-based-architecture | Architect |
| Building a semantic router | skill-based-architecture | Architect |
| Handling tool dispatch | tool-orchestration | Architect |
| Integrating with MCP | mcp-integration | Architect |
| Adding governance rules | governance-as-code | Compliance |
| Building a code executor | code-execution-pattern | Data Analyst |
| Evaluating agent output | llm-as-judge | Evaluator |
| Decomposing complex tasks | task-decomposition | Orchestrator |
| Optimizing cost vs latency | cost-latency-tradeoffs | Product Manager |
| Defending against injections | injection-defense | Protector |
| Building RAG systems | rag-skill | Researcher |

### Option 3: By Role
```
9 Agentic Roles:
- architect/           (4 skills)
- compliance/          (3 skills)
- creator/             (2 skills)
- data-analyst/        (4 skills)
- evaluator/           (3 skills)
- orchestrator/        (4 skills)
- product-manager/     (5 skills)
- protector/           (3 skills)
- researcher/          (3 skills)
```

---

## 📖 Reading a Skill

Each skill folder contains:

### 1. CLAUDE_SKILL.md
Quick overview with:
- What the skill does
- When to use it
- How to invoke it
- Version & metadata

### 2. Original .md file
Full documentation with:
- Theory and background
- Why this pattern matters
- How it works (step-by-step)
- Failure modes to watch
- Constraints & guardrails
- Ready-to-use artifacts (prompts, schemas, code)

### 3. manifest.json
Machine-readable metadata:
```json
{
  "skill_name": "skill-based-architecture",
  "role": "architect",
  "phase": "Design",
  "autonomy_level": "Low",
  "layer": "Skill Layer"
}
```

---

## 🚀 Using a Skill

### Step 1: Understand the Pattern
Read the skill's documentation to understand:
- When to apply it
- What problem it solves
- How it works

### Step 2: Copy the Artifacts
Each skill includes ready-to-use artifacts:
- **System prompts** — Copy to your prompt files
- **JSON schemas** — Use for tool definitions
- **Code templates** — Adapt to your language
- **Examples** — Reference implementations

### Step 3: Adapt to Your Project
1. Identify the key parts you need
2. Customize for your specific use case
3. Test with your data
4. Evaluate using the provided criteria

### Step 4: Evaluate
Each skill includes evaluation guidance:
- How to measure success
- Metrics to track
- Edge cases to test

---

## 💡 Example: Using the Skill-Based Architecture Pattern

### Find It
```
skills/architect/skill-based-architecture/
├── skill-based-architecture.md    (full docs)
├── CLAUDE_SKILL.md               (quick ref)
└── manifest.json                 (metadata)
```

### Read It
1. Open `skill-based-architecture.md`
2. Read "Why it Matters" section for context
3. Review "How it Works" for implementation
4. Check "Ready-to-Use Artifacts" for code

### Use It
1. Copy the Skill Manifest Schema (JSON) from "Option B"
2. Use it to define manifests for your skills
3. Copy the Semantic Router prompt (Option A)
4. Integrate with your LLM routing layer
5. Register skills in your skill registry

### Evaluate It
From the "Evaluation Checklist":
- [ ] Every skill manifest has unique skill_name
- [ ] Router tested with 20 ambiguous queries (≥90% accuracy)
- [ ] Deprecated skills invisible to router
- [ ] Output schema changes = new skill version

---

## 📦 What Each Skill Includes

### All Skills Have:
- **Title & Description** — What it does
- **Role & Phase** — Who owns it and when to use it
- **Autonomy Level** — How constrained the agent is
- **Layer** — System, Tool, or Data layer
- **Documentation** — Full explanation with diagrams
- **When to Use** — Context and decision criteria
- **Failure Modes** — What can go wrong
- **Constraints** — Limitations and guardrails

### Most Skills Include:
- **System Prompts** — Role-specific instructions
- **JSON Schemas** — Input/output formats
- **Code Examples** — Go, Python, or Node.js
- **Related Skills** — Complementary patterns
- **References** — Citations and research

### Some Skills Include:
- **Diagrams** — Architecture visualizations
- **Templates** — Copy-paste artifacts
- **Evaluators** — Measurement tools
- **Benchmarks** — Performance targets

---

## 🔄 Combining Skills

Skills work together. Common combinations:

### For Multi-Agent Systems
1. **skill-based-architecture** — Define the skill registry
2. **tool-orchestration** — Route to skills
3. **state-observability** — Track execution
4. **planning-pattern** — Decompose goals
5. **evaluation-matrix** — Measure quality

### For Data Processing
1. **code-execution-pattern** — Run code safely
2. **sandbox-setup** — Isolated environment
3. **self-healing-code** — Auto-fix errors
4. **llm-as-judge** — Validate outputs

### For Cost Optimization
1. **cost-latency-tradeoffs** — Choose model/routing
2. **eval-driven-development** — Test decisions
3. **feasibility-framework** — Assess trade-offs

---

## 📚 File Locations

```
Agentic-Builder-Skills/
├── SKILL.md                      # Master index (read this first!)
├── USAGE_GUIDE.md               # This file
├── collection.json              # Complete registry
├── skills/
│   ├── architect/
│   │   ├── skill-based-architecture/
│   │   │   ├── skill-based-architecture.md      (full docs)
│   │   │   ├── CLAUDE_SKILL.md                 (quick ref)
│   │   │   └── manifest.json                   (metadata)
│   │   └── [3 more architect skills]
│   ├── compliance/
│   ├── creator/
│   ├── data-analyst/
│   ├── evaluator/
│   ├── orchestrator/
│   ├── product-manager/
│   ├── protector/
│   └── researcher/
└── scripts/
    ├── generate_manifests.js         (regen manifests)
    └── generate_skill_wrappers.js    (regen CLAUDE_SKILL.md)
```

---

## 🔄 Regenerating Skill Wrappers

If you update a skill's markdown, regenerate the wrappers:

```bash
cd Agentic-Builder-Skills
node scripts/generate_skill_wrappers.js
```

This updates all CLAUDE_SKILL.md files with the latest metadata.

---

## ❓ FAQ

**Q: Can I use these skills with different models?**
A: Yes! The patterns are model-agnostic. Adapt the prompts for your chosen model.

**Q: How do I add a new skill?**
A: Create a new folder in the appropriate role directory with markdown docs. Run `generate_manifests.js` to create the manifest and CLAUDE_SKILL.md.

**Q: Can skills be combined?**
A: Yes! Most complex systems use 3-5 skills together. See "Combining Skills" section.

**Q: What if a skill doesn't quite fit my use case?**
A: Use it as a starting point. All artifacts are templates — adapt them freely.

**Q: How often are skills updated?**
A: The library is static but skills are versioned (v1.0.0). Breaking changes = new version.

---

## 📞 Support

- **Full documentation:** Read the individual skill markdown files
- **Quick reference:** Check CLAUDE_SKILL.md in each skill folder
- **Metadata:** See manifest.json for technical specs
- **All skills:** View `collection.json` for the complete index

---

*Agentic-Builder-Skills v1.0.0 — 31 battle-tested patterns for building reliable AI agents*
