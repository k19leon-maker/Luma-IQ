import type {
  InstagramPackagingLimits,
  InstagramProfileHeader,
} from '../api/projects.api';

export type InstagramProfileField = keyof InstagramProfileHeader;

export interface InstagramProfileValidation {
  valid: boolean;
  fieldErrors: Partial<Record<InstagramProfileField, string>>;
  counts: Record<InstagramProfileField, number>;
  combinedBioCount: number;
}

export function instagramCharacterCount(value: string): number {
  return Array.from(value).length;
}

function isHttpUrl(value: string): boolean {
  if (!value) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateInstagramProfile(
  profile: InstagramProfileHeader,
  limits: InstagramPackagingLimits,
): InstagramProfileValidation {
  const fieldErrors: Partial<Record<InstagramProfileField, string>> = {};
  const counts = Object.fromEntries(
    Object.entries(profile).map(([field, value]) => [field, instagramCharacterCount(value)]),
  ) as Record<InstagramProfileField, number>;

  for (const [field, rules] of Object.entries(limits.fields)) {
    const key = field as InstagramProfileField;
    const value = profile[key].trim();
    if (rules.required && !value) {
      fieldErrors[key] = `${rules.label}: обязательное поле`;
    } else if (counts[key] > rules.max) {
      fieldErrors[key] = `${rules.label}: не более ${rules.max} символов`;
    } else if (rules.pattern && value && !new RegExp(rules.pattern).test(value)) {
      fieldErrors[key] = rules.patternHint ?? `${rules.label}: недопустимый формат`;
    } else if (rules.format === 'http_url' && !isHttpUrl(value)) {
      fieldErrors[key] = 'Ссылка должна начинаться с http:// или https://';
    }
  }

  const combined = limits.combined.bioAndCallToAction;
  const combinedText = [profile.bio.trim(), profile.callToAction.trim()]
    .filter(Boolean)
    .join(combined.separator);
  const combinedBioCount = instagramCharacterCount(combinedText);
  if (combinedBioCount > combined.max) {
    fieldErrors.callToAction = `${combined.label}: вместе не более ${combined.max} символов`;
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    counts,
    combinedBioCount,
  };
}

