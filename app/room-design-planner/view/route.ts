import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const filename = query.get('proposal') === '1' && query.get('cabinet') === 'dresser'
    ? 'cabinet-proposal.html' : 'planning-bridge.html';
  try {
    const file = await readFile(join(process.cwd(), '.next', 'static', 'room-design-planner', filename));
    return new Response(new Uint8Array(file), {headers: {
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store',
      'Content-Security-Policy':"frame-ancestors 'self'",
    }});
  } catch {
    return new Response('Room Design Planner временно недоступен', {
      status:503, headers:{'Cache-Control':'no-store'},
    });
  }
}
