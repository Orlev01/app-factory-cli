import fs from "node:fs";
import inquirer from "inquirer";
import chalk from "chalk";
import { readConfig, configExists } from "../lib/config.js";
import { findApp, removeApp } from "../lib/registry.js";
import { error, success, warn } from "../lib/logger.js";
import * as neon from "../services/neon.js";
import * as vercel from "../services/vercel.js";
import * as github from "../services/github.js";

export async function destroyCommand(name: string): Promise<void> {
  if (!configExists()) {
    error("Config not found. Run `appfactory init` first.");
    process.exit(1);
  }

  const config = readConfig();
  const app = findApp(name);

  if (!app) {
    error(`App "${name}" not found in registry. Run \`appfactory list\` to see available apps.`);
    process.exit(1);
  }

  // Show what will be deleted
  console.log(chalk.bold.red(`\n⚠️  This will permanently destroy "${name}":\n`));
  console.log(`  • Vercel project: ${app.vercelProjectId}`);
  console.log(`  • Neon database:  ${app.neonProjectId}`);
  console.log(`  • GitHub repo:    ${app.githubRepo}`);
  console.log(`  • Local files:    ${app.localPath}`);
  console.log("");

  // Require typing app name to confirm
  const { confirmation } = await inquirer.prompt([
    {
      type: "input",
      name: "confirmation",
      message: `Type "${name}" to confirm destruction:`,
    },
  ]);

  if (confirmation !== name) {
    error("Confirmation did not match. Aborting.");
    return;
  }

  const failures: string[] = [];

  // Delete Vercel project
  try {
    await vercel.deleteProject(config.vercelToken, app.vercelProjectId, config.vercelTeamId);
    success("Vercel project deleted");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Failed to delete Vercel project: ${msg}`);
    failures.push("Vercel project");
  }

  // Delete Neon project
  try {
    await neon.deleteProject(config.neonApiKey, app.neonProjectId);
    success("Neon database deleted");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Failed to delete Neon project: ${msg}`);
    failures.push("Neon project");
  }

  // Delete GitHub repo
  try {
    github.deleteRepo(app.githubRepo.split("/")[0], app.githubRepo.split("/")[1]);
    success("GitHub repo deleted");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Failed to delete GitHub repo: ${msg}`);
    failures.push("GitHub repo");
  }

  // Delete local files
  try {
    if (fs.existsSync(app.localPath)) {
      fs.rmSync(app.localPath, { recursive: true, force: true });
      success("Local files deleted");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`Failed to delete local files: ${msg}`);
    failures.push("Local files");
  }

  // Remove from registry
  removeApp(name);
  success("Removed from app registry");

  if (failures.length > 0) {
    console.log(chalk.yellow(`\n⚠️  Partial failures — manually clean up: ${failures.join(", ")}`));
  } else {
    console.log(chalk.green(`\n✅ App "${name}" completely destroyed.`));
  }
}
