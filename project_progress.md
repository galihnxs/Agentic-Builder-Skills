# 📦 Service Status: Agentic-Builder-Skills (Marketplace Integration)

## 🎯 Current Feature Scope
* **Objective:** Enable the repository to be added as a Claude Code Marketplace by implementing the required manifest structure.
* **User Story:** As a Developer, I want to add `Agentic-Builder-Skills` as a marketplace so I can "get" the skills directly via Claude's CLI or interface.

## 🧠 Architecture Decision Record (ADR)
* **Decision:** Implement a `.claude-plugin/marketplace.json` file at the root.
* **Why:** Claude Code expects a specific manifest to validate a repository as a marketplace.
* **Decision:** Group skills into a single "Coreitera Agentic Skills" plugin for initial fix.
* **Why:** Simplifies the marketplace registration; we can subdivide into individual role-based plugins later.

## 🚦 Progress & Phases
> **Rule:** Do not start Phase 2 until Phase 1 is marked [x].

**Phase 1: Foundation (Manifest & Registration)**
- [x] Create `.claude-plugin` directory.
- [x] Create `marketplace.json` with metadata and plugin references.
- [x] Create `plugin.json` at root for the main skill library.
- [x] Validate marketplace structure.

**Phase 2: Individual Skill Pluginization (Optional/Later)**
- [x] Create individual `plugin.json` for each role (Architect, Evaluator, etc).
- [x] Update `marketplace.json` to list multiple plugins.

## ⚠️ Technical Debt
* [ ] Currently, these are Markdown files (static content). Claude plugins usually expect interactive tool definitions. We need to decide how to "map" these prompts into Claude's environment (e.g. as custom instructions).
