# Skill: Regional Legal Check

**Role:** Compliance & Legal
**Phase:** Design
**Autonomy Level:** Low (advisory + gate pattern)
**Layer:** Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Regional Legal Check is the advisory and gate pattern that evaluates an agentic system's design against the legal and regulatory requirements of the jurisdiction where it will be deployed and where its data subjects reside. It surfaces legal constraints that must be encoded into the governance policy before the system handles real user data — covering data protection law, AI-specific regulation, sector-specific rules, and cross-border data transfer requirements.

This skill has two modes: **Design-time advisory** (what must be built to be compliant) and **Runtime gate** (blocking actions that would violate a regional rule). It is not legal advice — it is an engineering checklist grounded in publicly documented regulatory requirements, combined with a structured escalation path to qualified legal counsel.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Deploying an agentic system that processes user data without meeting regional legal requirements creates regulatory exposure, fines, and potential service shutdown. In Indonesia (Coreitera's primary market), the Personal Data Protection Law (UU PDP) came into effect in 2024 — non-compliance carries criminal penalties.
- **Cost implication:** A legal compliance review upfront costs days of engineering + legal time. A regulatory action after launch costs months and potentially the business. The ROI of early compliance is infinite.
- **Latency implication:** Design-time compliance work adds 1–2 weeks to the initial build. Runtime legal checks are deterministic rule evaluations — they add <1ms per check.
- **When to skip this:** Never for user-facing systems that process personal data. Internal tooling with no external data subjects may have a reduced compliance scope — document the determination explicitly.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A clear definition of: where the system is deployed, where its users are located, what categories of personal data it processes, and what sectors it operates in
- A legal counsel or DPO (Data Protection Officer) to validate the assessment
- The governance policy file from [`governance-as-code`](./governance-as-code.md) to receive compliance rules as policy entries

**Workflow:**

1. **Scope the jurisdiction** — Identify all regions where: the system is deployed, users are located, and data is stored or processed.
2. **Run the compliance checklist** — For each jurisdiction, evaluate the system against the checklist in the artifact below. Flag every gap.
3. **Translate gaps to policy rules** — Each flagged gap becomes either: (a) a `DENY` policy rule (action is prohibited), (b) a `REQUIRE_APPROVAL` rule (action requires human review), or (c) a data handling constraint (e.g., data must not leave a specific region).
4. **Add rules to governance policy** — The translated rules are added to the `config/governance/policy.yaml` file.
5. **Escalate flagged items** — Any gap without a clear technical solution is escalated to legal counsel before system launch. Document the escalation and outcome.
6. **Re-evaluate on change** — Any change to: the system's data processing scope, user regions, or feature set triggers a re-evaluation.

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable.
- **Cost ceiling:** Legal review cost is a business decision. This checklist reduces the scope and cost of legal review by surfacing the specific questions — not by replacing qualified legal counsel.
- **Model requirement:** None. This skill is a structured checklist and advisory framework — no LLM is used for compliance determination.
- **Non-determinism:** Zero. Legal obligations are deterministic (though their interpretation may require legal expertise). Compliance decisions must not be made by an LLM.
- **Human gate required:** Yes — always. No compliance determination from this checklist is final without validation by a qualified legal professional or DPO in the relevant jurisdiction.

---

## 📦 Ready-to-Use Artifact: Regional Compliance Checklist

*Run this checklist for every jurisdiction where your agent processes user data. Flag every NO or UNSURE for legal escalation.*

### Option A · Global Baseline Checklist (Skill Layer)

```markdown
## Regional Legal Compliance Checklist
**System:** [System Name]
**Assessment Date:** [Date]
**Assessed By:** [Name / Role]
**Jurisdictions:** [List all]

---

### Section 1: Data Minimisation & Purpose Limitation
[ ] Does the agent collect only the personal data strictly necessary for its stated purpose?
[ ] Is the purpose clearly defined and documented before data collection begins?
[ ] Does the agent use data only for the documented purpose — not for other agent tasks?
[ ] Is there a data retention schedule? Is data deleted after its purpose is fulfilled?

### Section 2: Legal Basis for Processing
[ ] Is there a valid legal basis for each category of personal data processed?
    Options: consent | contract | legal obligation | vital interests | public task | legitimate interests
[ ] If relying on consent: is consent freely given, specific, informed, and unambiguous?
[ ] Is the legal basis documented per data category?

### Section 3: Data Subject Rights
[ ] Can users request access to their data processed by the agent?
[ ] Can users request correction of inaccurate agent-processed data?
[ ] Can users request deletion of their data (right to erasure)?
[ ] Is there a process to respond to rights requests within the legally required timeframe?

### Section 4: Security & Access Control
[ ] Is personal data encrypted at rest and in transit?
[ ] Is access to personal data in agent logs and traces role-restricted?
[ ] Is there a breach notification procedure with the legally required timeframe?
[ ] Are third-party tools and APIs processing personal data subject to data processing agreements?

### Section 5: Automated Decision-Making
[ ] Does the agent make decisions with significant effect on individuals?
    If YES: Does local law require a human review option?
[ ] Is automated decision-making disclosed to users?
[ ] Can users contest an automated decision?

### Section 6: Cross-Border Data Transfer
[ ] Does the agent transfer personal data to another country?
    If YES: Is there a legal transfer mechanism in place?
    Options: adequacy decision | standard contractual clauses | binding corporate rules

### Section 7: Sector-Specific Rules
[ ] If healthcare/clinical: Is the system compliant with sector-specific health data laws?
[ ] If financial: Is the system compliant with financial data processing regulations?
[ ] If minors: Does the system process data of minors? If yes, are parental consent requirements met?

---

### Gaps Identified
| Gap | Severity (HIGH/MED/LOW) | Technical Fix | Legal Escalation Required? |
|---|---|---|---|
| [gap description] | HIGH | [fix] | YES |

### Policy Rules Generated
| Action Type | Decision | Condition | Added to policy.yaml? |
|---|---|---|---|
| [action] | DENY / REQUIRE_APPROVAL | [condition] | [ ] |
```

---

### Option A · Indonesia-Specific Supplement (UU PDP — Undang-Undang Perlindungan Data Pribadi)

```markdown
## Indonesia Regional Supplement
**Regulation:** UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi (UU PDP)
**Effective:** October 2024
**Enforcement Body:** Ministry of Communication and Information Technology (Kominfo)
**Note:** This supplement must be reviewed by qualified Indonesian legal counsel before deployment.

---

### Key UU PDP Requirements for Agentic Systems

#### Data Classification
UU PDP distinguishes two categories:
- **General Personal Data:** Name, gender, nationality, religion, health, biometric — requires lawful basis
- **Specific Personal Data:** Health/medical data, genetic data, criminal records, children's data, financial data — requires **explicit consent AND additional safeguards**

[ ] Has the system classified all data it processes into General or Specific categories?
[ ] Specific Personal Data: Is explicit written/electronic consent obtained before processing?
[ ] Specific Personal Data: Are additional technical safeguards in place (encryption, access restriction)?

#### Consent Requirements (Pasal 20-22)
[ ] Is consent obtained before personal data is processed — not during or after?
[ ] Is consent obtained in Bahasa Indonesia or the user's language?
[ ] Is there a mechanism for users to withdraw consent at any time?
[ ] When consent is withdrawn, does the agent stop processing within a reasonable period?

#### Data Subject Rights (Pasal 5-13)
[ ] Right to information: Are users informed of what data the agent processes and why?
[ ] Right to access: Can users obtain a copy of their data within 30 days of request?
[ ] Right to correction: Can users correct inaccurate data?
[ ] Right to deletion: Can users request data deletion when the processing purpose is fulfilled?
[ ] Right to object: Can users object to automated processing that affects them significantly?

#### Data Localization
[ ] Is personal data of Indonesian residents stored in servers located in Indonesia?
    If data is processed abroad: is there an approved cross-border transfer mechanism?
    Note: Kominfo can approve cross-border transfers — check current approved mechanisms.

#### Agentic AI Disclosure
[ ] Are users informed they may be interacting with an AI system (not a human)?
[ ] For automated decisions with significant individual effect: is there a human review option?

#### OJK Supplement (Financial Sector Only)
[ ] If the system processes financial data or operates in financial services:
    Is it compliant with OJK Regulation on Digital Financial Innovation (POJK No. 13/2018)?
[ ] Has the system been registered with OJK's regulatory sandbox if required?

#### Breach Notification
[ ] Is there a procedure to notify Kominfo within 14 days of a data breach?
[ ] Is there a procedure to notify affected data subjects as required?

#### Penalties Reference (for PM awareness)
- Criminal penalties: Up to 6 years imprisonment and/or Rp 6 billion fine (for unlawful use of specific personal data)
- Administrative sanctions: Up to 2% of annual revenue
- Civil liability: Damages to data subjects

### Indonesia-Specific Policy Rules Generated
| Action | Decision | Condition |
|---|---|---|
| process_specific_personal_data | REQUIRE_APPROVAL | Explicit consent must be on file before processing |
| cross_border_data_transfer | DENY | Default — unless Kominfo transfer mechanism is in place |
| automated_significant_decision | REQUIRE_APPROVAL | Human review option must be available to the affected user |
| store_data_outside_indonesia | DENY | Default — unless approved cross-border mechanism exists |
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`governance-as-code`](./governance-as-code.md) | Compliance | Compliance gaps become policy entries in the governance file |
| [`human-in-the-loop`](./human-in-the-loop.md) | Compliance | HITL gates implement many compliance requirements |
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Technical security measures required by data protection law |
| [`state-observability`](../architect/state-observability.md) | Architect | Audit logs are compliance evidence — retention must meet legal requirements |

---

## 📊 Evaluation Checklist

- [ ] Checklist completed for every jurisdiction in scope before launch
- [ ] All gaps documented with severity and escalation status
- [ ] Generated policy rules added to `config/governance/policy.yaml`
- [ ] Legal counsel review completed and documented before production launch
- [ ] Re-evaluation scheduled for: any new jurisdiction, new data category, or regulatory change
- [ ] Indonesia supplement completed if Indonesian users are in scope

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — Global baseline + Indonesia (UU PDP) supplement |

---

*Source: Andrew Ng's Agentic AI course — "Governance as Code" and legal monitoring for agentic compliance. Indonesia supplement: UU No. 27/2022 (UU PDP).*
*This page does not constitute legal advice. Always consult qualified legal counsel for compliance determinations.*
*Template version: v1.0.0*
