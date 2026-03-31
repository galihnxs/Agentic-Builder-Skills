# Skill: Sandbox Setup

**Role:** Data Analyst + AI Architect
**Phase:** Design → Integration
**Autonomy Level:** Low
**Layer:** Tool Layer (Go MCP)

---

## 📖 What is it?

Sandbox Setup is the infrastructure configuration skill that establishes the isolated execution environment all code-generating agents depend on. It defines which images to maintain, which libraries to pre-bake, what filesystem boundaries to enforce, and how to manage the lifecycle (warm pool vs. on-demand) of execution containers. Without this groundwork, the [`sandboxing-defense`](../protector/sandboxing-defense.md) skill has no environment to enforce, and the [`code-execution-pattern`](./code-execution-pattern.md) has nowhere to run.

This skill is a one-time setup per environment (dev/staging/prod) with ongoing maintenance as library requirements evolve.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** A misconfigured sandbox is worse than no sandbox — it creates false confidence. Getting this right once means every code-executing agent in the system is protected by the same hardened environment.
- **Cost implication:** Pre-baked Docker images with dependencies eliminate library installation at runtime (saves 30–60s per cold start, plus CDN egress costs from repeated pip installs). Warm pool for high-frequency agents reduces cold start latency by 90%.
- **Latency implication:** Cold start from scratch: 5–15s. From pre-baked image: 1–3s. From warm pool: 100–300ms. Choose based on your SLA.
- **When to skip this:** You are using a managed sandbox service (E2B, Modal) that handles all of this for you. In that case, this skill reduces to: configure API keys, test the integration, set timeouts.

---

## 🛠️ How it Works (The Engineering Perspective)

**Dockerfile — Python Data Analyst Sandbox:**

```dockerfile
# File: docker/analyst-sandbox/Dockerfile
# Pre-baked sandbox image for the Data Analyst agent.
# NO network access at runtime — all libraries must be pre-installed here.

FROM python:3.12-slim

# Security: run as non-root user
RUN useradd -m -u 1000 -s /bin/bash analyst
WORKDIR /workspace
RUN chown analyst:analyst /workspace

# Pre-install all libraries the Data Analyst may use
# Update this list only through a PR review process
RUN pip install --no-cache-dir \
    pandas==2.2.0 \
    numpy==1.26.4 \
    scipy==1.12.0 \
    statsmodels==0.14.1 \
    matplotlib==3.8.3 \
    openpyxl==3.1.2

# Remove pip and package managers — no runtime installs
RUN pip uninstall -y pip setuptools wheel

# Switch to non-root
USER analyst

# Execution entrypoint — scripts are passed via stdin or /workspace/script.py
CMD ["python3"]
```

**Docker Run Command (enforced by sandbox_execute_code tool):**

```bash
docker run \
  --rm \                          # auto-remove after exit
  --network none \                # no outbound network
  --read-only \                   # immutable container filesystem
  --tmpfs /workspace:rw,size=100m \ # writable scratch, destroyed on exit
  --memory 512m \                 # memory cap
  --cpus 1 \                      # CPU cap
  --cap-drop ALL \                # drop all Linux capabilities
  --no-new-privileges \           # prevent privilege escalation
  --security-opt no-new-privileges:true \
  -u 1000 \                       # run as non-root analyst user
  analyst-sandbox:latest \
  python3 -c "SCRIPT_CONTENT"
```

**Warm Pool Configuration (Go):**

```go
// File: internal/sandbox/pool.go
// Pre-allocates N warm sandbox containers to eliminate cold start latency.
// For high-frequency Data Analyst workloads (>10 executions/min).

package sandbox

import (
	"context"
	"fmt"
	"os/exec"
	"sync"
)

const (
	DefaultPoolSize  = 3
	SandboxImageName = "analyst-sandbox:latest"
)

type Pool struct {
	mu        sync.Mutex
	available chan string // container IDs of warm, idle containers
	size      int
}

func NewPool(ctx context.Context, size int) (*Pool, error) {
	p := &Pool{
		available: make(chan string, size),
		size:      size,
	}
	for i := 0; i < size; i++ {
		id, err := spinUpContainer(ctx)
		if err != nil {
			return nil, fmt.Errorf("pool init failed at container %d: %w", i, err)
		}
		p.available <- id
	}
	return p, nil
}

// Acquire gets a warm container. Blocks until one is available.
func (p *Pool) Acquire() string {
	return <-p.available
}

// Release returns a container to the pool after resetting its workspace.
// If reset fails, spins up a fresh container instead.
func (p *Pool) Release(ctx context.Context, containerID string) {
	// Reset workspace: remove any files written during execution
	cmd := exec.CommandContext(ctx, "docker", "exec", containerID,
		"sh", "-c", "rm -rf /workspace/* 2>/dev/null; true")
	if err := cmd.Run(); err != nil {
		// Reset failed — destroy and replace with fresh container
		exec.Command("docker", "rm", "-f", containerID).Run()
		if newID, err := spinUpContainer(ctx); err == nil {
			p.available <- newID
		}
		return
	}
	p.available <- containerID
}

func spinUpContainer(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", "run",
		"-d", "--network", "none", "--read-only",
		"--tmpfs", "/workspace:rw,size=100m",
		"--memory", "512m", "--cpus", "1",
		"--cap-drop", "ALL", "--no-new-privileges",
		"-u", "1000",
		SandboxImageName,
		"sleep", "infinity", // keep alive until Acquire/Release cycle
	)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("docker run failed: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}
```

---

## ⚠️ Constraints & Guardrails

- **Never use `--privileged`** — this flag grants root-equivalent access to the host. There is no legitimate use case for privileged execution in an AI code sandbox.
- **Never bind-mount sensitive directories** — `/etc`, `/var`, `/home`, `/root` must never be mounted into the sandbox.
- **Update the image via PR** — adding a new library to the sandbox Dockerfile must go through code review. The library list is a security surface.
- **Audit the pre-installed libraries** — each library is a potential attack surface. Only install what the Data Analyst actually needs. Review quarterly.

---

## 📦 Ready-to-Use Artifact: Sandbox Health Check

```go
// File: internal/sandbox/healthcheck.go
// Run this before deploying to confirm the sandbox is correctly hardened.

package sandbox

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type HealthCheckResult struct {
	Test    string
	Passed  bool
	Details string
}

// RunHardening checks that the sandbox cannot escape its boundaries.
func RunHardeningChecks(ctx context.Context) []HealthCheckResult {
	tests := []struct {
		name string
		code string
		mustFail bool // true = this code SHOULD produce an error (the sandbox is working)
	}{
		{"network_blocked",    "import urllib.request; urllib.request.urlopen('http://example.com')", true},
		{"no_subprocess",      "import subprocess; subprocess.run(['ls'])", true},
		{"no_os_system",       "import os; os.system('ls')", true},
		{"no_root_access",     "open('/etc/passwd').read()", true},
		{"workspace_writable", "open('/workspace/test.txt','w').write('ok')", false},
		{"pandas_available",   "import pandas as pd; print(pd.__version__)", false},
	}

	results := make([]HealthCheckResult, 0, len(tests))
	for _, t := range tests {
		ctx2, cancel := context.WithTimeout(ctx, 10*time.Second)
		cmd := exec.CommandContext(ctx2, "docker", "run", "--rm",
			"--network", "none", "--read-only",
			"--tmpfs", "/workspace:rw,size=10m",
			"--memory", "128m", "--cpus", "0.5",
			"--cap-drop", "ALL", "--no-new-privileges",
			"-u", "1000",
			SandboxImageName,
			"python3", "-c", t.code,
		)
		out, err := cmd.CombinedOutput()
		cancel()

		passed := (err != nil) == t.mustFail
		results = append(results, HealthCheckResult{
			Test:    t.name,
			Passed:  passed,
			Details: fmt.Sprintf("exit_err=%v output=%.100s", err, strings.TrimSpace(string(out))),
		})
	}
	return results
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Defense uses this environment; setup makes it safe |
| [`code-execution-pattern`](./code-execution-pattern.md) | Data Analyst | Code execution runs inside this sandbox |
| [`mcp-integration`](../architect/mcp-integration.md) | Architect | The sandbox tool is registered as an MCP server tool |

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Grounded in Andrew Ng's Agentic AI course — "The 'rm -rf' Problem" and "Docker/E2B sandboxing" sections.*
*Template version: v1.0.0*
