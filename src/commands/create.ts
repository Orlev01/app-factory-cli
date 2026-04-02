import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import inquirer from "inquirer";
import chalk from "chalk";
import { readConfig, configExists } from "../lib/config.js";
import { addApp, findApp } from "../lib/registry.js";
import { isValidAppName, getAppNameError } from "../lib/validation.js";
import { stepStart, stepSuccess, stepFail, error, success, warn } from "../lib/logger.js";
import { writeEnvFile } from "../lib/env-writer.js";
import * as neon from "../services/neon.js";
import * as vercel from "../services/vercel.js";
import * as github from "../services/github.js";
import * as template from "../services/template.js";
import type { AppRecord } from "../types.js";

const TOTAL_STEPS = 10;

export async function createCommand(
  name?: string,
  options?: { from?: string }
): Promise<void> {
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

  const fromApp = options?.from ? findApp(options.from) : undefined;
  if (options?.from && !fromApp) {
    error(`Source app "${options.from}" not found in registry.`);
    process.exit(1);
  }

  if (fromApp && !fs.existsSync(fromApp.localPath)) {
    error(`Source app local path not found: ${fromApp.localPath}`);
    process.exit(1);
  }

  console.log(
    chalk.bold(
      `\n🏭 ${fromApp ? `Forking from "${fromApp.name}"` : "Creating app"}: ${appName}\n`
    )
  );

  // Track created resources for rollback on failure
  let createdLocalDir = false;
  let neonProjectId: string | undefined;
  let githubRepoCreated = false;
  let vercelProjectId: string | undefined;

  try {
    // Step 1: Clone template or copy from source
    if (fromApp) {
      const s1 = stepStart(1, `Copying from ${fromApp.name}...`, TOTAL_STEPS);
      const EXCLUDE = ["node_modules", ".next", ".env.local", ".git"];
      fs.cpSync(fromApp.localPath, appDir, {
        recursive: true,
        filter: (src) => {
          const rel = path.relative(fromApp.localPath, src);
          return !EXCLUDE.some((ex) => rel === ex || rel.startsWith(ex + "/"));
        },
      });
      execFileSync("git", ["init", "-b", "main"], { cwd: appDir, stdio: "pipe" });
      stepSuccess(s1, "Source app copied");
    } else {
      const s1 = stepStart(1, "Cloning template...", TOTAL_STEPS);
      template.cloneTemplate(config.templateRepo, appDir, config.githubSshHost);
      stepSuccess(s1, "Template cloned");
    }
    createdLocalDir = true;

    // Step 2: Install dependencies
    const s2 = stepStart(2, "Installing dependencies...", TOTAL_STEPS);
    template.installDeps(appDir);
    stepSuccess(s2, "Dependencies installed");

    // Step 3: Create Neon database
    const s3 = stepStart(3, "Creating Neon database...", TOTAL_STEPS);
    const neonProject = await neon.createProject(config.neonApiKey, appName);
    neonProjectId = neonProject.projectId;
    stepSuccess(s3, "Neon database created");

    // Step 4: Generate secrets
    const s4 = stepStart(4, "Generating secrets...", TOTAL_STEPS);
    const authSecret = crypto.randomBytes(32).toString("base64");
    const appDisplayName = appName
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    stepSuccess(s4, "Secrets generated");

    // Step 5: Write .env.local (localhost URLs for local dev)
    const s5 = stepStart(5, "Writing .env.local...", TOTAL_STEPS);
    writeEnvFile(appDir, {
      databaseUrl: neonProject.connectionUri,
      authSecret,
      authUrl: "http://localhost:3000",
      resendApiKey: config.resendApiKey,
      emailFrom: config.emailFrom,
      appName: appDisplayName,
      appUrl: "http://localhost:3000",
    });
    stepSuccess(s5, "Environment file written");

    // Step 6: Push database schema (if the template defines the script)
    const templatePkg = JSON.parse(
      fs.readFileSync(path.join(appDir, "package.json"), "utf-8")
    );
    if (templatePkg.scripts?.["db:push"]) {
      const s6 = stepStart(6, "Pushing database schema...", TOTAL_STEPS);
      execFileSync("pnpm", ["db:push"], {
        cwd: appDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      stepSuccess(s6, "Database schema pushed");
    } else {
      const s6 = stepStart(6, "Pushing database schema...", TOTAL_STEPS);
      stepFail(s6, "Skipped — template has no db:push script");
    }

    // Step 7: Create GitHub repo
    const s7 = stepStart(7, "Creating GitHub repository...", TOTAL_STEPS);
    github.createRepo(config.githubOrg, appName, config.githubToken);
    githubRepoCreated = true;
    stepSuccess(s7, "GitHub repository created");

    // Step 8: Push to GitHub
    const s8 = stepStart(8, "Pushing to GitHub...", TOTAL_STEPS);
    github.pushInitialCommit(appDir, config.githubOrg, appName, config.githubSshHost);
    stepSuccess(s8, "Code pushed to GitHub");

    // Step 9: Create Vercel project + set env vars (production + preview URLs)
    const s9 = stepStart(9, "Setting up Vercel project...", TOTAL_STEPS);
    vercelProjectId = await vercel.createProject(
      config.vercelToken,
      appName,
      `${config.githubOrg}/${appName}`,
      config.vercelTeamId
    );

    const prodUrl = `https://${appName}.vercel.app`;
    await vercel.setEnvVars(
      config.vercelToken,
      vercelProjectId,
      [
        { key: "DATABASE_URL", value: neonProject.connectionUri, target: ["production", "preview"], type: "encrypted" },
        { key: "AUTH_SECRET", value: authSecret, target: ["production", "preview"], type: "encrypted" },
        { key: "AUTH_URL", value: prodUrl, target: ["production", "preview"], type: "plain" },
        { key: "RESEND_API_KEY", value: config.resendApiKey, target: ["production", "preview"], type: "encrypted" },
        { key: "EMAIL_FROM", value: config.emailFrom, target: ["production", "preview"], type: "plain" },
        { key: "NEXT_PUBLIC_APP_NAME", value: appDisplayName, target: ["production", "preview"], type: "plain" },
        { key: "NEXT_PUBLIC_APP_URL", value: prodUrl, target: ["production", "preview"], type: "plain" },
      ],
      config.vercelTeamId
    );
    stepSuccess(s9, "Vercel project configured");

    // Step 10: Wait for deployment
    const s10 = stepStart(10, "Waiting for deployment...", TOTAL_STEPS);
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

    // If the actual URL differs from assumed, update env vars and trigger a redeploy
    if (deploymentUrl !== prodUrl) {
      const envVars = await vercel.listEnvVars(config.vercelToken, vercelProjectId, config.vercelTeamId);
      for (const key of ["AUTH_URL", "NEXT_PUBLIC_APP_URL"]) {
        const match = envVars.find((v) => v.key === key);
        if (match) {
          await vercel.updateEnvVar(
            config.vercelToken,
            vercelProjectId,
            match.id,
            deploymentUrl,
            ["production", "preview"],
            config.vercelTeamId
          );
        }
      }

      // Trigger redeploy so NEXT_PUBLIC_* vars are rebuilt with correct values
      const latest = await vercel.getLatestDeployment(config.vercelToken, vercelProjectId, config.vercelTeamId);
      if (latest) {
        await vercel.triggerRedeploy(config.vercelToken, latest.id, appName, config.vercelTeamId);
      }
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
    if (fromApp) {
      console.log(
        chalk.yellow("\n  Note: Database schema was copied but data was not migrated.")
      );
    }
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`\nFailed: ${message}\n`);

    // Automatic rollback of created resources (reverse order)
    console.log(chalk.yellow("Rolling back created resources..."));

    if (vercelProjectId) {
      try {
        await vercel.deleteProject(config.vercelToken, vercelProjectId, config.vercelTeamId);
        success("Rolled back Vercel project");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Failed to roll back Vercel project: ${msg}`);
      }
    }

    if (githubRepoCreated) {
      try {
        github.deleteRepo(config.githubOrg, appName, config.githubToken);
        success("Rolled back GitHub repo");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Failed to roll back GitHub repo: ${msg}`);
      }
    }

    if (neonProjectId) {
      try {
        await neon.deleteProject(config.neonApiKey, neonProjectId);
        success("Rolled back Neon project");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Failed to roll back Neon project: ${msg}`);
      }
    }

    if (createdLocalDir && fs.existsSync(appDir)) {
      try {
        fs.rmSync(appDir, { recursive: true, force: true });
        success("Rolled back local directory");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn(`Failed to roll back local directory: ${msg}`);
      }
    }

    process.exit(1);
  }
}
