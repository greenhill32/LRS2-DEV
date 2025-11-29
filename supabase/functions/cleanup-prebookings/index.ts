import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.info("Running cleanup-prebookings");

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const today = new Date().toISOString().split("T")[0];
  const nowHM = new Date().toISOString().substring(11, 16);

  // Expired by date
  const res1 = await fetch(`${url}/rest/v1/prebookings?expected_date=lt.${today}&consumed=eq.false`, {
    method: "PATCH",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ consumed: true })
  });

  // Expired today by time
  const res2 = await fetch(
    `${url}/rest/v1/prebookings?expected_date=eq.${today}&expected_time=lt.${nowHM}&consumed=eq.false`,
    {
      method: "PATCH",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ consumed: true })
    }
  );

  if (!res1.ok || !res2.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: await res1.text() || await res2.text(),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: "Prebooking cleanup completed",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
