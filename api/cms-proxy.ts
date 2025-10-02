// /api/cms-proxy.ts (Edge Runtime)
export const config = { runtime: "edge" };

const CMS_ENDPOINT =
  "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    // Cache at the edge: 1 hour fresh, 1 day stale-while-revalidate
    "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
  };
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  const reqUrl = new URL(req.url);
  const upstream = new URL(CMS_ENDPOINT);

  // Pass through all query params (filter[...], limit, offset, etc.)
  reqUrl.searchParams.forEach((v, k) => {
    if (v != null && v.trim() !== "") upstream.searchParams.set(k, v);
  });

  // Provide a sensible default page size if not set
  if (!upstream.searchParams.get("limit")) upstream.searchParams.set("limit", "50");

  // 15s timeout (Edge runtime supports AbortController)
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort("timeout"), 15000);

  try {
    const r = await fetch(upstream.toString(), {
      method: "GET",
      signal: ac.signal,
      headers: {
        "accept": "application/json",
        "user-agent": "phamily-cms-proforma/1.0",
      },
      // Let CMS cache too, but we mostly rely on Vercel edge cache above
    });

    const bodyText = await r.text(); // passthrough body as-is
    const contentType = r.headers.get("content-type") || "application/json";

    // Surface non-2xx with the upstream body so the UI can show a helpful message
    return new Response(bodyText, {
      status: r.status,
      headers: {
        "Content-Type": contentType,
        ...corsHeaders(),
      },
    });
  } catch (e: any) {
    const payload = {
      error: "upstream_error",
      message: e?.message || String(e),
      url: upstream.toString(),
    };
    return new Response(JSON.stringify(payload), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } finally {
    clearTimeout(timer);
  }
}
