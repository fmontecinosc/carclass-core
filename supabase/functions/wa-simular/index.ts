// Retirada el 21-nov-2026: el simulador vive en wa-agente (POST /functions/v1/wa-agente/simular, ver wa-agente/simular.ts).
Deno.serve(() => new Response("Usa /functions/v1/wa-agente/simular", { status: 410 }));
