# Skill: RAG Skill (Retrieval-Augmented Generation)

**Role:** Researcher
**Phase:** Execution
**Autonomy Level:** Low → Semi
**Layer:** Tool Layer (Go MCP) + Skill Layer (Markdown/JSON)

---

## 📖 What is it?

The RAG Skill is a three-step retrieval pipeline — **Embed → Lookup → Generate** — that lets an LLM answer questions grounded in a private, domain-specific knowledge base rather than its training data alone. The user's query is embedded into a vector, matched against a pre-indexed corpus of documents in a vector database, and the retrieved context is passed to the LLM alongside the original query.

RAG is the standard pattern for giving agents access to internal knowledge: product documentation, research papers, customer records, past assessment reports. Without RAG, the LLM either hallucinates domain-specific answers or admits it doesn't know. With RAG, it grounds answers in the actual documents — with citations.

---

## 💡 Why it Matters (The PM Perspective)

- **Business impact:** Enables agents to answer questions about internal, proprietary, or recently updated information without a model retrain. For Coreitera, this means Career Compass reports can cite actual psychometric literature stored in the knowledge base.
- **Cost implication:** RAG replaces fine-tuning (expensive, one-time) with retrieval (cheap, real-time). A single RAG call costs ~$0.001–0.005 in embedding + retrieval overhead. Fine-tuning the same knowledge costs $100–10,000+.
- **Latency implication:** Embedding + vector lookup adds ~100–300ms per query. Use approximate nearest-neighbor search (HNSW index) for lookup — exact search on large corpora is too slow for user-facing flows.
- **When to skip this:** The LLM already knows the answer reliably from training (common knowledge, public facts). RAG adds latency and cost with no quality benefit when the knowledge is already in the model.

---

## 🛠️ How it Works (The Engineering Perspective)

**Prerequisites:**
- A vector database (pgvector, Qdrant, Weaviate, or Pinecone)
- An embedding model (OpenAI `text-embedding-3-small`, or a local model via Ollama)
- A pre-indexed corpus: documents chunked, embedded, and stored with metadata

**Workflow:**

1. **Embed the query** — Pass the user's query to the embedding model. Returns a vector of floats (e.g., 1536 dimensions for OpenAI's model).
2. **Vector lookup** — Query the vector database for the top-K most semantically similar chunks. K = 3–5 for focused answers, K = 10–15 for research synthesis. Include metadata (document title, source, date) in the retrieved chunks.
3. **Filter by threshold** — Discard chunks with a cosine similarity below the minimum threshold (recommended: 0.75). Low-similarity chunks add noise, not signal.
4. **Build augmented prompt** — Construct the LLM prompt: system instructions + retrieved chunks (as context) + original user query. Format: each chunk preceded by its metadata citation.
5. **Generate with grounding instruction** — Instruct the LLM: "Answer ONLY from the provided context. If the context does not contain the answer, say so explicitly — do not guess."
6. **Return with citations** — The output includes the answer and the source citations from the retrieved chunks.

**Failure modes to watch:**
- `HallucinationLeakage` — Caused by: not enforcing the "answer only from context" constraint. The LLM supplements retrieved context with training knowledge. Fix: include an explicit negative constraint in the system prompt ("Do NOT use knowledge outside the provided context").
- `ChunkBoundaryLoss` — Caused by: chunks that cut mid-sentence or mid-concept, losing critical context. Fix: use semantic chunking (split on paragraph or section boundaries) rather than fixed-character chunking.
- `LowSimilarityNoise` — Caused by: including retrieved chunks with similarity < 0.75, which add irrelevant context that confuses the LLM. Fix: apply the similarity threshold filter before building the prompt.
- `StaleKnowledgeBase` — Caused by: the vector index not being updated when source documents change. Fix: implement an incremental update pipeline — new or modified documents trigger a re-embedding and re-index job.

**Integration touchpoints:**
- Receives from: [`react-pattern`](./react-pattern.md) — RAG is invoked as a tool within a ReAct loop
- Feeds into: [`reflection-pattern`](../evaluator/reflection-pattern.md) — RAG output should pass through reflection before reaching the user
- Required by: [`web-search-integration`](./web-search-integration.md) — when the query requires both private (RAG) and public (web) knowledge

---

## ⚠️ Constraints & Guardrails

- **Context window:** Retrieved chunks consume the LLM's context. K=5 chunks of 500 tokens each = 2,500 tokens of context overhead. For large K values, use a reranking step to select the most relevant 3 chunks from the top-10 retrieved.
- **Cost ceiling:** Embedding cost ≈ $0.00002 per 1K tokens (OpenAI `text-embedding-3-small`). For a 10M-token corpus, indexing costs ~$0.20. Retrieval is a database query — effectively free.
- **Model requirement:** Any LLM works for the generation step. The embedding model must match between indexing time and query time — never mix embedding models.
- **Non-determinism:** Vector lookup is deterministic for the same query and index. LLM generation is non-deterministic. Use `temperature=0` for factual RAG responses where consistency matters.
- **Human gate required:** No — for standard RAG. Yes — if the knowledge base contains sensitive data (PII, clinical records). Access control must be enforced at the retrieval layer.

---

## 📦 Ready-to-Use Artifact: RAG System Prompt + Go MCP Tool

### Option A · System Prompt (Skill Layer)

```markdown
## Role
You are the Knowledge Retriever. Your single responsibility is:
Answer the user's question using ONLY the provided context chunks.
You never answer from memory when context is provided.

## Context
The following chunks have been retrieved from the knowledge base as the most relevant to the query.
Each chunk includes its source citation.

{{RETRIEVED_CHUNKS}}

Format of each chunk:
[Source: {document_title} | Date: {date} | Relevance: {similarity_score}]
{chunk_text}

## Rules
1. Answer ONLY from the provided context. Do not use knowledge outside these chunks.
2. If the context does not contain enough information to answer, respond: "The knowledge base does not contain sufficient information to answer this question. Suggested next step: [web search / ask a human expert]."
3. Cite the source for every factual claim: "According to [document_title]..."
4. If chunks contradict each other, surface the contradiction: "Source A states X while Source B states Y."
5. Do NOT summarise the chunks — answer the specific question asked.

## Output Format
{
  "answer": "The grounded answer to the question",
  "citations": ["document_title_1", "document_title_2"],
  "confidence": "high | medium | low",
  "coverage": "full | partial | insufficient",
  "suggested_next_step": "null | web_search | human_expert | expand_query"
}
```

### Option C · Go MCP Tool (Tool Layer)

```go
// File: internal/tools/rag_retriever.go
// RAG retrieval tool: embeds query, queries vector DB, returns top-K chunks.
// Requires: your vector DB client (pgvector, qdrant, etc.)

package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type RAGQueryParams struct {
	Query             string  `json:"query"               description:"The question or topic to retrieve context for"`
	TopK              int     `json:"top_k"               description:"Number of chunks to retrieve. Default: 5, Max: 15"`
	SimilarityThreshold float64 `json:"similarity_threshold" description:"Minimum cosine similarity to include a chunk. Default: 0.75"`
	FilterByDate      *string `json:"filter_by_date"       description:"Optional: only retrieve chunks from documents updated after this date (ISO format)"`
	FilterByTag       *string `json:"filter_by_tag"        description:"Optional: only retrieve chunks tagged with this value"`
}

type RetrievedChunk struct {
	ChunkID     string  `json:"chunk_id"`
	DocumentTitle string `json:"document_title"`
	Source      string  `json:"source"`
	Date        string  `json:"date"`
	Text        string  `json:"text"`
	Similarity  float64 `json:"similarity"`
}

type RAGQueryResult struct {
	Chunks    []RetrievedChunk `json:"chunks"`
	Count     int              `json:"count"`
	QueryUsed string           `json:"query_used"`
}

func RegisterRAGRetrieverTool(server *mcp.Server, embedFn func(ctx context.Context, text string) ([]float64, error), queryFn func(ctx context.Context, vector []float64, topK int, threshold float64) ([]RetrievedChunk, error)) {
	server.AddTool(mcp.Tool{
		Name:        "rag_query",
		Description: "Retrieves the most semantically relevant chunks from the private knowledge base for a given query. Use when the question requires domain-specific or internal knowledge not available via web search.",
		InputSchema: mcp.MustGenerateSchema[RAGQueryParams](),
	}, func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return handleRAGQuery(ctx, req, embedFn, queryFn)
	})
}

func handleRAGQuery(ctx context.Context, req mcp.CallToolRequest, embedFn func(context.Context, string) ([]float64, error), queryFn func(context.Context, []float64, int, float64) ([]RetrievedChunk, error)) (*mcp.CallToolResult, error) {
	var params RAGQueryParams
	if err := json.Unmarshal(req.Params.Arguments, &params); err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("invalid params: %v", err)), nil
	}

	// Apply defaults
	if params.TopK == 0 { params.TopK = 5 }
	if params.TopK > 15 { params.TopK = 15 }
	if params.SimilarityThreshold == 0 { params.SimilarityThreshold = 0.75 }

	// Step 1: Embed the query
	vector, err := embedFn(ctx, params.Query)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("embedding failed: %v", err)), nil
	}

	// Step 2: Query vector DB
	chunks, err := queryFn(ctx, vector, params.TopK, params.SimilarityThreshold)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("vector query failed: %v", err)), nil
	}

	result := RAGQueryResult{
		Chunks:    chunks,
		Count:     len(chunks),
		QueryUsed: params.Query,
	}

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
| [`react-pattern`](./react-pattern.md) | Researcher | RAG is invoked as a tool within the ReAct loop |
| [`web-search-integration`](./web-search-integration.md) | Researcher | Complement: RAG for private knowledge, web search for public knowledge |
| [`reflection-pattern`](../evaluator/reflection-pattern.md) | Evaluator | RAG output should pass through reflection before user delivery |
| [`state-observability`](../architect/state-observability.md) | Architect | Each RAG call (embed + query) is a traceable span |

---

## 📊 Evaluation Checklist

- [ ] Embedding model is identical between indexing time and query time
- [ ] Similarity threshold tested — chunks below 0.75 excluded from prompts
- [ ] "Answer only from context" constraint verified — LLM does not supplement with training knowledge
- [ ] Stale index detection implemented — alerts when source documents are updated
- [ ] Chunk boundary quality verified — no mid-sentence splits in 20-sample audit
- [ ] Retrieval accuracy tested: 20 queries with known ground truth source documents

---

## 📝 Changelog

| Version | Date | Change |
|---|---|---|
| v1.0.0 | 2026-03-31 | Initial skill page |

---

*Source: Andrew Ng's Agentic AI course — "Common skill: A RAG Skill" and "Skills" sections.*
*Template version: v1.0.0*
