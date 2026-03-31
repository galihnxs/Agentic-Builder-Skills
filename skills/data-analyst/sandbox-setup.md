# Skill: Sandbox Setup

**Role:** Data Analyst (Coder)
**Phase:** Design → Integration
**Autonomy Level:** Low (infrastructure)
**Layer:** Tool Layer (Go MCP)

---

## 📖 What is it?

Sandbox Setup is the infrastructure configuration skill that defines the execution environment for LLM-generated code. It specifies which Python libraries are pre-installed, what filesystem paths are accessible, what network destinations are whitelisted, and what resource limits apply. A well-configured sandbox is what makes the [`code-execution-pattern`](./code-execution-pattern.md) safe to run in production — it is the difference between "the LLM can write code" and "the LLM can write code that can't hurt us."

This is not a runtime pattern — it is a build-time decision made once by the Architect/Data Analyst pair and locked into the deployment configuration. Changes to the sandbox environment require a deliberate review, not a prompt edit.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** The sandbox environment determines what analytical capabilities the Data Analyst agent has. A sandbox with only `math` and `json` supports basic calculations. A sandbox with `pandas`, `numpy`, and `matplotlib` supports full data analysis and charting. Capability decisions are sandbox decisions.
- **Cost implication:** Pre-installing libraries in a Docker image makes sandbox cold-start fast (~200ms) vs. installing on every run (~10–30s). The image build cost is one-time; the per-run cost is minimal. Always pre-install, never install-on-demand.
- **Latency implication:** Warm sandbox pools (pre-started container instances) reduce cold-start latency from 2–5s to <200ms for the first execution in a session. Critical for user-facing analytical flows.
- **When to skip this:** Never skip sandbox configuration. A code execution environment with no explicit configuration is an uncontrolled execution environment.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- Docker installed on the execution host
- A base Python image (python:3.12-slim recommended)
- An approved library list signed off by the Architect and Data Analyst

**Workflow:**

1. **Define the library allow-list** — List every Python library the Data Analyst agent needs. This list goes into both the Dockerfile (for installation) and the agent system prompt (as the explicit allow-list).
2. **Build the sandbox image** — Create a Dockerfile that installs exactly the approved libraries. Pin all versions (`pandas==2.2.0`) — never use unpinned installs.
3. **Configure resource limits** — Set memory, CPU, and timeout limits in the Docker run configuration. These are enforced at the infrastructure level, not by the LLM.
4. **Configure filesystem access** — The sandbox has read-write access to `/workspace` only. All other paths are read-only or inaccessible.
5. **Configure network access** — `--network none` by default. If the agent needs to call an internal API, whitelist the specific IP/hostname via a custom Docker network — never open general internet access.
6. **Test adversarially** — Before production: attempt `rm -rf /`, `import os; os.system("env")`, `import requests; requests.get("https://attacker.com")`. All must be blocked.
7. **Document and lock** — The sandbox configuration is a versioned artifact. Changes require a PR and security review.

**Failure modes to watch:**
- `LibraryCreep` — Caused by: adding libraries ad hoc without updating the system prompt allow-list. Fix: the Dockerfile and the system prompt allow-list must always be in sync. Enforce via CI.
- `UnpinnedDependencies` — Caused by: using `pip install pandas` without a version pin. A library update can silently break existing agent code. Fix: pin all versions. Update deliberately, not accidentally.
- `WarmPoolDrift` — Caused by: warm sandbox containers using a stale image after a Dockerfile update. Fix: on image rebuild, drain the warm pool and rebuild all instances.
- `NetworkWhitelistExpansion` — Caused by: developers adding network exceptions for convenience without security review. Fix: any network change to the sandbox requires explicit Architect + security sign-off.

**Integration touchpoints:**
- Required by: [`code-execution-pattern`](./code-execution-pattern.md) — defines the environment where code runs
- Required by: [`sandboxing-defense`](../protector/sandboxing-defense.md) — the security layer configures on top of this environment
- Feeds into: [`self-healing-code`](./self-healing-code.md) — knowing the available libraries is essential for accurate error diagnosis

---

## ⚠️ Constraints & Guardrails

- **Context window:** The library allow-list in the system prompt should be ≤ 50 tokens. List names only, not versions — those are in the Dockerfile.
- **Cost ceiling:** Docker image storage: ~500MB–2GB depending on libraries. Negligible cost on cloud infrastructure. Warm pool: 2–5 pre-started containers per production instance. Size accordingly.
- **Model requirement:** Not applicable. Sandbox is model-agnostic.
- **Non-determinism:** The sandbox environment is fully deterministic. All non-determinism in code execution results comes from the LLM's code generation, not the execution environment.
- **Human gate required:** Yes — for any change to the sandbox configuration (library additions, network whitelist changes, resource limit increases). Document every change in the sandbox changelog.

---

## 📦 Ready-to-Use Artifact: Dockerfile + Docker Run Configuration

### Option C · Dockerfile + Run Config (Tool Layer)

```dockerfile
# File: docker/sandbox/Dockerfile
# Python sandbox for LLM-generated code execution.
# Build: docker build -t agent-sandbox:1.0.0 -f docker/sandbox/Dockerfile .
# NEVER add --privileged, --network host, or -v /:/host to the run command.

FROM python:3.12-slim

# Install only the approved library list. Pin ALL versions.
# To add a library: (1) add here, (2) update system prompt allow-list, (3) PR + review.
RUN pip install --no-cache-dir \
    pandas==2.2.2 \
    numpy==1.26.4 \
    matplotlib==3.9.0 \
    seaborn==0.13.2 \
    scipy==1.13.0 \
    scikit-learn==1.5.0 \
    openpyxl==3.1.2 \
    python-dateutil==2.9.0

# Create the workspace directory — this is the ONLY writable path
RUN mkdir /workspace && chmod 777 /workspace

# Drop to non-root user for additional security
RUN useradd -m -u 1001 sandbox
USER sandbox

WORKDIR /workspace

# Default entrypoint — overridden per execution
CMD ["python3"]
```

```bash
# File: scripts/run_sandbox.sh
# Executes one code string in the sandbox. Called by the Go MCP tool.
# Usage: ./run_sandbox.sh "print('hello')" 30
#
# Security flags explained:
#   --rm               Auto-remove container on exit — no persistent state
#   --network none     No outbound network access
#   --read-only        Immutable container filesystem (except /workspace tmpfs)
#   --tmpfs /workspace Writable scratch space, destroyed on container exit
#   --memory 512m      Memory cap — prevents memory exhaustion attacks
#   --cpus 1           CPU cap — prevents CPU exhaustion
#   --cap-drop ALL     Drop ALL Linux capabilities — minimum privilege
#   --no-new-privileges Prevent privilege escalation via setuid binaries
#   --pids-limit 64    Limit process spawning — prevents fork bombs

CODE="$1"
TIMEOUT="${2:-10}"

docker run \
  --rm \
  --network none \
  --read-only \
  --tmpfs /workspace:rw,size=100m,uid=1001 \
  --memory 512m \
  --memory-swap 512m \
  --cpus 1 \
  --cap-drop ALL \
  --no-new-privileges \
  --pids-limit 64 \
  --user 1001 \
  --workdir /workspace \
  --timeout "$TIMEOUT" \
  agent-sandbox:1.0.0 \
  python3 -c "$CODE"
```

```yaml
# File: config/sandbox.yaml
# Sandbox configuration — single source of truth.
# Changes require PR + Architect + security review.

version: "1.0.0"
image: "agent-sandbox:1.0.0"

resource_limits:
  memory_mb: 512
  cpu_cores: 1
  pids_limit: 64
  execution_timeout_secs: 30
  output_max_chars: 2000
  tmpfs_workspace_mb: 100

network:
  mode: "none"  # Options: none | custom_internal
  # If custom_internal, list allowed hosts:
  allowed_hosts: []

filesystem:
  writable_paths:
    - "/workspace"
  read_only: true

approved_libraries:
  - "pandas==2.2.2"
  - "numpy==1.26.4"
  - "matplotlib==3.9.0"
  - "seaborn==0.13.2"
  - "scipy==1.13.0"
  - "scikit-learn==1.5.0"
  - "openpyxl==3.1.2"
  - "python-dateutil==2.9.0"
  - "json"      # stdlib
  - "math"      # stdlib
  - "statistics" # stdlib
  - "datetime"  # stdlib
  - "re"        # stdlib
  - "csv"       # stdlib

warm_pool:
  enabled: true
  min_instances: 2
  max_instances: 10
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`code-execution-pattern`](./code-execution-pattern.md) | Data Analyst | The execution pattern runs inside the environment this skill configures |
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | Security layer built on top of this environment |
| [`self-healing-code`](./self-healing-code.md) | Data Analyst | Self-healing prompts reference the approved library list from this config |

---

## 📊 Evaluation Checklist

- [ ] Adversarial test: `rm -rf /` — blocked
- [ ] Adversarial test: `import os; os.system("env")` — blocked (os.system in deny-list)
- [ ] Adversarial test: `import requests; requests.get("https://evil.com")` — blocked (network=none)
- [ ] Adversarial test: `while True: pass` — killed within 30s timeout
- [ ] Adversarial test: `[x for x in range(10**9)]` — killed within memory limit
- [ ] Library version pins verified — no floating versions in Dockerfile
- [ ] Warm pool tested — cold-start <200ms on pre-warmed instances
- [ ] Config file versioned and change history in git log

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — Python 3.12-slim base |

---

*Source: Andrew Ng's Agentic AI course — "The 'rm -rf' Problem: Security & Sandboxing" and "Docker / E2B" sections.*
*Template version: v1.0.0*
