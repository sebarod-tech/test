const API_HOST = "api.football-data.org";
const ALLOWED_ORIGIN = "*";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname !== "/api") {
      return json({ message: "Usa /api?url=https://api.football-data.org/v4/..." }, 404);
    }

    const target = url.searchParams.get("url");
    if (!target) {
      return json({ message: "Falta el parametro url." }, 400);
    }

    const targetUrl = new URL(target);
    if (targetUrl.protocol !== "https:" || targetUrl.hostname !== API_HOST) {
      return json({ message: "Solo se permite consultar api.football-data.org." }, 400);
    }

    const token = env.FOOTBALL_DATA_TOKEN || request.headers.get("X-Auth-Token");
    if (!token) {
      return json({ message: "Falta FOOTBALL_DATA_TOKEN o header X-Auth-Token." }, 401);
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        "X-Auth-Token": token,
        "Accept": "application/json",
        "User-Agent": "Mundial-2026-dashboard"
      }
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        ...corsHeaders(),
        "Content-Type": response.headers.get("Content-Type") || "application/json"
      }
    });
  }
};

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json"
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "X-Auth-Token, Content-Type"
  };
}
