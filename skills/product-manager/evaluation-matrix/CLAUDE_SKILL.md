---
name: evaluation-matrix
description: The Evaluation Matrix is the decision framework that maps every agent output type to the correct evaluation method based on two axes: (1) whether a per-example ground truth exists, and (2) whether the evaluation criteria are objective or subjective. It is not a tool — it is a forcing function that prevents the most common evaluation mistake in agentic systems: using the wrong type of eval for a given task and either over-engineering (expensive LLM-as-Judge for a task checkable with regex) or under-engineering (regex for a task requiring semantic understanding).
---

# Skill: Evaluation Matrix

**Role:** product-manager
**Version:** v1.0.0
**Phase:** Quality Control → Design
**Autonomy Level:** Low
**Layer:** Skill Layer

## What This Skill Does

The Evaluation Matrix is the decision framework that maps every agent output type to the correct evaluation method based on two axes: (1) whether a per-example ground truth exists, and (2) whether the evaluation criteria are objective or subjective. It is not a tool — it is a forcing function that prevents the most common evaluation mistake in agentic systems: using the wrong type of eval for a given task and either over-engineering (expensive LLM-as-Judge for a task checkable with regex) or under-engineering (regex for a task requiring semantic understanding).

## When to Use

Use this skill for evaluation matrix tasks.

## How to Invoke

Call this skill from Claude Code to access the "Evaluation Matrix" pattern and implementation.

## Reference Documentation

See the README.md in this directory for full documentation.

---

*This is an auto-generated wrapper. Source: Agentic-Builder-Skills*
