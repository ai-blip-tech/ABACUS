import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const file = await readFile(join(process.cwd(), '.next', 'static', 'room-design-planner', 'planning-bridge.html'));
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
