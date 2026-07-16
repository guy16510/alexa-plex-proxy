export class GatewayClient {
  constructor({ baseUrl, apiKey, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  async resolve({ kind, query }) {
    const response = await this.fetchImpl(`${this.baseUrl}/v1/resolve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ kind, query }),
      signal: AbortSignal.timeout(8_000)
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gateway resolve failed: ${response.status} ${body.slice(0, 200)}`);
    }

    return response.json();
  }
}
