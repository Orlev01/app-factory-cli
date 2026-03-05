import fs from "node:fs";
import path from "node:path";

export interface EnvVars {
  databaseUrl: string;
  authSecret: string;
  authUrl: string;
  resendApiKey: string;
  emailFrom: string;
  appName: string;
  appUrl: string;
}

export function generateEnvContent(vars: EnvVars): string {
  return [
    `DATABASE_URL="${vars.databaseUrl}"`,
    ``,
    `AUTH_SECRET="${vars.authSecret}"`,
    `AUTH_URL="${vars.authUrl}"`,
    ``,
    `RESEND_API_KEY="${vars.resendApiKey}"`,
    `EMAIL_FROM="${vars.emailFrom}"`,
    ``,
    `NEXT_PUBLIC_APP_NAME="${vars.appName}"`,
    `NEXT_PUBLIC_APP_URL="${vars.appUrl}"`,
    ``,
  ].join("\n");
}

export function writeEnvFile(appDir: string, vars: EnvVars): void {
  const content = generateEnvContent(vars);
  const envPath = path.join(appDir, ".env.local");
  fs.writeFileSync(envPath, content, { mode: 0o600 });
}
