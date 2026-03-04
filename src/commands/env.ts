import fs from "node:fs";
import chalk from "chalk";
import inquirer from "inquirer";
import { readConfig, configExists } from "../lib/config.js";
import { findApp } from "../lib/registry.js";
import { error, success, info, warn } from "../lib/logger.js";
import { parseEnvFile, formatEnvFile } from "../lib/env-parser.js";
import * as vercel from "../services/vercel.js";

const VALID_ACTIONS = ["list", "get", "set", "remove", "push", "pull"] as const;
type EnvAction = (typeof VALID_ACTIONS)[number];

export async function envCommand(
  name: string,
  action: string,
  args: string[]
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

  if (!VALID_ACTIONS.includes(action as EnvAction)) {
    error(`Invalid action "${action}". Must be one of: ${VALID_ACTIONS.join(", ")}`);
    process.exit(1);
  }

  const { vercelToken, vercelTeamId } = config;
  const { vercelProjectId } = app;

  switch (action as EnvAction) {
    case "list":
      await listAction(vercelToken, vercelProjectId, vercelTeamId);
      break;
    case "get":
      await getAction(vercelToken, vercelProjectId, args, vercelTeamId);
      break;
    case "set":
      await setAction(vercelToken, vercelProjectId, name, args, vercelTeamId);
      break;
    case "remove":
      await removeAction(vercelToken, vercelProjectId, name, args, vercelTeamId);
      break;
    case "push":
      await pushAction(vercelToken, vercelProjectId, name, args, vercelTeamId);
      break;
    case "pull":
      await pullAction(vercelToken, vercelProjectId, args, vercelTeamId);
      break;
  }
}

async function listAction(
  token: string,
  projectId: string,
  teamId?: string
): Promise<void> {
  const envVars = await vercel.listEnvVars(token, projectId, teamId);

  if (envVars.length === 0) {
    info("No environment variables found.");
    return;
  }

  // Table header
  const keyWidth = Math.max(4, ...envVars.map((v) => v.key.length)) + 2;
  console.log(
    chalk.bold(
      `${"KEY".padEnd(keyWidth)}${"TARGETS".padEnd(30)}TYPE`
    )
  );
  console.log(chalk.dim("─".repeat(keyWidth + 40)));

  for (const v of envVars) {
    console.log(
      `${v.key.padEnd(keyWidth)}${v.target.join(", ").padEnd(30)}${v.type}`
    );
  }

  console.log(chalk.dim(`\n${envVars.length} variable(s)`));
}

async function getAction(
  token: string,
  projectId: string,
  args: string[],
  teamId?: string
): Promise<void> {
  if (args.length === 0) {
    error("Usage: appfactory env <app> get <KEY>");
    process.exit(1);
  }

  const key = args[0];
  const envVars = await vercel.listEnvVars(token, projectId, teamId);
  const match = envVars.find((v) => v.key === key);

  if (!match) {
    error(`Environment variable "${key}" not found.`);
    process.exit(1);
  }

  const decrypted = await vercel.getEnvVar(token, projectId, match.id, teamId);
  console.log(`${decrypted.key}=${decrypted.value}`);
}

async function setAction(
  token: string,
  projectId: string,
  appName: string,
  args: string[],
  teamId?: string
): Promise<void> {
  if (args.length === 0) {
    error("Usage: appfactory env <app> set <KEY=VALUE> [KEY=VALUE...]");
    process.exit(1);
  }

  const existing = await vercel.listEnvVars(token, projectId, teamId);

  for (const arg of args) {
    const eqIndex = arg.indexOf("=");
    if (eqIndex === -1) {
      error(`Invalid format "${arg}". Use KEY=VALUE.`);
      process.exit(1);
    }

    const key = arg.slice(0, eqIndex);
    const value = arg.slice(eqIndex + 1);
    const match = existing.find((v) => v.key === key);

    if (match) {
      await vercel.updateEnvVar(token, projectId, match.id, value, undefined, teamId);
      success(`Updated ${key}`);
    } else {
      await vercel.setEnvVars(
        token,
        projectId,
        [{ key, value, target: ["production", "preview"], type: "encrypted" }],
        teamId
      );
      success(`Created ${key}`);
    }
  }

  await promptRedeploy(token, projectId, appName, teamId);
}

async function removeAction(
  token: string,
  projectId: string,
  appName: string,
  args: string[],
  teamId?: string
): Promise<void> {
  if (args.length === 0) {
    error("Usage: appfactory env <app> remove <KEY>");
    process.exit(1);
  }

  const key = args[0];
  const envVars = await vercel.listEnvVars(token, projectId, teamId);
  const match = envVars.find((v) => v.key === key);

  if (!match) {
    error(`Environment variable "${key}" not found.`);
    process.exit(1);
  }

  await vercel.removeEnvVar(token, projectId, match.id, teamId);
  success(`Removed ${key}`);

  await promptRedeploy(token, projectId, appName, teamId);
}

async function pushAction(
  token: string,
  projectId: string,
  appName: string,
  args: string[],
  teamId?: string
): Promise<void> {
  if (args.length === 0) {
    error("Usage: appfactory env <app> push <file>");
    process.exit(1);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const vars = parseEnvFile(content);
  const keys = Object.keys(vars);

  if (keys.length === 0) {
    warn("No variables found in file.");
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: `Push ${keys.length} variable(s) to Vercel?`,
      default: false,
    },
  ]);

  if (!confirm) {
    info("Cancelled.");
    return;
  }

  const existing = await vercel.listEnvVars(token, projectId, teamId);

  for (const key of keys) {
    const match = existing.find((v) => v.key === key);
    if (match) {
      await vercel.updateEnvVar(token, projectId, match.id, vars[key], undefined, teamId);
      success(`Updated ${key}`);
    } else {
      await vercel.setEnvVars(
        token,
        projectId,
        [{ key, value: vars[key], target: ["production", "preview"], type: "encrypted" }],
        teamId
      );
      success(`Created ${key}`);
    }
  }

  await promptRedeploy(token, projectId, appName, teamId);
}

async function pullAction(
  token: string,
  projectId: string,
  args: string[],
  teamId?: string
): Promise<void> {
  if (args.length === 0) {
    error("Usage: appfactory env <app> pull <file>");
    process.exit(1);
  }

  const filePath = args[0];
  const envVars = await vercel.listEnvVars(token, projectId, teamId);

  if (envVars.length === 0) {
    warn("No environment variables found.");
    return;
  }

  const vars: Record<string, string> = {};
  for (const v of envVars) {
    const decrypted = await vercel.getEnvVar(token, projectId, v.id, teamId);
    vars[decrypted.key] = decrypted.value;
  }

  const content = formatEnvFile(
    vars,
    `Pulled from Vercel on ${new Date().toISOString()}`
  );
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  success(`Wrote ${Object.keys(vars).length} variable(s) to ${filePath}`);
}

async function promptRedeploy(
  token: string,
  projectId: string,
  appName: string,
  teamId?: string
): Promise<void> {
  const { redeploy } = await inquirer.prompt([
    {
      type: "confirm",
      name: "redeploy",
      message: "Trigger a redeployment to apply changes?",
      default: true,
    },
  ]);

  if (!redeploy) return;

  try {
    const latest = await vercel.getLatestDeployment(token, projectId, teamId);
    if (!latest) {
      warn("No existing deployment found. Changes will apply on next deploy.");
      return;
    }
    const url = await vercel.triggerRedeploy(token, latest.id, appName, teamId);
    success(`Redeployment triggered: https://${url}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warn(`Failed to redeploy: ${message}`);
  }
}
