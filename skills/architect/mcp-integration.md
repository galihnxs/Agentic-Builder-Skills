# Skill: MCP Integration

**Role:** AI Architect
**Phase:** Integration
**Autonomy Level:** Low (infrastructure pattern)
**Layer:** Tool Layer (Go MCP)

---

## 📖 What is it?

MCP Integration is the architectural pattern for connecting your LLM application to external tools, data sources, and services using the **Model Context Protocol** — the open standard that acts as the "USB-C" for AI systems. Instead of writing a custom integration for every tool-to-LLM pair (the M × N problem), MCP provides a single interface: any MCP Host connects to any MCP Server instantly.

The protocol defines three roles: the **Host** (your LLM application), the **Client** (a lightweight component inside the Host that discovers server capabilities), and the **Server** (a wrapper around a specific tool or data source — a GitHub MCP Server, a Postgres MCP Server, a custom internal API). Resources are read-only data (files, records). Tools are active functions the LLM can invoke.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Solves the M × N integration tax. Before MCP, connecting 5 LLM apps to 10 tools required 50 custom integrations. With MCP, each app and each tool is built once to the standard — total integration work drops to M + N.
- **Cost implication:** The Model Context Protocol has become the critical standard in 2026. Building custom integrations for tools that already have MCP servers is waste. Audit your tool stack before writing any custom connectors.
- **Latency implication:** MCP communication over Stdio (local tools) adds < 5ms overhead. SSE/HTTP (remote tools) adds typical network latency. For latency-critical paths, prefer Stdio-transport MCP servers running as local processes.
- **When to skip this:** Internal tools that will never be reused by another LLM application. For true one-off, single-use integrations, a direct function call is faster to ship. Use MCP when the tool is a reusable capability.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- Go MCP SDK (`modelcontextprotocol/go-sdk v1.2.0+`)
- A defined tool with typed inputs and outputs (see Sandboxing Defense for execution tools)
- Transport decision: Stdio (local process) or SSE/HTTP (remote service)

**Workflow:**

1. **Define the tool schema** — Use Go structs with JSON tags. The SDK generates the MCP-compliant schema automatically from struct field types and `description` tags.
2. **Implement the handler** — A function that receives `mcp.CallToolRequest`, unmarshals params, executes the logic, and returns `mcp.CallToolResult`.
3. **Register with the server** — Call `server.AddTool()` with the tool definition and handler. The server exposes this to any MCP Host that connects.
4. **Choose transport** — Stdio for local tools (CLI assistants, local file access). SSE/HTTP for cloud tools (shared services, remote APIs).
5. **Host connects** — Your LLM application (MCP Host) discovers the server's tools via the `tools/list` endpoint. The tool definitions are injected into the LLM's context on demand.
6. **LLM invokes** — The LLM outputs a tool call. The Host routes it through the Client to the Server. The Server executes and returns the result.

**Failure modes to watch:**
- `SchemaValidationFail` — Caused by: LLM calling a tool with incorrect parameter types. Fix: use `mcp.MustGenerateSchema[T]()` — it produces strict JSON Schema from Go types. Never write schemas by hand.
- `TransportMismatch` — Caused by: using SSE transport for a tool that reads local files (creates network round-trip on every file read). Fix: Stdio for local tools, SSE/HTTP for remote services. Document the transport decision in the manifest.
- `ToolDiscoveryTimeout` — Caused by: Host attempting to enumerate too many servers at startup. Fix: lazy-load MCP servers — connect to a server only when a routing decision selects one of its tools.
- `VersionDrift` — Caused by: Host and Server using incompatible MCP protocol versions. Fix: pin the SDK version in `go.mod` and coordinate updates across Host and Server releases.

**Integration touchpoints:**
- Feeds into: [`skill-based-architecture`](./skill-based-architecture.md) — Tool Layer skills are exposed as MCP tools
- Feeds into: [`tool-orchestration`](./tool-orchestration.md) — the orchestrator dispatches to MCP tools
- Required by: [`react-pattern`](../researcher/react-pattern.md) — every tool in the ReAct loop is an MCP tool
- Required by: [`sandboxing-defense`](../protector/sandboxing-defense.md) — the sandbox executor is an MCP tool

---

## ⚠️ Constraints & Guardrails

- **Context window:** Tool definitions injected by MCP into the LLM context consume tokens. Each tool's schema is ~200–500 tokens. Keep individual tool descriptions tight — they are loaded on every relevant call.
- **Cost ceiling:** MCP adds no API cost overhead. The cost is the tool calls themselves (LLM tokens for input/output, plus any external API costs from the tool's implementation).
- **Model requirement:** Any model with native function-calling support works with MCP. The protocol is model-agnostic.
- **Non-determinism:** MCP servers are deterministic. The LLM deciding when and how to call them is not. Build idempotent tool handlers where possible — duplicate calls should not cause duplicate side effects.
- **Human gate required:** Yes — before registering a new MCP server in production. Each server added expands the LLM's action surface. Architect review is mandatory.

---

## 📦 Ready-to-Use Artifact: MCP Server Bootstrap (Go)

### Option C · Go MCP Server (Tool Layer)

```go
// File: cmd/mcp-server/main.go
// Bootstrap for a Go MCP server using the official SDK.
// Replace the example tool with your actual tool implementations.
// Requires: modelcontextprotocol/go-sdk v1.2.0+

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	// Import your tool packages here
	// "github.com/your-org/your-repo/internal/tools"
)

func main() {
	// Create the MCP server with metadata
	server := mcp.NewServer(
		"your-service-name",     // Server name — shown to MCP Hosts during discovery
		"1.0.0",                 // Server version
		mcp.WithServerInfo(mcp.Implementation{
			Name:    "Your Service MCP Server",
			Version: "1.0.0",
		}),
	)

	// Register your tools here
	// tools.RegisterSandboxExecutorTool(server)
	// tools.RegisterValidatePlanTool(server)
	// tools.RegisterReActExecutorTool(server, yourToolRegistry)
	registerExampleTool(server) // Replace with your real tools

	// Transport: Stdio (for local tools)
	// Use this when the MCP server runs as a local process alongside the Host.
	transport := mcp.NewStdioTransport()

	// Transport: SSE/HTTP (for remote/cloud tools)
	// Uncomment to serve over HTTP instead:
	// transport := mcp.NewSSETransport(":8080", "/mcp")

	log.Printf("MCP server starting (stdio transport)")
	if err := server.Serve(context.Background(), transport); err != nil {
		log.Fatalf("server error: %v", err)
		os.Exit(1)
	}
}

// ExampleToolParams — replace with your real tool's parameter struct.
type ExampleToolParams struct {
	Query  string `json:"query"   description:"The query to process"`
	Limit  int    `json:"limit"   description:"Maximum number of results to return. Default: 10"`
}

type ExampleToolResult struct {
	Results []string `json:"results"`
	Count   int      `json:"count"`
}

func registerExampleTool(server *mcp.Server) {
	server.AddTool(mcp.Tool{
		Name:        "example_tool",
		Description: "Replace this with your real tool. One sentence: what it does and when to call it.",
		InputSchema: mcp.MustGenerateSchema[ExampleToolParams](),
	}, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var params ExampleToolParams
		if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
		}
		if params.Limit == 0 {
			params.Limit = 10
		}
		// Replace with real logic
		result := ExampleToolResult{
			Results: []string{"result_1", "result_2"},
			Count:   2,
		}
		output, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(output)), nil
	})
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`skill-based-architecture`](./skill-based-architecture.md) | Architect | All Tool Layer skills are deployed as MCP servers |
| [`tool-orchestration`](./tool-orchestration.md) | Architect | Orchestration layer routes to MCP tools |
| [`sandboxing-defense`](../protector/sandboxing-defense.md) | Protector | The sandbox executor runs as an MCP tool |
| [`react-pattern`](../researcher/react-pattern.md) | Researcher | Every tool in the ReAct loop is an MCP tool invocation |

---

## 📊 Evaluation Checklist

- [ ] All tool schemas generated via `mcp.MustGenerateSchema[T]()` — no hand-written schemas
- [ ] Transport choice documented in the service README (Stdio vs SSE/HTTP and why)
- [ ] Tool discovery tested — Host correctly enumerates all registered tools on connect
- [ ] Idempotency verified for all side-effect tools — duplicate calls produce no duplicate effects
- [ ] SDK version pinned in `go.mod` — Host and Server on matching versions

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Model Context Protocol (MCP)" section. Official SDK: modelcontextprotocol/go-sdk v1.2.0.*
*Template version: v1.0.0*
