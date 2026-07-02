export async function onRequest(context) {
  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');
  if (!email) return Response.json({ approved: false, rejected: false });

  const SHEET_ID = '1P_Rtjyvqhif9Fv2I3M0Vd9yLLkOlmhv-Hn4bDCSyNYI';
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tq=${encodeURIComponent('SELECT C,E')}&sheet=Users&headers=1`;

  try {
    const res  = await fetch(SHEET_URL);
    const text = await res.text();
    const json = JSON.parse(text.substring(47, text.length - 2));
    const rows = json.table.rows || [];

    const approved = rows.some(r => r.c[0]?.v?.toLowerCase() === email.toLowerCase());
    const rejected = rows.some(r => r.c[1]?.v?.toLowerCase() === email.toLowerCase());

    return Response.json({ approved, rejected });
  } catch {
    return Response.json({ approved: false, rejected: false });
  }
}