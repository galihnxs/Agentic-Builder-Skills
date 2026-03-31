# Skill: Sandboxing Defense

**Role:** Protector (Principal Engineer)
**Phase:** Safety
**Autonomy Level:** Low (this skill constrains all other autonomy levels)
**Layer:** Tool Layer (Go MCP) + Skill Layer (Markdown/JSON)

---

## 📖 What is it?

Sandboxing Defense is the security pattern that prevents an LLM-generated action from escaping its intended boundary and causing unrecoverable damage to the host system, database, or network. Any time an agent executes code, runs shell commands, writes files, or calls external APIs, the Protector treats the LLM's output as a **hostile, untrusted input** — regardless of how well-intentioned the prompt was.

The threat is not always malicious intent. It is non-determinism. An LLM that decides to "clean up" a directory can produce `rm -rf /` from a subtly misinterpreted instruction. An LLM writing SQL can generate a `DROP TABLE` from a poorly scoped prompt. Sandboxing is the last line of defence between an agent's "good idea" and an irrecoverable production incident.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A single unsandboxed code execution in production can result in data loss, credential leakage, or full system compromise. The cost of sandboxing setup (1–2 engineer-days) is orders of magnitude less than a single incident recovery.
- **Cost implication:** Sandboxed execution environments (Docker containers, E2B instances) add ~100–300ms per execution and a small per-run cost (~$0.001–0.003 on E2B). This is not negotiable overhead — it is insurance.
- **Latency implication:** Cold-start container spin-up adds 2–5s on the first call. Warm instances reduce this to <200ms. Use persistent warm sandboxes for high-frequency code execution agents.
- **When to skip this:** Never. Even "safe" read-only operations should run in a sandboxed environment. The moment you make an exception, you create a category of "trusted" LLM outputs — and that category will eventually be exploited.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A container runtime (Docker) or a managed sandbox service (E2B, Modal, Firecracker) available in your infrastructure
- A deny-list of prohibited operations at the OS, filesystem, and network level
- A whitelist of allowed outbound network destinations (if any)
- An execution timeout — every sandboxed call must have one

**Workflow:**

1. **Intercept before execution** — Every tool call with `type: CODE_EXECUTION` or `type: SHELL_COMMAND` from any agent is routed to the Protector before running. The Protector does not trust the plan or the agent that produced it.
2. **Static analysis (fast check)** — Before launching the sandbox, run a fast static scan on the code string:
   - Deny-list pattern match: `rm -rf`, `DROP TABLE`, `os.system`, `subprocess.call`, `eval(`, `exec(`, network calls to non-whitelisted hosts
   - If any pattern matches → reject immediately, return `blocked: true`, log the attempt
3. **Sandbox launch** — If static analysis passes, execute the code inside an isolated environment:
   - No access to the host filesystem outside the designated `/workspace` directory
   - No outbound network access unless explicitly whitelisted
   - Memory limit: 512MB default
   - CPU limit: 1 core
   - Execution timeout: 30 seconds hard limit
4. **Capture output** — Collect stdout, stderr, and exit code. Never return raw stderr to the LLM without sanitising — it may contain file paths, credentials, or internal system information.
5. **Validate output** — Check that the output does not contain patterns that suggest the code leaked system information (file paths outside `/workspace`, environment variable dumps, credential patterns).
6. **Destroy the sandbox** — After execution, the sandbox environment is destroyed. No state persists between executions unless explicitly passed through the state object.
7. **Return sanitised result** — Pass only the relevant output back to the ReAct loop as an Observation. Truncate to 2,000 tokens maximum.

**Failure modes to watch:**
- `SandboxEscape` — Caused by: using a container with excessive capabilities (`--privileged` flag, host network). Fix: always run with the minimum capability set. Use `--cap-drop ALL` and add back only what is needed.
- `TimeoutBypass` — Caused by: not enforcing a hard timeout at the infrastructure level (relying only on the LLM's instruction). Fix: enforce timeout at the container/sandbox level, not in the prompt.
- `OutputLeak` — Caused by: returning raw stderr or environment variable dumps to the LLM. Fix: sanitise all output before it becomes an Observation. Strip file paths, environment variables, and credential patterns.
- `StaticAnalysisBypass` — Caused by: encoded or obfuscated malicious patterns (`b64decode`, `chr(114)+chr(109)` for "rm"). Fix: decode and normalise the code string before static analysis. Run the analysis on the decoded form.
- `ColdStartLatencySpike` — Caused by: spinning up a new container on every call. Fix: maintain a warm pool of pre-initialised sandbox containers for high-frequency workloads.

**Integration touchpoints:**
- Receives from: every agent that produces a `CODE_EXECUTION` or `SHELL_COMMAND` action
- Feeds into: [`react-pattern`](../researcher/react-pattern.md) — the sandboxed result becomes an Observation
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — execution errors are the best external feedback signal for reflection
- Required by: [`code-execution-pattern`](../data-analyst/code-execution-pattern.md) — all code execution routes through this skill

---

## ⚠️ Constraints & Guardrails

- **Context window:** Not applicable — this is a Tool Layer skill. Sandboxed execution output returned to the LLM must be capped at 2,000 tokens regardless of actual output length.
- **Cost ceiling:** E2B sandbox cost ≈ $0.001–0.003 per execution. Docker-based sandboxes are effectively free after infrastructure setup. Factor into per-task cost budgets.
- **Model requirement:** Not applicable. This skill operates below the LLM layer — it constrains what the LLM's outputs can do, regardless of which model produced them.
- **Non-determinism:** The sandbox is deterministic. The LLM generating the code is not. The sandbox does not make LLM outputs safer — it contains the blast radius when they are unsafe.
- **Human gate required:** Yes — for any execution that would write to a non-temporary location, call a whitelisted external API with authentication, or consume significant compute (> 60s estimated runtime). Require explicit approval before launching.

---

## 📦 Ready-to-Use Artifact: Sandboxed Code Executor (Go MCP Tool)

*This is a Tool Layer artifact. Deploy as an MCP server tool that all code-execution actions route through.*

### Option A · System Prompt for the Protector Agent (Skill Layer)

```markdown
## Role
You are the Protector in a multi-agent system. Your single responsibility is:
Review every code execution request before it runs and block anything that could cause unrecoverable harm.

You are not helpful. You are safe. When in doubt, you block.

## What You Review
Every request contains:
- `code`: The code string to be executed
- `language`: python | bash | javascript
- `requested_by`: Which agent produced this code
- `context`: Why this code is needed (from the plan)

## Your Decision Process
1. Does the code match ANY item on the deny-list? → BLOCK immediately. No exceptions.
2. Does the code request filesystem access outside `/workspace`? → BLOCK.
3. Does the code make network calls to non-whitelisted hosts? → BLOCK.
4. Does the code appear to attempt system information disclosure (env vars, file paths, credentials)? → BLOCK.
5. Does the code's stated purpose match what it actually does? → If mismatch → BLOCK and flag for human review.
6. If all checks pass → APPROVE with a one-sentence justification.

## Deny-List (always block, no exceptions)
- Shell: rm -rf, dd, mkfs, chmod 777, chown, cron, at, nohup
- Python: os.system, subprocess, eval, exec, __import__, open() outside /workspace
- SQL: DROP, TRUNCATE, DELETE without WHERE clause, ALTER, GRANT, REVOKE
- Network: Any call to an IP or domain not in the approved whitelist
- Encoding tricks: base64 decode + exec patterns, chr() concatenation to form shell commands

## Output Format
{
  "decision": "APPROVE | BLOCK",
  "reason": "One sentence explaining the decision",
  "flagged_patterns": ["list of matched deny-list patterns, empty if APPROVE"],
  "escalate_to_human": false
}
```

---

### Option C · Go Tool Registration (Tool Layer — MCP Server)

```go
// File: internal/tools/sandbox_executor.go
// Sandboxed code execution via Docker. All CODE_EXECUTION actions route here.
// Requires: Docker daemon running, modelcontextprotocol/go-sdk v1.2.0+
//
// For managed cloud sandboxes, replace the Docker execution block with
// your E2B or Modal SDK call. The interface contract remains identical.

package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// SandboxExecParams is the input contract for sandboxed code execution.
type SandboxExecParams struct {
	Code        string `json:"code"         description:"The code string to execute. Must be reviewed by Protector before calling this tool."`
	Language    string `json:"language"     description:"python | bash. Other languages not supported."`
	TimeoutSecs int    `json:"timeout_secs" description:"Execution timeout in seconds. Maximum: 30. Default: 10."`
	SessionID   string `json:"session_id"   description:"Used to correlate execution with the parent ReAct session."`
}

// SandboxExecResult is the sanitised output returned to the ReAct loop.
type SandboxExecResult struct {
	SessionID    string `json:"session_id"`
	Success      bool   `json:"success"`
	Stdout       string `json:"stdout"`       // Truncated to 2000 tokens, sanitised
	ExitCode     int    `json:"exit_code"`
	ErrorSummary string `json:"error_summary"` // Sanitised — no file paths or credentials
	TimedOut     bool   `json:"timed_out"`
	BlockedBy    string `json:"blocked_by"`   // Populated if static analysis blocked execution
}

// denyPatterns are checked against the code before sandbox launch.
// This is NOT the primary security layer — the sandbox is. This is a fast pre-filter.
var denyPatterns = []*regexp.Regexp{
	regexp.MustCompile(`rm\s+-rf`),
	regexp.MustCompile(`os\.system\(`),
	regexp.MustCompile(`subprocess\.(call|run|Popen)`),
	regexp.MustCompile(`\beval\s*\(`),
	regexp.MustCompile(`\bexec\s*\(`),
	regexp.MustCompile(`DROP\s+TABLE`),
	regexp.MustCompile(`TRUNCATE\s+TABLE`),
	regexp.MustCompile(`DELETE\s+FROM\s+\w+\s*;`), // DELETE without WHERE
	regexp.MustCompile(`__import__\s*\(`),
}

func RegisterSandboxExecutorTool(server *mcp.Server) {
	server.AddTool(mcp.Tool{
		Name:        "sandbox_execute_code",
		Description: "Executes code in an isolated Docker sandbox with strict resource limits. All CODE_EXECUTION agent actions must route through this tool. Never call this without first passing the code through the Protector agent review.",
		InputSchema: mcp.MustGenerateSchema[SandboxExecParams](),
	}, handleSandboxExec)
}

func handleSandboxExec(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var params SandboxExecParams
	if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
	}

	result := SandboxExecResult{SessionID: params.SessionID}

	// Apply defaults
	if params.TimeoutSecs == 0 || params.TimeoutSecs > 30 {
		params.TimeoutSecs = 10
	}

	// Static deny-list check (fast pre-filter)
	for _, pattern := range denyPatterns {
		if pattern.MatchString(params.Code) {
			result.Success = false
			result.BlockedBy = fmt.Sprintf("static_analysis: matched deny pattern %q", pattern.String())
			return marshalSandboxResult(result)
		}
	}

	// Language allow-list
	if params.Language != "python" && params.Language != "bash" {
		result.Success = false
		result.BlockedBy = fmt.Sprintf("language %q is not in the allow-list (python, bash)", params.Language)
		return marshalSandboxResult(result)
	}

	// Execute in Docker sandbox
	// Security flags:
	//   --network none          = no outbound network
	//   --read-only             = immutable container filesystem
	//   --tmpfs /workspace      = writable scratch space, destroyed on exit
	//   --memory 512m           = memory cap
	//   --cpus 1                = CPU cap
	//   --cap-drop ALL          = drop all Linux capabilities
	//   --no-new-privileges     = prevent privilege escalation
	//   --rm                    = auto-remove container on exit
	cmdArgs := []string{
		"docker", "run",
		"--rm",
		"--network", "none",
		"--read-only",
		"--tmpfs", "/workspace:rw,size=100m",
		"--memory", "512m",
		"--cpus", "1",
		"--cap-drop", "ALL",
		"--no-new-privileges",
		"-w", "/workspace",
	}

	switch params.Language {
	case "python":
		cmdArgs = append(cmdArgs, "python:3.12-slim", "python3", "-c", params.Code)
	case "bash":
		cmdArgs = append(cmdArgs, "ubuntu:24.04", "bash", "-c", params.Code)
	}

	execCtx, cancel := context.WithTimeout(ctx, time.Duration(params.TimeoutSecs)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(execCtx, cmdArgs[0], cmdArgs[1:]...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	if execCtx.Err() == context.DeadlineExceeded {
		result.TimedOut = true
		result.Success = false
		result.ErrorSummary = fmt.Sprintf("execution timed out after %ds", params.TimeoutSecs)
		return marshalSandboxResult(result)
	}

	result.ExitCode = cmd.ProcessState.ExitCode()
	result.Success = err == nil

	// Sanitise and truncate stdout — strip system paths, env vars
	rawOut := stdout.String()
	result.Stdout = sanitiseOutput(truncate(rawOut, 2000))

	if err != nil {
		// Sanitise stderr — never return raw stderr to the LLM
		rawErr := stderr.String()
		result.ErrorSummary = sanitiseOutput(truncate(rawErr, 500))
	}

	return marshalSandboxResult(result)
}

// sanitiseOutput strips file system paths and env variable patterns.
func sanitiseOutput(s string) string {
	// Remove absolute paths (basic heuristic — extend for your environment)
	pathPattern := regexp.MustCompile(`(/[a-zA-Z0-9._/-]+)+`)
	s = pathPattern.ReplaceAllString(s, "[PATH_REDACTED]")
	// Remove potential credential patterns (basic: KEY=VALUE with long values)
	credPattern := regexp.MustCompile(`[A-Z_]{4,}=[A-Za-z0-9+/=]{20,}`)
	s = credPattern.ReplaceAllString(s, "[CREDENTIAL_REDACTED]")
	return strings.TrimSpace(s)
}

func truncate(s string, maxChars int) string {
	runes := []rune(s)
	if len(runes) > maxChars {
		return string(runes[:maxChars]) + "\n[OUTPUT TRUNCATED]"
	}
	return s
}

func marshalSandboxResult(result SandboxExecResult) (*mcp.CallToolResult, error) {
	output, err := json.Marshal(result)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal error: %v", err)), nil
	}
	return mcp.NewToolResultText(string(output)), nil
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`code-execution-pattern`](../data-analyst/code-execution-pattern.md) | Data Analyst | All code execution from this skill routes through sandboxing-defense |
| [`react-pattern`](../researcher/react-pattern.md) | Researcher | Sandboxed result is returned as an Observation in the ReAct loop |
| [`injection-defense`](./injection-defense.md) | Protector | Companion skill — handles prompt injection in LLM inputs, not code execution |
| [`non-determinism-handling`](./non-determinism-handling.md) | Protector | Sandboxing contains the blast radius of non-deterministic outputs |
| [`human-in-the-loop`](../compliance/human-in-the-loop.md) | Compliance | Any execution blocked by sandboxing-defense escalates to HITL |

---

## 📊 Evaluation Checklist

Before considering this skill "production-ready" in your system:

- [ ] Docker sandbox tested with adversarial inputs: `rm -rf /`, `env`, `cat /etc/passwd`  — all blocked
- [ ] Execution timeout enforced at infrastructure level, not just in code logic
- [ ] Stdout sanitisation tested — no file paths or environment variables leak to LLM
- [ ] `--network none` verified — outbound network call from inside sandbox returns connection error
- [ ] Memory and CPU limits verified — a `while True: pass` loop is killed within the timeout
- [ ] Static deny-list covers all patterns relevant to your environment (extend for your stack)
- [ ] Container auto-removed after every execution (`--rm` flag confirmed active)
- [ ] Cost per execution estimated and included in per-task budget

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — Sandboxing Defense |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "The 'rm -rf' Problem: Security & Sandboxing" section.*
*Template version: v1.0.0 — see [`_template/SKILL_TEMPLATE.md`](../../_template/SKILL_TEMPLATE.md)*
