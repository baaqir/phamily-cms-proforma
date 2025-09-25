export const config = { runtime: "edge" };

const CMS_ENDPOINT =
  "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "s-maxage=300, stale-while-revalidate=300"
  };
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const upstream = new URL(CMS_ENDPOINT);
  url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));
  if (!upstream.searchParams.get("limit")) upstream.searchParams.set("limit", "50");

  try {
    const r = await fetch(upstream.toString(), {
      headers: { "User-Agent": "phamily-cms-proforma/1.0" }
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("Content-Type") || "application/json",
        ...corsHeaders()
      }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Upstream error" }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }
}
