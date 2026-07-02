export async function onRequest(context) {
  try {
    const kv = context.env.USERS_KV;
    if (!kv) return Response.json({ error: 'KV not bound' }, { status: 500 });
    const list = await kv.list({ prefix: 'request:' });
    const users = await Promise.all(
      list.keys.map(async k => {
        const val = await kv.get(k.name);
        return val ? JSON.parse(val) : null;
      })
    );
    return Response.json(users.filter(Boolean).sort((a,b) => b.timestamp - a.timestamp));
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
