import { apiClient } from './client';

export const downloadStrategyPdf = async (
  projectName: string,
  answers: Record<string, string>,
): Promise<void> => {
  const response = await apiClient.post(
    '/strategy/export-pdf',
    { projectName, answers },
    { responseType: 'blob' },
  );

  const blob = new Blob([response.data as BlobPart], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Стратегия_${projectName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
