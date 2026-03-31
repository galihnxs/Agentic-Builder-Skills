# Agentic-Builder-Skills

> **Move from writing monolithic LLM scripts to building modular, production-grade multi-agent systems.**

This repository is a **pattern library** for builders who know AI can do more — but need a clear, opinionated structure to get there safely and scalably.

Each page in `/skills` is a reusable "lego brick": a role, a design pattern, and a copy-pasteable artifact that a developer can drop into their codebase today.

---

## The Problem This Repo Solves

Most teams start with **zero-shot hell**: one giant prompt, no feedback loop, brittle tooling. It works for demos. It breaks in production.

The gap between "it works once" and "it works reliably at scale" is:
- **Architecture** — how your agents talk to each other and to the outside world
- **Evaluation** — how you know when something broke and why
- **Safety** — how you stop the LLM from doing things it shouldn't

This repo closes that gap with opinionated, battle-tested patterns.

---

## Two-Layer Philosophy

### Layer 1 · The Skill Layer — Language Agnostic
The core logic of your agents lives in **pure Markdown and JSON**.

- System prompts, personas, and evaluation rubrics are **not tied to any language**
- A Product Manager can copy a skill directly into a [Claude Project](https://claude.ai) as custom instructions — no code required
- A developer can paste the same Markdown as a system prompt into any LLM API call
- Every artifact is **copy-paste ready**

### Layer 2 · The Tool Layer — Go MCP Servers
When your agent needs to *do things* (query a database, run code, call an API), you build a **[Model Context Protocol (MCP)](https://modelcontextprotocol.io)** server.

This repo uses **Go** for all MCP tool implementations. Why:

| Concern | Python / TS | Go |
|---|---|---|
| Tool schema definition | "Automagic" docstring parsing — guesses | Explicit struct tags — deterministic |
| Production stability | Silent failures common | Compiler + explicit error handling |
| Concurrency | Threading complexity | Native goroutines, built for parallelism |
| LLM JSON → function routing | Often implicit | Explicit switch/registry — debuggable |

> The official Go MCP SDK (`modelcontextprotocol/go-sdk`) is production-ready as of 2026. Type safety is not overhead — it's what keeps agents from silently failing at 3am.

---

## Repo Structure

```
agentic-builder-skills/
│
├── README.md                          ← You are here
├── CONTRIBUTING.md                    ← How to add a new skill
├── _template/
│   └── SKILL_TEMPLATE.md              ← Copy this to create any new skill page
│
├── skills/
│   │
│   ├── architect/                     ← Infrastructure & "plumbing" patterns
│   │   ├── skill-based-architecture.md
│   │   ├── mcp-integration.md
│   │   ├── tool-orchestration.md
│   │   └── state-observability.md
│   │
│   ├── product-manager/               ← Strategy, scoping & evaluation design
│   │   ├── eval-driven-development.md
│   │   ├── feasibility-framework.md
│   │   ├── agentic-workflow-design.md
│   │   └── cost-latency-tradeoffs.md
│   │
│   ├── evaluator/                     ← Quality control & output validation
│   │   ├── reflection-pattern.md
│   │   ├── llm-as-judge.md
│   │   ├── component-evaluation.md
│   │   └── evaluation-matrix.md
│   │
│   ├── orchestrator/                  ← Planning, routing & multi-agent coordination
│   │   ├── planning-pattern.md
│   │   ├── task-decomposition.md
│   │   ├── json-xml-output.md
│   │   └── multi-agent-coordination.md
│   │
│   ├── researcher/                    ← Data gathering via search, RAG, APIs
│   │   ├── react-pattern.md
│   │   ├── rag-skill.md
│   │   └── web-search-integration.md
│   │
│   ├── data-analyst/                  ← Code execution, math, sandboxed logic
│   │   ├── code-execution-pattern.md
│   │   ├── sandbox-setup.md
│   │   └── self-healing-code.md
│   │
│   ├── creator/                       ← Synthesis, writing, structured output
│   │   ├── synthesis-output.md
│   │   └── multi-agent-chain.md
│   │
│   ├── compliance/                    ← Legal, safety & governance guardrails
│   │   ├── governance-as-code.md
│   │   ├── human-in-the-loop.md
│   │   └── regional-legal-check.md
│   │
│   └── protector/                     ← Security, sandboxing, injection defense
│       ├── sandboxing-defense.md
│       ├── injection-defense.md
│       └── non-determinism-handling.md
│
└── examples/
    ├── research-agent/                ← Full working example: Researcher + Evaluator + Creator
    └── data-analysis-agent/           ← Full working example: Analyst + Orchestrator + Protector
```

---

## Critical Path: Start Here

If you're shipping your **first production agent**, implement in this order:

| # | Skill | Role | Why First |
|---|---|---|---|
| 1 | [`planning-pattern`](./skills/orchestrator/planning-pattern.md) | Orchestrator | The brain — nothing works without this |
| 2 | [`task-decomposition`](./skills/orchestrator/task-decomposition.md) | Orchestrator | Breaks any task into debuggable steps |
| 3 | [`reflection-pattern`](./skills/evaluator/reflection-pattern.md) | Evaluator | Quality gate before users see output |
| 4 | [`react-pattern`](./skills/researcher/react-pattern.md) | Researcher | Foundational tool-use loop |
| 5 | [`sandboxing-defense`](./skills/protector/sandboxing-defense.md) | Protector | Prevents the `rm -rf` problem |

---

## How to Use This Repo

### As a Product Manager
1. Open any skill page in `/skills`
2. Read the **"Why it matters"** section — this is your sprint justification
3. Copy the **system prompt artifact** directly into a [Claude Project](https://claude.ai) as custom instructions
4. No code required

### As an Engineer
1. Find the pattern you need (start with [critical path](#critical-path-start-here))
2. Read the **"How it Works"** section
3. Copy the **JSON schema or Go struct** artifact into your codebase
4. Adapt the system prompt to your domain

### As a Team
- Use this repo as a **shared vocabulary** — when your PM says "Evaluator" and your engineer says "Evaluator", they mean the same thing
- Pin specific skill pages as references in your PRDs and architecture docs
- Contribute back: if you build a better artifact, open a PR

---

## Design Principles

**1. No Fluff**
Every page earns its place. If it doesn't change how you build, it doesn't belong here.

**2. Audience-Bridging**
Every skill explains *why* (PM perspective) and *how* (engineering perspective). Both sections are mandatory.

**3. Artifacts Over Essays**
Each page ends with something you can use today — not something you have to translate first.

**4. Opinionated, Not Prescriptive**
We make choices (Go over Python for MCP, JSON over plain text for plans). We explain why. You can disagree, but you can't claim we didn't tell you ours.

**5. Evaluation is Not Optional**
Shipping an agent without evals is shipping untested code. The Evaluator role isn't a "nice to have", it's a gate.

---

## Conceptual Foundation

This repo is grounded in **Andrew Ng's Agentic AI course (DeepLearning.AI)** and extended with production engineering patterns. Core concepts drawn from the source material:

- **Agentic Workflow vs. Zero-Shot**: The difference between asking an LLM to "write an essay in one shot" vs. letting it plan, draft, reflect, and revise. The agentic approach takes longer but delivers significantly higher quality.
- **Spectrum of Autonomy**: Systems range from fully deterministic (all steps hard-coded) to highly autonomous (LLM decides steps at runtime). This repo covers the full spectrum.
- **Key Design Patterns**: ReAct, Reflection, Planning, Multi-Agent (Swarm/Hierarchical), and Human-in-the-Loop — all documented here with production-grade artifacts.
- **Evaluation Trinity**: Code-based (100% accuracy), LLM-as-Judge (~85-95%), and Human Annotation (gold standard). Every production system needs all three.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

**Short version:**
1. Copy `_template/SKILL_TEMPLATE.md`
2. Place it in the correct `/skills/[role]/` folder
3. Fill every section — especially the artifact
4. Open a PR with the title: `skill: [role] / [skill-name]`

---

## License

MIT — use freely, build boldly, ship safely.

---

*"The goal is to move from being an AI user to being an AI architect."*
*— Andrew Ng*

## 🎓 Acknowledgements & Inspiration
The architectural concepts, evaluation methodologies, and agentic patterns implemented in this repository were heavily inspired by the foundational concepts taught in Andrew Ng's "Agentic AI" course via DeepLearning.AI.

This repository represents an independent, open-source implementation of those industry concepts, built specifically for Go developers and monolith integrations. It contains no proprietary code or materials from the original course.
