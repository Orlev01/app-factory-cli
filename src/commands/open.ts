import { execSync } from "node:child_process";
import { readConfig, configExists } from "../lib/config.js";
import { findApp } from "../lib/registry.js";
import { error, success } from "../lib/logger.js";

const VALID_TARGETS = ["url", "github", "vercel", "neon", "local"] as const;
type OpenTarget = (typeof VALID_TARGETS)[number];

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";

  execSync(`${cmd} "${url}"`, { stdio: "pipe" });
}

export async function openCommand(
  name: string,
  target: string = "url"
): Promise<void> {
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

  if (!VALID_TARGETS.includes(target as OpenTarget)) {
    error(`Invalid target "${target}". Must be one of: ${VALID_TARGETS.join(", ")}`);
    process.exit(1);
  }

  let location: string;

  switch (target as OpenTarget) {
    case "url":
      location = app.url;
      break;
    case "github":
      location = `https://github.com/${app.githubRepo}`;
      break;
    case "vercel":
      location = config.vercelTeamId
        ? `https://vercel.com/${config.vercelTeamId}/${name}`
        : `https://vercel.com/~/projects/${name}`;
      break;
    case "neon":
      location = `https://console.neon.tech/app/projects/${app.neonProjectId}`;
      break;
    case "local":
      location = app.localPath;
      break;
    default:
      location = app.url;
  }

  try {
    openUrl(location);
    success(`Opened ${target}: ${location}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to open: ${message}`);
    process.exit(1);
  }
}
