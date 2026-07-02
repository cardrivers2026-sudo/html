export async function onRequest(context) {
  if (context.request.method !== 'POST')
    return new Response('Method not allowed', { status: 405 });

  try {
    const { email, name } = await context.request.json();
    if (!email || !name) return Response.json({ ok: false });

    const key = `request:${email.toLowerCase()}`;
    await context.env.USERS_KV.put(key, JSON.stringify({
      email, name, timestamp: Date.now()
    }));

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false });
  }
}
