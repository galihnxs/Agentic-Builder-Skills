# 📦 Service Status: Agentic-Builder-Skills (Marketplace Integration)

## 🎯 Current Feature Scope
* **Objective:** Enable the repository to be added as a Claude Code Marketplace by implementing the required manifest structure.
* **User Story:** As a Developer, I want to add `Agentic-Builder-Skills` as a marketplace so I can "get" the skills directly via Claude's CLI or interface.

## 🧠 Architecture Decision Record (ADR)
* **Decision:** Implement a `.claude-plugin/marketplace.json` file at the root.
* **Why:** Claude Code expects a specific manifest to validate a repository as a marketplace.
* **Decision:** Group skills into a single "Coreitera Agentic Skills" plugin for initial fix.
* **Why:** Simplifies the marketplace registration; we can subdivide into individual role-based plugins later.

## 🏛️ SENIOR PRINCIPAL ARCHITECT 

1. The "Double-Barrel" Explanation
We are writing a Deterministic Extraction Parser.

CS Term: AST Parsing / Regex Schema.
Analogy: Instead of telling an assistant "Go organize the kitchen" (which is ambiguous and will result in spoons mixed with forks), we are writing an explicit algorithm: "If you see an object in a drawer labeled 'Option A', open the markdown backticks, copy exactly what is inside, paste it into templates/system.md, and close the file."
2. The Deterministic Plan Updates
I have rewritten the implementation plan as a strict, programmatic rulebook in 
implementation_plan_sync_fix.md
.

Here is exactly how the mapping will work so that Gemini (or I) cannot fail:

Rule 1 (Prompts): Trigger on ### Option A. Extract only the content inside the very first ```markdown block. Output to templates/system.md.
Rule 2 (Schemas): Trigger on ### Option B. Extract only the content inside the ```json block. Output to templates/schema.json.
Rule 3 (Go Code): Trigger on ### Option C. Extract only the content inside the ```go block. Output to templates/tool.go.
Rule 4 (Documentation Context): Strip the code blocks out of the original file, replacing them with a pointer: *See templates/ for code.*, and save the rest as the human-facing README.md.
Rule 5 (Skill Generator): Create the master SKILL.md using a strict literal template with YAML frontmatter that instructs Claude to read and transfer those generated templates.

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
- [x] Fix sync issue by correcting `git-subdir` source type.

**Phase 3: Structural Conversion (The "Skills Code" Fix)**
> **Context:** Skills must be restructured from static docs into Active Scaffolding Directories (`my-skill/SKILL.md`) to be interpreted and executed by Claude.

### 📌 The Deterministic Extraction Algorithm
*(For AI Auto-Parsing or script execution)*
1. **Rule 0 (Metadata):** Extract `name` (filename) and `description` (first sentence under `## 📖 What is it?`).
2. **Rule 1 (Prompt):** Trigger: `### Option A`. Extract content inside the first ` ```markdown ` block. Target: `templates/system.md`.
3. **Rule 2 (Schema):** Trigger: `### Option B`. Extract content inside the first ` ```json ` block. Target: `templates/schema.json`.
4. **Rule 3 (Go Code):** Trigger: `### Option C`. Extract content inside the first ` ```go ` block. Target: `templates/tool.go`.
5. **Rule 4 (Human Context):** Strip Option A/B/C code blocks from the source markdown, replace with `*See templates/ for code.*`, and save as `README.md`.
6. **Rule 5 (Skill Generator):** Create `SKILL.md` using YAML frontmatter (Rule 0) and explicit scaffold commands pointing Claude to the `templates/` folder.

### 📝 Execution Waves
- [x] **Wave 1 (Pilot):** Run extraction pipeline on `/skills/data-analyst/code-execution-pattern.md`.
- [ ] **Wave 2 (Architect/Orchestrator):** Refactor the core coordinating patterns.
- [ ] **Wave 3 (Evaluator/Protector/Compliance):** Refactor validation and safety patterns.
- [ ] **Wave 4 (Remaining Roles):** Complete the library.
- [ ] **Template Update:** Update `_template/SKILL_TEMPLATE.md` to reflect the multi-file architecture.

## ⚠️ Technical Debt
* [ ] (Resolved in Phase 3) Currently, these are monolithic Markdown files. We are separating prompt logic (`SKILL.md`) from human documentation (`README.md`).
