import { execSync } from "node:child_process";

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function checkAuthStatus(): boolean {
  try {
    exec("gh auth status");
    return true;
  } catch {
    return false;
  }
}

export function repoExists(org: string, name: string): boolean {
  try {
    exec(`gh repo view ${org}/${name} --json name`);
    return true;
  } catch {
    return false;
  }
}

export function createRepo(org: string, name: string): void {
  exec(
    `gh repo create ${org}/${name} --private --confirm`
  );
}

export function pushInitialCommit(appDir: string, org: string, name: string): void {
  exec("git add -A", appDir);
  exec('git commit -m "Initial commit from appfactory"', appDir);
  exec(`git remote add origin https://github.com/${org}/${name}.git`, appDir);
  exec("git push -u origin main", appDir);
}

export function deleteRepo(org: string, name: string): void {
  exec(`gh repo delete ${org}/${name} --yes`);
}
