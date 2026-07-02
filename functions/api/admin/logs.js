export async function onRequest(context) {
  try {
    const kv = context.env.USERS_KV;
    if (!kv) {
      return Response.json({ error: "KV not bound" }, { status: 500 });
    }

    const logsData = await kv.get("recent_logs");
    const parsedLogs = logsData ? JSON.parse(logsData) : [];

    return Response.json({ logs: parsedLogs });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}