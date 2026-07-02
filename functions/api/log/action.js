export async function onRequest(context) {
  try {
    const kv = context.env.USERS_KV;
    if (!kv) {
      return Response.json({ error: "KV not bound" }, { status: 500 });
    }

    const data = await context.request.json();
    const timestamp = Date.now();
    const newLog = { ...data, timestamp };

    let currentLogs = [];
    const existingData = await kv.get("recent_logs");
    
    if (existingData) {
      currentLogs = JSON.parse(existingData);
    }

    currentLogs.unshift(newLog);

    if (currentLogs.length > 500) {
      currentLogs = currentLogs.slice(0, 500);
    }

    await kv.put("recent_logs", JSON.stringify(currentLogs));

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}