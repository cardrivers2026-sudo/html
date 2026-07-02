const SHEET_ID = '1P_Rtjyvqhif9Fv2I3M0Vd9yLLkOlmhv-Hn4bDCSyNYI';
const BUCKET = 'https://storage.googleapis.com/ichudb';
const NOT_ENGAGED_BUCKET = 'https://storage.googleapis.com/ichudb/not_engaged';

// ── Helper: check admin auth ──
async function checkAdminAuth(request, env) {
  const customPass = request.headers.get('X-Admin-Password');
  const storedPass = await env.USERS_KV.get('admin:password');
  if (!storedPass) return { ok: false, noPassword: true };
  if (customPass !== storedPass) return { ok: false, noPassword: false };
  return { ok: true };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Admin password check endpoint (public – used by login page) ──
    if (path === '/api/admin/password-status') {
      const stored = await env.USERS_KV.get('admin:password');
      return Response.json({ hasPassword: !!stored });
    }

    // ── Set first-time password ──
    if (path === '/api/admin/set-first-password') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const stored = await env.USERS_KV.get('admin:password');
      if (stored) return Response.json({ ok: false, error: 'Password already set' });
      const { password } = await request.json();
      if (!password) return Response.json({ ok: false });
      await env.USERS_KV.put('admin:password', password);
      return Response.json({ ok: true });
    }

    // ── Auth check (for pictures page Google sign-in) ──
    if (path.startsWith('/api/auth/check')) {
      const email = url.searchParams.get('email');
      if (!email) return Response.json({ approved: false, rejected: false });
      try {
        const approved = await env.USERS_KV.get(`approved:${email.toLowerCase()}`);
        const rejected = await env.USERS_KV.get(`rejected:${email.toLowerCase()}`);
        return Response.json({ approved: !!approved, rejected: !!rejected });
      } catch(e) { return Response.json({ approved: false, rejected: false }); }
    }

    // ── Auth request ──
    if (path.startsWith('/api/auth/request')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      try {
        const { email, name } = await request.json();
        if (!email || !name) return Response.json({ ok: false });
        const key = `request:${email.toLowerCase()}`;
        await env.USERS_KV.put(key, JSON.stringify({ email, name, timestamp: Date.now() }));
        return Response.json({ ok: true });
      } catch(e) { return Response.json({ ok: false, error: e.message }); }
    }

    // ── All /api/admin/* routes require auth ──
    if (path.startsWith('/api/admin') || path === '/admin' || path.startsWith('/admin/')) {
      // Only check password for API calls, not the HTML page itself
      if (path.startsWith('/api/admin') && path !== '/api/admin/password-status' && path !== '/api/admin/set-first-password') {
        const auth = await checkAdminAuth(request, env);
        if (!auth.ok) {
          return Response.json({ error: 'Unauthorized', noPassword: auth.noPassword }, { status: 401 });
        }
      }
    }

    // ── Admin: change password ──
    if (path === '/api/admin/change-password') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      try {
        const { newPassword } = await request.json();
        if (!newPassword) return Response.json({ ok: false });
        await env.USERS_KV.put('admin:password', newPassword);
        return Response.json({ ok: true });
      } catch(e) { return Response.json({ ok: false, error: e.message }); }
    }

    // ── Admin: pictures passwords ──
    if (path === '/api/admin/pic-passwords') {
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (request.method === 'GET') {
        const data = await env.USERS_KV.get('pic:passwords');
        const enabled = await env.USERS_KV.get('pic:passwords:enabled');
        return Response.json({ passwords: data ? JSON.parse(data) : [], enabled: enabled !== 'false' });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        // Save all passwords
        await env.USERS_KV.put('pic:passwords', JSON.stringify(body.passwords));
        if (typeof body.enabled !== 'undefined') {
          await env.USERS_KV.put('pic:passwords:enabled', String(body.enabled));
        }
        return Response.json({ ok: true });
      }
    }

    // ── Admin: session management ──
    if (path === '/api/admin/sessions') {
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (request.method === 'GET') {
        const data = await env.USERS_KV.get('admin:sessions');
        return Response.json({ sessions: data ? JSON.parse(data) : [] });
      }
      if (request.method === 'POST') {
        // Register/update a session
        const body = await request.json();
        const data = await env.USERS_KV.get('admin:sessions');
        let sessions = data ? JSON.parse(data) : [];
        // Remove stale entry for this email
        sessions = sessions.filter(s => s.email !== body.email);
        sessions.push({ name: body.name, email: body.email, loginTime: Date.now(), sessionId: body.sessionId });
        await env.USERS_KV.put('admin:sessions', JSON.stringify(sessions));
        return Response.json({ ok: true });
      }
    }

    if (path === '/api/admin/sessions/logout') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const { email } = await request.json();
      const data = await env.USERS_KV.get('admin:sessions');
      let sessions = data ? JSON.parse(data) : [];
      sessions = sessions.filter(s => s.email !== email);
      await env.USERS_KV.put('admin:sessions', JSON.stringify(sessions));
      return Response.json({ ok: true });
    }

    // ── Admin: approve ──
    if (path.startsWith('/api/admin/approve')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      try {
        const { email, name } = await request.json();
        const e = email.toLowerCase();
        await env.USERS_KV.put(`approved:${e}`, JSON.stringify({ email, name, timestamp: Date.now() }));
        await env.USERS_KV.delete(`rejected:${e}`);
        await env.USERS_KV.delete(`request:${e}`);
        return Response.json({ ok: true });
      } catch(e) { return Response.json({ ok: false, error: e.message }); }
    }

    // ── Admin: reject ──
    if (path.startsWith('/api/admin/reject')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      try {
        const { email, name } = await request.json();
        const e = email.toLowerCase();
        await env.USERS_KV.put(`rejected:${e}`, JSON.stringify({ email, name, timestamp: Date.now() }));
        await env.USERS_KV.delete(`approved:${e}`);
        await env.USERS_KV.delete(`request:${e}`);
        return Response.json({ ok: true });
      } catch(e) { return Response.json({ ok: false, error: e.message }); }
    }

    // ── Admin: remove ──
    if (path.startsWith('/api/admin/remove')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      try {
        const { email, from } = await request.json();
        const e = email.toLowerCase();
        await env.USERS_KV.delete(`${from}:${e}`);
        return Response.json({ ok: true });
      } catch(e) { return Response.json({ ok: false, error: e.message }); }
    }

    // ── Admin list ──
    if (path.startsWith('/api/admin/requests')) {
      try {
        const kv = env.USERS_KV;
        if (!kv) return Response.json({ error: 'KV not bound' }, { status: 500 });
        const [reqList, appList, rejList] = await Promise.all([
          kv.list({ prefix: 'request:' }),
          kv.list({ prefix: 'approved:' }),
          kv.list({ prefix: 'rejected:' }),
        ]);
        const load = async (keys) => Promise.all(keys.map(async k => {
          const val = await kv.get(k.name);
          return val ? JSON.parse(val) : null;
        }));
        const [requests, approved, rejected] = await Promise.all([
          load(reqList.keys), load(appList.keys), load(rejList.keys)
        ]);
        const sort = arr => arr.filter(Boolean).sort((a,b) => b.timestamp - a.timestamp);
        return Response.json({ requests: sort(requests), approved: sort(approved), rejected: sort(rejected) });
      } catch(e) { return Response.json({ error: e.message }, { status: 500 }); }
    }

    // ── Admin logs ──
    if (path.startsWith('/api/admin/logs')) {
      try {
        const db = env.ichud_stats;
        if (!db) return Response.json({ error: 'D1 not bound' }, { status: 500 });
        const { results } = await db.prepare(
          'SELECT name, email, target_name AS targetName, target_id AS targetId, action, timestamp FROM logs ORDER BY timestamp DESC LIMIT 500'
        ).all();
        return Response.json({ logs: results });
      } catch(e) { return Response.json({ error: e.message }, { status: 500 }); }
    }

    // ── Log action ──
    if (path.startsWith('/api/log/action')) {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      try {
        const db = env.ichud_stats;
        if (!db) return Response.json({ error: 'D1 not bound' }, { status: 500 });
        const data = await request.json();
        await db.prepare(
          'INSERT INTO logs (name, email, target_name, target_id, action, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          data.name || '',
          data.email || '',
          data.targetName || '',
          data.targetId || '',
          data.action || '',
          Date.now()
        ).run();
        return Response.json({ success: true });
      } catch(e) { return Response.json({ error: e.message }, { status: 500 }); }
    }

    // ── Suggest picture upload ──
    if (path === '/api/suggest-picture') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      try {
        const formData = await request.formData();
        const rowId = formData.get('rowId');
        const file = formData.get('picture');
        if (!rowId || !file) return Response.json({ ok: false, error: 'Missing data' });
        const bytes = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
        await env.USERS_KV.put(`suggested:${rowId}`, JSON.stringify({
          data: base64,
          mimeType: file.type || 'image/jpeg',
          uploadedAt: Date.now()
        }), { expirationTtl: 60 * 60 * 24 * 30 }); // 30 days TTL
        return Response.json({ ok: true });
      } catch(e) { return Response.json({ ok: false, error: e.message }); }
    }

    // ── Get suggested picture (admin) ──
    if (path.startsWith('/api/admin/suggested/')) {
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return new Response('Unauthorized', { status: 401 });
      const rowId = path.split('/').pop();
      const stored = await env.USERS_KV.get(`suggested:${rowId}`);
      if (!stored) return new Response('Not found', { status: 404 });
      const { data, mimeType } = JSON.parse(stored);
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      return new Response(bytes, { headers: { 'Content-Type': mimeType } });
    }

    // ── List suggested pictures (admin) ──
    if (path === '/api/admin/suggested') {
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const list = await env.USERS_KV.list({ prefix: 'suggested:' });
      const ids = list.keys.map(k => k.name.replace('suggested:', ''));
      return Response.json({ ids });
    }

    // ── Apply suggested picture (admin) – saves to GCS bucket ──
    if (path === '/api/admin/apply-suggested') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      try {
        const { rowId } = await request.json();
        const stored = await env.USERS_KV.get(`suggested:${rowId}`);
        if (!stored) return Response.json({ ok: false, error: 'Not found' });
        const { data, mimeType } = JSON.parse(stored);
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        // Upload to GCS public bucket
        const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/ichudb/o?uploadType=media&name=not_engaged/${rowId}.jpg`;
        const gcsRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': mimeType },
          body: bytes
        });
        if (!gcsRes.ok) {
          const errText = await gcsRes.text();
          return Response.json({ ok: false, error: 'GCS upload failed: ' + errText });
        }
        await env.USERS_KV.delete(`suggested:${rowId}`);
        return Response.json({ ok: true });
      } catch(e) { return Response.json({ ok: false, error: e.message }); }
    }

    // ── Delete suggested picture (admin) ──
    if (path === '/api/admin/delete-suggested') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      const auth = await checkAdminAuth(request, env);
      if (!auth.ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const { rowId } = await request.json();
      await env.USERS_KV.delete(`suggested:${rowId}`);
      return Response.json({ ok: true });
    }

    // ── Images ──
    if (path.startsWith('/api/img/')) {
      const rowId = path.split('/').pop();
      if (!rowId || isNaN(rowId)) return new Response('Invalid ID', { status: 400 });
      try {
        const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tq=${encodeURIComponent('SELECT A,B,C,D,E,F,G,H')}&headers=1`;
        const sheetRes = await fetch(SHEET_URL);
        const text = await sheetRes.text();
        const json = JSON.parse(text.substring(47, text.length - 2));
        const rowIndex = parseInt(rowId) - 2;
        const row = json.table.rows[rowIndex];
        if (!row) return new Response('Not found', { status: 404 });
        const status = row.c[7]?.v ? String(row.c[7].v).trim() : '';
        let imgUrl;
        if (status === 'בחור') imgUrl = `${NOT_ENGAGED_BUCKET}/${rowId}.jpg`;
        else if (status === 'חתן' || status === 'אינגערמאן') imgUrl = `${BUCKET}/ichud_jpg/${rowId}.jpg`;
        else return new Response('No image', { status: 404 });
        const imgRes = await fetch(imgUrl);
        if (!imgRes.ok) return new Response('Image not found', { status: 404 });
        return new Response(imgRes.body, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
      } catch(e) { return new Response('Error: ' + e.message, { status: 500 }); }
    }

    // ── Static assets ──
    return env.ASSETS.fetch(request);
  }
};
