import inquirer from "inquirer";
import chalk from "chalk";
import { writeConfig, configExists, getConfigPath } from "../lib/config.js";
import { writeRegistry, readRegistry } from "../lib/registry.js";
import { validateApiKey as validateNeonKey } from "../services/neon.js";
import { validateToken as validateVercelToken } from "../services/vercel.js";
import { checkAuthStatus, repoExists } from "../services/github.js";
import { success, error, info } from "../lib/logger.js";
import type { AppFactoryConfig } from "../types.js";

export async function initCommand(): Promise<void> {
  console.log(chalk.bold("\n🏭 App Factory — Setup Wizard\n"));

  if (configExists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "Config already exists. Overwrite?",
        default: false,
      },
    ]);
    if (!overwrite) {
      info("Setup cancelled.");
      return;
    }
  }

  // Step 1: GitHub CLI auth
  info("Checking GitHub CLI authentication...");
  if (!checkAuthStatus()) {
    error("GitHub CLI is not authenticated. Run `gh auth login` first.");
    process.exit(1);
  }
  success("GitHub CLI authenticated");

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "githubOrg",
      message: "GitHub org or username:",
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
    {
      type: "input",
      name: "templateRepo",
      message: "Template repo (org/repo):",
      validate: (v: string) =>
        v.includes("/") ? true : "Must be in org/repo format",
    },
    {
      type: "input",
      name: "appsDirectory",
      message: "Directory where apps will be created:",
      default: process.cwd(),
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
    {
      type: "password",
      name: "neonApiKey",
      message: "Neon API key:",
      mask: "*",
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
    {
      type: "password",
      name: "vercelToken",
      message: "Vercel token:",
      mask: "*",
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
    {
      type: "input",
      name: "vercelTeamId",
      message: "Vercel team ID (optional, press Enter to skip):",
    },
    {
      type: "password",
      name: "resendApiKey",
      message: "Resend API key:",
      mask: "*",
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
    {
      type: "input",
      name: "emailFrom",
      message: "Email from address (e.g. noreply@yourdomain.com):",
      validate: (v: string) => (v.includes("@") ? true : "Must be a valid email"),
    },
  ]);

  // Validate template repo
  info("Verifying template repo access...");
  if (!repoExists(answers.templateRepo.split("/")[0], answers.templateRepo.split("/")[1])) {
    error(`Cannot access template repo: ${answers.templateRepo}`);
    process.exit(1);
  }
  success("Template repo accessible");

  // Validate Neon API key
  info("Validating Neon API key...");
  const neonValid = await validateNeonKey(answers.neonApiKey);
  if (!neonValid) {
    error("Invalid Neon API key");
    process.exit(1);
  }
  success("Neon API key valid");

  // Validate Vercel token
  info("Validating Vercel token...");
  const vercelValid = await validateVercelToken(
    answers.vercelToken,
    answers.vercelTeamId || undefined
  );
  if (!vercelValid) {
    error("Invalid Vercel token");
    process.exit(1);
  }
  success("Vercel token valid");

  const config: AppFactoryConfig = {
    neonApiKey: answers.neonApiKey,
    vercelToken: answers.vercelToken,
    resendApiKey: answers.resendApiKey,
    githubOrg: answers.githubOrg,
    templateRepo: answers.templateRepo,
    appsDirectory: answers.appsDirectory,
    emailFrom: answers.emailFrom,
    ...(answers.vercelTeamId ? { vercelTeamId: answers.vercelTeamId } : {}),
  };

  writeConfig(config);

  // Initialize empty registry if it doesn't exist
  const registry = readRegistry();
  writeRegistry(registry);

  console.log("");
  success(`Config saved to ${getConfigPath()}`);
  success("App Factory is ready! Run `appfactory create` to provision your first app.");
}
