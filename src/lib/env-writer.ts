import fs from "node:fs";
import path from "node:path";

export interface EnvVars {
  databaseUrl: string;
  nextauthSecret: string;
  nextauthUrl: string;
  resendApiKey: string;
  emailFrom: string;
}

export function generateEnvContent(vars: EnvVars): string {
  return [
    `DATABASE_URL="${vars.databaseUrl}"`,
    ``,
    `NEXTAUTH_SECRET="${vars.nextauthSecret}"`,
    `NEXTAUTH_URL="${vars.nextauthUrl}"`,
    ``,
    `RESEND_API_KEY="${vars.resendApiKey}"`,
    `EMAIL_FROM="${vars.emailFrom}"`,
    ``,
  ].join("\n");
}

export function writeEnvFile(appDir: string, vars: EnvVars): void {
  const content = generateEnvContent(vars);
  const envPath = path.join(appDir, ".env.local");
  fs.writeFileSync(envPath, content, { mode: 0o600 });
}
