import chalk from "chalk";
import { readRegistry } from "../lib/registry.js";
import { info } from "../lib/logger.js";

export async function listCommand(): Promise<void> {
  const registry = readRegistry();

  if (registry.apps.length === 0) {
    info("No apps found. Run `appfactory create` to provision one.");
    return;
  }

  console.log(chalk.bold(`\n🏭 Apps (${registry.apps.length})\n`));

  // Table header
  const nameWidth = Math.max(20, ...registry.apps.map((a) => a.name.length + 2));
  const urlWidth = Math.max(30, ...registry.apps.map((a) => a.url.length + 2));

  console.log(
    chalk.dim(
      "  " +
        "Name".padEnd(nameWidth) +
        "URL".padEnd(urlWidth) +
        "Created"
    )
  );
  console.log(chalk.dim("  " + "─".repeat(nameWidth + urlWidth + 20)));

  for (const app of registry.apps) {
    const created = new Date(app.createdAt).toLocaleDateString();
    console.log(
      "  " +
        chalk.cyan(app.name.padEnd(nameWidth)) +
        app.url.padEnd(urlWidth) +
        chalk.dim(created)
    );
  }

  console.log("");
}
