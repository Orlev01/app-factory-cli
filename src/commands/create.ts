import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import { readConfig, configExists } from "../lib/config.js";
import { addApp, findApp } from "../lib/registry.js";
import { isValidAppName, getAppNameError } from "../lib/validation.js";
import { stepStart, stepSuccess, stepFail, error, success } from "../lib/logger.js";
import { writeEnvFile } from "../lib/env-writer.js";
import * as neon from "../services/neon.js";
import * as vercel from "../services/vercel.js";
import * as github from "../services/github.js";
import * as template from "../services/template.js";
import type { AppRecord } from "../types.js";

export async function createCommand(name?: string): Promise<void> {
  // Verify init was run
  if (!configExists()) {
    error("Config not found. Run `appfactory init` first.");
    process.exit(1);
  }

  const config = readConfig();

  // Get app name
  if (!name) {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "App name (kebab-case):",
        validate: (v: string) => {
          const err = getAppNameError(v);
          return err ?? true;
        },
      },
    ]);
    name = answers.name;
  }

  if (!isValidAppName(name!)) {
    error(getAppNameError(name!) ?? "Invalid app name");
    process.exit(1);
  }

  // Check if app already exists in registry
  if (findApp(name!)) {
    error(`App "${name}" already exists. Use a different name or destroy it first.`);
    process.exit(1);
  }

  const appName = name!;
  const appDir = path.join(config.appsDirectory, appName);

  console.log(chalk.bold(`\n🏭 Creating app: ${appName}\n`));

  // Track what was created for error reporting
  const created: string[] = [];

  try {
    // Step 1: Clone template
    const s1 = stepStart(1, "Cloning template...");
    template.cloneTemplate(config.templateRepo, appDir);
    stepSuccess(s1, "Template cloned");
    created.push(`Local directory: ${appDir}`);

    // Step 2: Install dependencies
    const s2 = stepStart(2, "Installing dependencies...");
    template.installDeps(appDir);
    stepSuccess(s2, "Dependencies installed");

    // Step 3: Create Neon database
    const s3 = stepStart(3, "Creating Neon database...");
    const neonProject = await neon.createProject(config.neonApiKey, appName);
    stepSuccess(s3, "Neon database created");
    created.push(`Neon project: ${neonProject.projectId}`);

    // Step 4: Generate secrets
    const s4 = stepStart(4, "Generating secrets...");
    const nextauthSecret = crypto.randomBytes(32).toString("base64");
    stepSuccess(s4, "Secrets generated");

    // Step 5: Write .env.local (localhost URLs for local dev)
    const s5 = stepStart(5, "Writing .env.local...");
    writeEnvFile(appDir, {
      databaseUrl: neonProject.connectionUri,
      nextauthSecret,
      nextauthUrl: "http://localhost:3000",
      resendApiKey: config.resendApiKey,
      emailFrom: config.emailFrom,
    });
    stepSuccess(s5, "Environment file written");

    // Step 6: Push database schema
    const s6 = stepStart(6, "Pushing database schema...");
    execSync("pnpm db:push", {
      cwd: appDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    stepSuccess(s6, "Database schema pushed");

    // Step 7: Create GitHub repo
    const s7 = stepStart(7, "Creating GitHub repository...");
    github.createRepo(config.githubOrg, appName);
    stepSuccess(s7, "GitHub repository created");
    created.push(`GitHub repo: ${config.githubOrg}/${appName}`);

    // Step 8: Push to GitHub
    const s8 = stepStart(8, "Pushing to GitHub...");
    github.pushInitialCommit(appDir, config.githubOrg, appName);
    stepSuccess(s8, "Code pushed to GitHub");

    // Step 9: Create Vercel project + set env vars (production URLs)
    const s9 = stepStart(9, "Setting up Vercel project...");
    const vercelProjectId = await vercel.createProject(
      config.vercelToken,
      appName,
      `${config.githubOrg}/${appName}`,
      config.githubOrg,
      config.vercelTeamId
    );
    created.push(`Vercel project: ${vercelProjectId}`);

    // Set production env vars on Vercel (with production URL, not localhost)
    const prodUrl = `https://${appName}.vercel.app`;
    await vercel.setEnvVars(
      config.vercelToken,
      vercelProjectId,
      [
        { key: "DATABASE_URL", value: neonProject.connectionUri, target: ["production", "preview"], type: "encrypted" },
        { key: "NEXTAUTH_SECRET", value: nextauthSecret, target: ["production", "preview"], type: "encrypted" },
        { key: "NEXTAUTH_URL", value: prodUrl, target: ["production"], type: "plain" },
        { key: "RESEND_API_KEY", value: config.resendApiKey, target: ["production", "preview"], type: "encrypted" },
        { key: "EMAIL_FROM", value: config.emailFrom, target: ["production", "preview"], type: "plain" },
      ],
      config.vercelTeamId
    );
    stepSuccess(s9, "Vercel project configured");

    // Step 10: Wait for deployment
    const s10 = stepStart(10, "Waiting for deployment...");
    let deploymentUrl: string;
    try {
      deploymentUrl = await vercel.waitForDeployment(
        config.vercelToken,
        vercelProjectId,
        config.vercelTeamId
      );
      stepSuccess(s10, `Deployed to ${deploymentUrl}`);
    } catch {
      stepFail(s10, "Deployment timed out — check Vercel dashboard");
      deploymentUrl = prodUrl;
    }

    // Silently record to apps.json
    const appRecord: AppRecord = {
      name: appName,
      url: deploymentUrl,
      githubRepo: `${config.githubOrg}/${appName}`,
      neonProjectId: neonProject.projectId,
      vercelProjectId,
      localPath: appDir,
      createdAt: new Date().toISOString(),
    };
    addApp(appRecord);

    // Final summary
    console.log(chalk.bold.green(`\n✅ App "${appName}" is live!\n`));
    console.log(`  ${chalk.dim("URL:")}        ${deploymentUrl}`);
    console.log(`  ${chalk.dim("GitHub:")}     https://github.com/${config.githubOrg}/${appName}`);
    console.log(`  ${chalk.dim("Local:")}      ${appDir}`);
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`\nFailed: ${message}\n`);

    if (created.length > 0) {
      console.log(chalk.yellow("The following resources were created before the failure:"));
      for (const item of created) {
        console.log(chalk.yellow(`  • ${item}`));
      }
      console.log(chalk.yellow("\nYou may need to clean these up manually, or use `appfactory destroy`."));
    }

    process.exit(1);
  }
}
