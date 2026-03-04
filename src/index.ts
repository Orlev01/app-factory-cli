#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { createCommand } from "./commands/create.js";
import { listCommand } from "./commands/list.js";
import { destroyCommand } from "./commands/destroy.js";
import { openCommand } from "./commands/open.js";
import { envCommand } from "./commands/env.js";
import { statusCommand } from "./commands/status.js";
import { logsCommand } from "./commands/logs.js";

const program = new Command();

program
  .name("appfactory")
  .description("Provision full-stack apps from a template in one command")
  .version("1.0.0");

program
  .command("init")
  .description("Configure credentials and settings")
  .action(initCommand);

program
  .command("create")
  .description("Create a new app from the template")
  .argument("[name]", "App name (kebab-case, 3-50 chars)")
  .option("--from <source>", "Fork from an existing app")
  .action(createCommand);

program
  .command("list")
  .description("List all provisioned apps")
  .action(listCommand);

program
  .command("destroy")
  .description("Tear down a provisioned app")
  .argument("<name>", "Name of the app to destroy")
  .action(destroyCommand);

program
  .command("open")
  .description("Open an app resource in the browser")
  .argument("<name>", "App name")
  .argument("[target]", "url | github | vercel | neon | local", "url")
  .action(openCommand);

program
  .command("env")
  .description("Manage environment variables on Vercel")
  .argument("<name>", "App name")
  .argument("<action>", "list | get | set | remove | push | pull")
  .argument("[args...]", "Action arguments")
  .action(envCommand);

program
  .command("status")
  .description("Check health of an app's services")
  .argument("<name>", "App name")
  .option("--quick", "Only check HTTP response")
  .action(statusCommand);

program
  .command("logs")
  .description("Tail Vercel deployment logs")
  .argument("<name>", "App name")
  .action(logsCommand);

program.parse();
