export interface ProjectContext {
  expertName: string;
  expertProfileSummary: string;
  specialization: string;
  niche:          string;
  typicalClient:  string;
  uniqueApproach: string;
  keyResult:      string;
  positioning:    string;
  projectName:    string;
}

export function buildProjectContext(
  profile: Record<string, string> | null | undefined,
  projectName: string,
): ProjectContext {
  return {
    expertName:     profile?.expertName || '',
    expertProfileSummary: profile?.expertProfileSummary || '',
    specialization: profile?.specialization || projectName || 'эксперт',
    niche:          profile?.niche || profile?.specialization || projectName || 'экспертная ниша',
    typicalClient:  profile?.typicalClient  || 'клиенты эксперта',
    uniqueApproach: profile?.uniqueApproach || 'авторский подход',
    keyResult:      profile?.keyResult      || 'измеримый результат',
    positioning:    profile?.positioning    || profile?.specialization || projectName || 'эксперт',
    projectName:    projectName             || 'Проект',
  };
}
