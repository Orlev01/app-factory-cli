import chalk from "chalk";
import { readConfig, configExists } from "../lib/config.js";
import { findApp } from "../lib/registry.js";
import { error } from "../lib/logger.js";
import * as vercel from "../services/vercel.js";
import * as neon from "../services/neon.js";
import * as github from "../services/github.js";

function statusIcon(ok: boolean): string {
  return ok ? chalk.green("●") : chalk.red("●");
}

function formatAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function statusCommand(
  name: string,
  options: { quick?: boolean }
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

  console.log(chalk.bold(`\nStatus: ${name}\n`));

  if (options.quick) {
    await quickCheck(app.url);
    return;
  }

  const [vercelResult, neonResult, githubResult] = await Promise.allSettled([
    checkVercel(config.vercelToken, app.vercelProjectId, app.url, config.vercelTeamId),
    checkNeon(config.neonApiKey, app.neonProjectId),
    checkGitHub(app.githubRepo),
  ]);

  // Vercel
  if (vercelResult.status === "fulfilled") {
    const v = vercelResult.value;
    console.log(`${statusIcon(v.siteUp)} ${chalk.bold("Site")}       ${v.statusCode} — ${v.responseTime}ms`);
    if (v.deployment) {
      const stateColor = v.deployment.state === "READY" ? chalk.green : chalk.yellow;
      console.log(
        `${statusIcon(v.deployment.state === "READY")} ${chalk.bold("Deployment")} ${stateColor(v.deployment.state)} — ${formatAge(new Date(v.deployment.created).toISOString())}` +
          (v.deployment.meta?.githubCommitMessage
            ? chalk.dim(` "${v.deployment.meta.githubCommitMessage}"`)
            : "")
      );
    }
  } else {
    console.log(`${statusIcon(false)} ${chalk.bold("Vercel")}     ${chalk.red("check failed")}`);
  }

  // Neon
  if (neonResult.status === "fulfilled") {
    const n = neonResult.value;
    console.log(
      `${statusIcon(n.active)} ${chalk.bold("Database")}   ${n.active ? chalk.green("active") : chalk.red("inactive")} — ${n.region}`
    );
  } else {
    console.log(`${statusIcon(false)} ${chalk.bold("Database")}   ${chalk.red("check failed")}`);
  }

  // GitHub
  if (githubResult.status === "fulfilled") {
    const g = githubResult.value;
    console.log(
      `${statusIcon(g.exists)} ${chalk.bold("GitHub")}     ${g.exists ? chalk.green("accessible") : chalk.red("not found")}` +
        (g.exists
          ? ` — ${g.defaultBranch}` +
            (g.openPRs > 0 ? chalk.yellow(` (${g.openPRs} open PR${g.openPRs > 1 ? "s" : ""})`) : "") +
            (g.pushedAt ? chalk.dim(` pushed ${formatAge(g.pushedAt)}`) : "")
          : "")
    );
  } else {
    console.log(`${statusIcon(false)} ${chalk.bold("GitHub")}     ${chalk.red("check failed")}`);
  }

  console.log("");
}

async function quickCheck(url: string): Promise<void> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    const elapsed = Date.now() - start;
    const ok = res.status >= 200 && res.status < 400;
    console.log(
      `${statusIcon(ok)} ${url} — ${res.status} (${elapsed}ms)\n`
    );
  } catch {
    const elapsed = Date.now() - start;
    console.log(`${statusIcon(false)} ${url} — timeout/unreachable (${elapsed}ms)\n`);
  }
}

async function checkVercel(
  token: string,
  projectId: string,
  url: string,
  teamId?: string
): Promise<{
  siteUp: boolean;
  statusCode: number;
  responseTime: number;
  deployment: vercel.DeploymentInfo | null;
}> {
  const [headResult, deployment] = await Promise.all([
    (async () => {
      const start = Date.now();
      try {
        const res = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5_000),
        });
        return { ok: res.status >= 200 && res.status < 400, status: res.status, time: Date.now() - start };
      } catch {
        return { ok: false, status: 0, time: Date.now() - start };
      }
    })(),
    vercel.getLatestDeployment(token, projectId, teamId),
  ]);

  return {
    siteUp: headResult.ok,
    statusCode: headResult.status,
    responseTime: headResult.time,
    deployment,
  };
}

async function checkNeon(
  apiKey: string,
  projectId: string
): Promise<{ active: boolean; region: string }> {
  const status = await neon.getProjectStatus(apiKey, projectId);
  return { active: status.active, region: status.region };
}

async function checkGitHub(
  repo: string
): Promise<{
  exists: boolean;
  defaultBranch: string;
  openPRs: number;
  pushedAt: string;
}> {
  const [org, name] = repo.split("/");
  const info = await github.getRepoInfo(org, name);
  return {
    exists: info.exists,
    defaultBranch: info.defaultBranch,
    openPRs: info.openPRs,
    pushedAt: info.pushedAt,
  };
}
