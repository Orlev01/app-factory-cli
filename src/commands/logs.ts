import { spawn, execSync } from "node:child_process";
import { readConfig, configExists } from "../lib/config.js";
import { findApp } from "../lib/registry.js";
import { error } from "../lib/logger.js";

export async function logsCommand(name: string): Promise<void> {
  if (!configExists()) {
    error("Config not found. Run `appfactory init` first.");
    process.exit(1);
  }

  const config = readConfig();
  const app = findApp(name);

  if (!app) {
    error(`App "${name}" not found. Run \`appfactory list\` to see available apps.`);
    process.exit(1);
  }

  // Check vercel CLI is installed
  try {
    execSync("vercel --version", { stdio: "pipe" });
  } catch {
    error(
      "Vercel CLI not found. Install it with:\n\n  npm i -g vercel\n"
    );
    process.exit(1);
  }

  const args = ["logs", app.url, "--follow", "--token", config.vercelToken];
  if (config.vercelTeamId) {
    args.push("--scope", config.vercelTeamId);
  }

  const child = spawn("vercel", args, { stdio: "inherit" });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}
