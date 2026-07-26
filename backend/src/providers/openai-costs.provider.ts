export const openAiCostsProvider = {
  async totalCostUsd(input: {
    adminKey: string;
    from: Date;
    to: Date;
  }): Promise<number> {
    const params = new URLSearchParams({
      start_time: String(Math.floor(input.from.getTime() / 1000)),
      end_time: String(Math.floor(input.to.getTime() / 1000)),
      bucket_width: '1d',
      limit: '180',
    });
    let page: string | null = null;
    let total = 0;
    do {
      if (page) params.set('page', page);
      const response = await fetch(`https://api.openai.com/v1/organization/costs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${input.adminKey}` },
      });
      if (!response.ok) throw new Error(`OPENAI_COSTS_API_${response.status}`);
      const payload = await response.json() as {
        data?: Array<{ results?: Array<{ amount?: { value?: number; currency?: string } }> }>;
        has_more?: boolean;
        next_page?: string | null;
      };
      for (const bucket of payload.data ?? []) {
        for (const result of bucket.results ?? []) {
          if ((result.amount?.currency ?? 'usd').toLowerCase() === 'usd') {
            total += Number(result.amount?.value ?? 0);
          }
        }
      }
      page = payload.has_more ? payload.next_page ?? null : null;
    } while (page);
    return total;
  },
};
