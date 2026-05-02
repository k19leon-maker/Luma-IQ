export const downloadStrategyPdf = async (
  projectName: string,
  answers: Record<string, string>,
): Promise<void> => {
  const response = await fetch('/api/v1/strategy/export-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
    },
    body: JSON.stringify({ projectName, answers }),
  });

  if (!response.ok) {
    let details = '';
    try {
      const body = await response.json() as { error?: string; details?: string };
      details = body.details ?? body.error ?? '';
    } catch { /* not JSON */ }
    const msg = `PDF ${response.status}: ${details || response.statusText}`;
    console.error('[PDF]', msg);
    throw new Error(msg);
  }

  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Стратегия_${projectName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
