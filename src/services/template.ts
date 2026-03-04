import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function cloneTemplate(
  templateRepo: string,
  targetDir: string
): void {
  if (fs.existsSync(targetDir)) {
    throw new Error(`Directory already exists: ${targetDir}`);
  }

  // Shallow clone
  exec(`git clone --depth 1 https://github.com/${templateRepo}.git ${targetDir}`);

  // Strip .git and reinitialize
  const gitDir = path.join(targetDir, ".git");
  fs.rmSync(gitDir, { recursive: true, force: true });
  exec("git init -b main", targetDir);
}

export function installDeps(appDir: string): void {
  exec("pnpm install", appDir);
}
