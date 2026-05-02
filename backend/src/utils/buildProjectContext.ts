export interface ProjectContext {
  specialization: string;
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
    specialization: profile?.specialization || projectName || 'эксперт',
    typicalClient:  profile?.typicalClient  || 'клиенты эксперта',
    uniqueApproach: profile?.uniqueApproach || 'авторский подход',
    keyResult:      profile?.keyResult      || 'измеримый результат',
    positioning:    profile?.positioning    || profile?.specialization || projectName || 'эксперт',
    projectName:    projectName             || 'Проект',
  };
}
