export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    vars[key] = value;
  }

  return vars;
}

export function formatEnvFile(
  vars: Record<string, string>,
  header?: string
): string {
  const lines: string[] = [];

  if (header) {
    lines.push(`# ${header}`);
    lines.push("");
  }

  const keys = Object.keys(vars).sort();
  for (const key of keys) {
    lines.push(`${key}="${vars[key]}"`);
  }

  lines.push("");
  return lines.join("\n");
}
