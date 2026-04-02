import inquirer from "inquirer";
import chalk from "chalk";
import { writeConfig, configExists, getConfigPath } from "../lib/config.js";
import { writeRegistry, readRegistry } from "../lib/registry.js";
import { validateApiKey as validateNeonKey } from "../services/neon.js";
import { validateToken as validateVercelToken } from "../services/vercel.js";
import { validateApiKey as validateResendKey } from "../services/resend.js";
import { checkGhInstalled, validateToken as validateGithubToken, repoExists } from "../services/github.js";
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

  // Check gh CLI is installed (needed for repo operations)
  info("Checking GitHub CLI is installed...");
  if (!checkGhInstalled()) {
    error("GitHub CLI (gh) is not installed. Install it with: brew install gh");
    process.exit(1);
  }
  success("GitHub CLI found");

  // Step 1: GitHub token
  const { githubToken } = await inquirer.prompt([
    {
      type: "password",
      name: "githubToken",
      message: "GitHub personal access token (for your personal account):",
      mask: "*",
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
  ]);

  info("Validating GitHub token...");
  const ghResult = await validateGithubToken(githubToken);
  if (!ghResult.valid) {
    error("Invalid GitHub token");
    process.exit(1);
  }
  success(`GitHub token valid — authenticated as ${chalk.bold(ghResult.login)}`);

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "githubOrg",
      message: "GitHub org or username for new repos:",
      default: ghResult.login,
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
    {
      type: "input",
      name: "githubSshHost",
      message: "GitHub SSH host alias (default github.com, change if using a custom SSH config):",
      default: "github.com",
      validate: (v: string) => (v.length > 0 ? true : "Required"),
    },
    {
      type: "input",
      name: "templateRepo",
      message: "Template repo (org/repo):",
      validate: (v: string) =>
        /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(v) ? true : "Must be in org/repo format (e.g. my-org/my-template)",
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
      validate: (v: string) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? true : "Must be a valid email (e.g. noreply@yourdomain.com)",
    },
  ]);

  // Validate template repo (using the GitHub token)
  info("Verifying template repo access...");
  if (!repoExists(answers.templateRepo.split("/")[0], answers.templateRepo.split("/")[1], githubToken)) {
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

  // Validate Resend API key
  info("Validating Resend API key...");
  const resendValid = await validateResendKey(answers.resendApiKey);
  if (!resendValid) {
    error("Invalid Resend API key");
    process.exit(1);
  }
  success("Resend API key valid");

  const config: AppFactoryConfig = {
    githubToken,
    githubOrg: answers.githubOrg,
    githubSshHost: answers.githubSshHost,
    templateRepo: answers.templateRepo,
    appsDirectory: answers.appsDirectory,
    neonApiKey: answers.neonApiKey,
    vercelToken: answers.vercelToken,
    resendApiKey: answers.resendApiKey,
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
