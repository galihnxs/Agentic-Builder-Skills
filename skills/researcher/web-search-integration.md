# Skill: Web Search Integration

**Role:** Researcher
**Phase:** Execution
**Autonomy Level:** Semi
**Layer:** Tool Layer (Go MCP)

---

## 📖 What is it?

Web Search Integration is the pattern for giving an agent access to real-time public information via a search API — the most common external tool in agentic systems. The LLM uses it to ground answers in current events, verify facts against live sources, and retrieve information that post-dates its training cutoff. The tool follows the ReAct pattern: the LLM decides when to search, what to query, and how to incorporate the result.

The implementation choice matters: general search engines (Google, Bing) return broad results optimised for human browsing. LLM-compatible search APIs (Tavily, Exa, Brave Search) return structured, LLM-ready summaries with direct content extraction — significantly reducing the token cost of processing results.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Agents without web search are frozen at their training cutoff. An agent that can search retrieves current pricing, recent research, live product information, and breaking news — making it useful for a far broader class of tasks.
- **Cost implication:** Search API cost (Tavily: ~$0.001–0.005/query, Bing: ~$0.003/query) is often the dominant per-task cost — not the LLM tokens. Benchmark your search call frequency against the LLM token cost before optimising the wrong thing.
- **Latency implication:** Web search adds 500ms–2s per call. For user-facing flows, pre-fetch in parallel with other steps where possible. For background research tasks, latency is less critical than result quality.
- **When to skip this:** The answer is in the private knowledge base (use [`rag-skill`](./rag-skill.md) instead). Or the task requires information only available behind an authenticated API (use a dedicated tool, not web search).

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A search API key (Tavily recommended for LLM pipelines; Bing as fallback)
- A `max_results` limit and a `max_content_chars` limit per result to prevent context explosion
- Integration with the [`react-pattern`](./react-pattern.md) loop as a callable tool

**Workflow:**

1. **Query construction** — The LLM generates a specific, targeted search query (not the raw user question). Good: `"OpenAI GPT-4o pricing 2026"`. Bad: `"tell me about OpenAI"`. The query string directly determines result quality.
2. **API call** — Pass the query to the search API with `max_results=5` and `include_raw_content=false` (use snippet extraction, not full page HTML).
3. **Filter results** — Discard results older than the specified `date_range_days`. Discard results from known low-quality domains (content farms, SEO spam sites).
4. **Extract and truncate** — For each result: extract title, URL, snippet, and date. Truncate content to `max_content_chars` (recommended: 500 chars per result). Never pass full HTML to the LLM.
5. **Format as Observation** — Structure the search results as a clean JSON array. Each item: `{title, url, snippet, date, domain}`. This is the Observation returned to the ReAct loop.
6. **LLM incorporates** — The LLM reads the Observation, extracts relevant facts, and either calls another search (different query) or proceeds to the final answer.

**Failure modes to watch:**
- `VagueQuery` — Caused by: the LLM passing the raw user question as the search query instead of a targeted keyword query. Fix: include a query construction instruction in the ReAct system prompt: "Search queries must be 2–6 words targeting the specific fact needed, not the full question."
- `ContextExplosion` — Caused by: passing full page content (10,000+ tokens) from web fetch as the Observation. Fix: always use snippet extraction or apply `max_content_chars=500` before returning results.
- `StaleResults` — Caused by: the search API returning results from 2–3 years ago for a question about current events. Fix: apply `date_range_days=30` for current-events queries; use `recency` sort parameter where available.
- `SingleSourceBias` — Caused by: the LLM treating one search result as definitive. Fix: require at least 2 results to agree before treating a fact as confirmed, especially for numerical claims.

**Integration touchpoints:**
- Receives from: [`react-pattern`](./react-pattern.md) — web search is a tool in the ReAct loop
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — search results are the external feedback signal
- Alternative to: [`rag-skill`](./rag-skill.md) — use RAG for private knowledge, web search for public knowledge

---

## ⚠️ Constraints & Guardrails

- **Context window:** 5 search results × 500 chars each = ~2,500 chars ≈ 600 tokens. Always cap content per result. Never pass full HTML — it can exceed the entire context window of most models.
- **Cost ceiling:** Tavily: $0.001/query on the free tier, $0.0005 on paid. At 10 searches per task and 10,000 daily tasks, that's $50–$100/day in search costs alone. Benchmark and budget before launch.
- **Model requirement:** Not applicable to the tool itself. The LLM calling this tool must support native function calling.
- **Non-determinism:** Search results change over time. The same query on different days may return different results, producing different answers. For reproducibility, log the search results in the session state.
- **Human gate required:** No — for standard read-only web search. Yes — if search results are being used to draft content that will be published (to prevent hallucinated citations or misinformation).

---

## 📦 Ready-to-Use Artifact: Web Search MCP Tool (Go)

### Option C · Go MCP Tool (Tool Layer)

```go
// File: internal/tools/web_search.go
// Web search tool using Tavily API (LLM-optimised search).
// Swap the API call for Bing/Brave/Exa by changing the HTTP request block.
// Requires: modelcontextprotocol/go-sdk v1.2.0+

package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type WebSearchParams struct {
	Query         string `json:"query"           description:"2-6 word targeted search query. NOT the raw user question."`
	MaxResults    int    `json:"max_results"     description:"Number of results to return. Default: 5, Max: 10"`
	DateRangeDays int    `json:"date_range_days" description:"Only return results from the last N days. 0 = no filter. Default: 0"`
	Topic         string `json:"topic"           description:"Optional topic hint: 'news' | 'finance' | 'science' | 'general'. Default: general"`
}

type SearchResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
	Date    string `json:"date"`
	Domain  string `json:"domain"`
}

type WebSearchResult struct {
	Query   string         `json:"query"`
	Results []SearchResult `json:"results"`
	Count   int            `json:"count"`
}

const maxSnippetChars = 500

func RegisterWebSearchTool(server *mcp.Server) {
	server.AddTool(mcp.Tool{
		Name:        "web_search",
		Description: "Search the public web for current information. Use for: recent events, live data, public facts post-dating training cutoff. Prefer rag_query for private/internal knowledge.",
		InputSchema: mcp.MustGenerateSchema[WebSearchParams](),
	}, handleWebSearch)
}

func handleWebSearch(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	var params WebSearchParams
	if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
	}

	// Apply defaults
	if params.MaxResults == 0 { params.MaxResults = 5 }
	if params.MaxResults > 10 { params.MaxResults = 10 }
	if params.Topic == "" { params.Topic = "general" }

	apiKey := os.Getenv("TAVILY_API_KEY")
	if apiKey == "" {
		return mcp.NewToolResultError("TAVILY_API_KEY not set"), nil
	}

	// Build Tavily API request
	reqBody := map[string]any{
		"query":            params.Query,
		"max_results":      params.MaxResults,
		"search_depth":     "basic",
		"include_answer":   false,
		"include_raw_content": false,
		"topic":            params.Topic,
	}
	if params.DateRangeDays > 0 {
		since := time.Now().AddDate(0, 0, -params.DateRangeDays).Format("2006-01-02")
		reqBody["days"] = params.DateRangeDays
		_ = since
	}

	bodyBytes, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", "https://api.tavily.com/search", strings.NewReader(string(bodyBytes)))
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("request build error: %v", err)), nil
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("search API error: %v", err)), nil
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)

	var tavilyResp struct {
		Results []struct {
			Title   string `json:"title"`
			URL     string `json:"url"`
			Content string `json:"content"`
			PublishedDate string `json:"published_date"`
		} `json:"results"`
	}
	if err := json.Unmarshal(respBytes, &tavilyResp); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("parse error: %v", err)), nil
	}

	results := make([]SearchResult, 0, len(tavilyResp.Results))
	for _, r := range tavilyResp.Results {
		snippet := r.Content
		if len(snippet) > maxSnippetChars {
			snippet = snippet[:maxSnippetChars] + "..."
		}
		domain := extractDomain(r.URL)
		results = append(results, SearchResult{
			Title:   r.Title,
			URL:     r.URL,
			Snippet: snippet,
			Date:    r.PublishedDate,
			Domain:  domain,
		})
	}

	output, _ := json.Marshal(WebSearchResult{
		Query:   params.Query,
		Results: results,
		Count:   len(results),
	})
	return mcp.NewToolResultText(string(output)), nil
}

func extractDomain(rawURL string) string {
	// Simple domain extraction — replace with net/url.Parse for production
	rawURL = strings.TrimPrefix(rawURL, "https://")
	rawURL = strings.TrimPrefix(rawURL, "http://")
	parts := strings.SplitN(rawURL, "/", 2)
	return parts[0]
}
```

---

## 🔗 Related Skills

| Skill | Role | Relationship |
|---|---|---|
| [`react-pattern`](./react-pattern.md) | Researcher | Web search is a tool invoked within the ReAct loop |
| [`rag-skill`](./rag-skill.md) | Researcher | Complement: RAG for private knowledge, web search for public |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | Search result quality is the primary external feedback signal |
| [`cost-latency-tradeoffs`](../product-manager/cost-latency-tradeoffs.md) | Product Manager | Search API cost is often the dominant per-task cost |

---

## 📊 Evaluation Checklist

- [ ] Query construction tested — LLM produces targeted 2–6 word queries, not raw user questions
- [ ] Snippet truncation verified — no result exceeds 500 chars in the Observation
- [ ] Date filter tested — stale results excluded when `date_range_days` is set
- [ ] API key stored in environment variable — never hardcoded
- [ ] Cost per search call measured and included in per-task budget
- [ ] Fallback behaviour defined — if search API is unavailable, agent logs error and continues

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page — Tavily integration |

---

*Source: Andrew Ng's Agentic AI course — "Tool Integration: Connecting agents to arXiv and web search tools like Tavily" section.*
*Template version: v1.0.0*
