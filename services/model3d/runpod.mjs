// Only the Amsterdam coordinator receives the account API key. Never a browser.
export class Runpod {
  constructor(key, fetcher = fetch) { this.key = key; this.fetcher = fetcher; }
  async call(path, method = 'GET', body) {
    const response = await this.fetcher(`https://rest.runpod.io/v1${path}`, { method, headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`RunPod HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  async list() { const result = await this.call('/pods'); return Array.isArray(result) ? result : result.pods || []; }
  create(body) { return this.call('/pods', 'POST', body); }
  async stop(id) {
    try { return await this.call(`/pods/${encodeURIComponent(id)}/stop`, 'POST'); }
    catch (error) {
      // GraphQL is also used by the vendor's preinstalled, Pod-scoped CLI.
      const endpoint=new URL('https://api.runpod.io/graphql');endpoint.searchParams.set('api_key',this.key);
      const response = await this.fetcher(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: `mutation { podStop(input: {podId: ${JSON.stringify(id)}}) { id desiredStatus } }` }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || !result.data?.podStop) throw error;
      return result.data.podStop;
    }
  }
}
export const stoppedPod = pod => ['EXITED','STOPPED','TERMINATED'].includes(pod?.desiredStatus || pod?.status);
