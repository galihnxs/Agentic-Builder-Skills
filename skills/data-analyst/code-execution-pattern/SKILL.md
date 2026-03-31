---
name: code-execution-pattern
description: The Code Execution Pattern is the "Swiss Army Knife" approach to agent tooling.
---
# Action
When the user invokes this skill, you are acting as an AI Architect helping them build this pattern into their codebase. You will transfer the templates associated with this skill directly to the user's project.

## Step 1: Transfer Prompts
Locate the `templates/system.md` file in this directory. Propose creating a new prompt file in the user's repository using these exact contents (ask them where they store agent prompts, e.g., `knowledge_base/prompts/analyst.md`).

## Step 2: Transfer Schemas
Locate the `templates/schema.json` file in this directory. Provide this to the user as the exact tool schema they must register with their LLM router.

## Step 3: Scaffold Infrastructure
If `templates/tool.go` exists in this directory (it does not for this specific skill), help the user integrate this MCP code into their Go backend.
