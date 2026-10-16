import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface IncomingDocument {
  id: string | number;
  documentType?: string;
  fileName?: string;
}

interface RuleRow {
  pattern: string;
  category_label: string;
  excludes: boolean;
  priority: number;
}

interface CategoryRow {
  label: string;
}

interface ClassificationResult {
  documentId: string;
  matchedCategory: string | null;
  confidence: number;
  source: "rule" | "llm" | "unverified";
  reason: string;
  documentType: string;
  fileName: string;
}

interface OpenAIItem {
  documentId: string;
  matchedCategory: string;
  confidence: number;
  reason: string;
}

function makeSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Tier 1: deterministic rule matching against the curated rules table.
// A document matches a category when a non-excludes rule's pattern appears
// (case-insensitive) in the documentType AND no higher-priority excludes rule
// for that same category also matches.
function classifyByRules(
  docType: string,
  rules: RuleRow[],
): { category: string | null; reason: string } | null {
  if (!docType.trim()) return null;
  const lower = docType.toLowerCase();
  const matched = rules
    .filter((r) => lower.includes(r.pattern.toLowerCase()))
    .sort((a, b) => b.priority - a.priority);

  if (matched.length === 0) return null;

  // First non-excludes match wins (highest priority among excludes=false).
  const positive = matched.find((r) => !r.excludes);
  if (positive) {
    return {
      category: positive.category_label,
      reason: `Rule: pattern "${positive.pattern}" → ${positive.category_label}`,
    };
  }
  // Only excludes matched — document is explicitly NOT any of those categories.
  return null;
}

// Tier 2: OpenAI structured output fallback for documents the rules couldn't resolve.
async function classifyByLLM(
  unresolved: IncomingDocument[],
  categories: string[],
): Promise<OpenAIItem[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return [];

  const docList = unresolved.map((d) => ({
    documentId: String(d.id),
    documentType: d.documentType || "",
    fileName: d.fileName || "",
  }));

  const schema = {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            matchedCategory: { type: "string", description: "One of the provided categories, or 'unmatched'" },
            confidence: { type: "number", description: "0.0 to 1.0" },
            reason: { type: "string", description: "One-line explanation" },
          },
          required: ["documentId", "matchedCategory", "confidence", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["results"],
    additionalProperties: false,
  };

  const systemPrompt = `You are a loan document classifier. Given a list of uploaded documents (each with a documentType and/or fileName) and a list of required document categories, classify each document into exactly one category. Match based on the semantic meaning of the document, not just keyword overlap. For example, a "Business Credit Report" is NOT a "Business Plan", and a "Personal Credit Report" is NOT a "Personal Financial Statement". If a document does not clearly match any category, return "unmatched" with low confidence. Return results for every document in the input list.`;

  const userPrompt = `Required categories: ${JSON.stringify(categories)}\n\nDocuments to classify:\n${JSON.stringify(docList)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_schema", json_schema: { name: "doc_classifications", schema, strict: true } },
      temperature: 0,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return [];
  const parsed = JSON.parse(content);
  return (parsed.results as OpenAIItem[]) ?? [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { loanId, documents }: { loanId: string; documents: IncomingDocument[] } = body;

    if (!loanId || !Array.isArray(documents)) {
      return new Response(
        JSON.stringify({ error: "Missing loanId or documents array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = makeSupabase();

    // Load categories and rules
    const [{ data: categoryRows }, { data: ruleRows }] = await Promise.all([
      supabase.from("document_categories").select("label").order("display_order"),
      supabase.from("document_category_rules").select("pattern, category_label, excludes, priority").order("priority", { ascending: false }),
    ]);

    const categories = ((categoryRows as CategoryRow[] | null) ?? []).map((c) => c.label);
    const rules = (ruleRows as RuleRow[] | null) ?? [];

    // Load cached classifications for this loan
    const { data: cached } = await supabase
      .from("document_classifications")
      .select("*")
      .eq("loan_id", loanId);

    const cachedMap = new Map<string, ClassificationResult>();
    for (const row of (cached ?? []) as Array<Record<string, unknown>>) {
      cachedMap.set(String(row.document_id), {
        documentId: String(row.document_id),
        matchedCategory: (row.matched_category as string) ?? null,
        confidence: Number(row.confidence ?? 1.0),
        source: (row.source as ClassificationResult["source"]) ?? "rule",
        reason: (row.reason as string) ?? "",
        documentType: (row.document_type as string) ?? "",
        fileName: (row.file_name as string) ?? "",
      });
    }

    const results: ClassificationResult[] = [];
    const toUpsert: Array<Record<string, unknown>> = [];
    const unresolved: IncomingDocument[] = [];

    for (const doc of documents) {
      const docIdStr = String(doc.id);
      const docType = (doc.documentType ?? "").trim();
      const fileName = (doc.fileName ?? "").trim();

      // 1. Check cache first
      const cachedResult = cachedMap.get(docIdStr);
      if (cachedResult && cachedResult.documentType === docType && cachedResult.fileName === fileName) {
        results.push(cachedResult);
        continue;
      }

      // 2. Try deterministic rules
      const ruleResult = classifyByRules(docType, rules);
      if (ruleResult && ruleResult.category) {
        const result: ClassificationResult = {
          documentId: docIdStr,
          matchedCategory: ruleResult.category,
          confidence: 1.0,
          source: "rule",
          reason: ruleResult.reason,
          documentType: docType,
          fileName,
        };
        results.push(result);
        toUpsert.push({
          loan_id: loanId,
          document_id: docIdStr,
          document_type: docType,
          file_name: fileName,
          matched_category: result.matchedCategory,
          confidence: 1.0,
          source: "rule",
          reason: result.reason,
          review_status: "auto",
        });
        continue;
      }

      // 3. Queue for LLM fallback
      unresolved.push(doc);
    }

    // 4. Batch LLM call for unresolved docs
    if (unresolved.length > 0) {
      try {
        const llmResults = await classifyByLLM(unresolved, categories);
        const llmMap = new Map<string, OpenAIItem>();
        for (const item of llmResults) llmMap.set(item.documentId, item);

        for (const doc of unresolved) {
          const docIdStr = String(doc.id);
          const docType = (doc.documentType ?? "").trim();
          const fileName = (doc.fileName ?? "").trim();
          const llmItem = llmMap.get(docIdStr);

          let result: ClassificationResult;

          if (llmItem && llmItem.matchedCategory !== "unmatched" && categories.includes(llmItem.matchedCategory)) {
            result = {
              documentId: docIdStr,
              matchedCategory: llmItem.matchedCategory,
              confidence: Math.min(Math.max(Number(llmItem.confidence) || 0, 0), 1),
              source: "llm",
              reason: llmItem.reason || "AI classification",
              documentType: docType,
              fileName,
            };
          } else {
            result = {
              documentId: docIdStr,
              matchedCategory: null,
              confidence: 0,
              source: "unverified",
              reason: llmItem?.reason || "No rule match and no LLM match",
              documentType: docType,
              fileName,
            };
          }

          results.push(result);
          toUpsert.push({
            loan_id: loanId,
            document_id: docIdStr,
            document_type: docType,
            file_name: fileName,
            matched_category: result.matchedCategory,
            confidence: result.confidence,
            source: result.source,
            reason: result.reason,
            review_status: "auto",
          });
        }
      } catch (llmErr) {
        // LLM failed — mark unresolved docs as unverified, don't block the response
        const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
        for (const doc of unresolved) {
          const docIdStr = String(doc.id);
          const docType = (doc.documentType ?? "").trim();
          const fileName = (doc.fileName ?? "").trim();
          const result: ClassificationResult = {
            documentId: docIdStr,
            matchedCategory: null,
            confidence: 0,
            source: "unverified",
            reason: `LLM unavailable: ${errMsg}`,
            documentType: docType,
            fileName,
          };
          results.push(result);
          toUpsert.push({
            loan_id: loanId,
            document_id: docIdStr,
            document_type: docType,
            file_name: fileName,
            matched_category: null,
            confidence: 0,
            source: "unverified",
            reason: result.reason,
            review_status: "auto",
          });
        }
      }
    }

    // 5. Persist new/updated classifications
    if (toUpsert.length > 0) {
      await supabase
        .from("document_classifications")
        .upsert(toUpsert, { onConflict: "loan_id,document_id" });
    }

    return new Response(
      JSON.stringify({
        loanId,
        classifications: results,
        categories,
        stats: {
          total: results.length,
          ruleBased: results.filter((r) => r.source === "rule").length,
          llmBased: results.filter((r) => r.source === "llm").length,
          unverified: results.filter((r) => r.source === "unverified").length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
