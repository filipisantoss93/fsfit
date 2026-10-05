import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = { "Content-Type": "application/json; charset=utf-8" };

Deno.serve(() => new Response(
  JSON.stringify({ ok: true, desativado: true }),
  { status: 200, headers },
));
