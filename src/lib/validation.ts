const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function isValidAppName(name: string): boolean {
  if (name.length < 3 || name.length > 50) return false;
  return KEBAB_CASE_RE.test(name);
}

export function getAppNameError(name: string): string | null {
  if (name.length < 3) return "App name must be at least 3 characters";
  if (name.length > 50) return "App name must be at most 50 characters";
  if (!KEBAB_CASE_RE.test(name))
    return "App name must be kebab-case (lowercase letters, numbers, hyphens)";
  return null;
}
