const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1YJHBTCRfVOCETYJMLaEQGJGNSBWcMJFMqGxWFCVvHAA/gviz/tq?tqx=out:json&sheet=Sheet1&range=A:H';

const BUCKET          = 'https://storage.googleapis.com/ichudb';
const NOT_ENGAGED_BUCKET = 'https://storage.googleapis.com/ichudb-not-engaged';

export async function onRequest(context) {
  const rowId = context.params.rowId;

  // validate rowId is a number
  if (!rowId || isNaN(rowId)) {
    return new Response('Invalid ID', { status: 400 });
  }

  try {
    // fetch sheet to check status
    const sheetRes = await fetch(SHEET_URL);
    const text     = await sheetRes.text();
    const json     = JSON.parse(text.substring(47, text.length - 2));

    // find the row  (rowIdx in your sheet = array index + 2)
    const rowIndex = parseInt(rowId) - 2;
    const row      = json.table.rows[rowIndex];

    if (!row) return new Response('Not found', { status: 404 });

    const status = row.c[7] && row.c[7].v ? String(row.c[7].v).trim() : '';

    // decide which bucket based on status — user cannot override this
    let imgUrl;
    if (status === 'בחור') {
      imgUrl = `${NOT_ENGAGED_BUCKET}/${rowId}.jpg`;
    } else if (status === 'חתן' || status === 'אינגערמאן') {
      imgUrl = `${BUCKET}/ichud_jpg/${rowId}.jpg`;
    } else {
      return new Response('No image', { status: 404 });
    }

    // fetch image from GCS and stream back to browser
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return new Response('Image not found', { status: 404 });

    return new Response(imgRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (err) {
    return new Response('Error', { status: 500 });
  }
}