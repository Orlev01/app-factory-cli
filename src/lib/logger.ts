import chalk from "chalk";
import ora, { type Ora } from "ora";

let currentSpinner: Ora | null = null;

export function stepStart(step: number, message: string, totalSteps: number = 10): Ora {
  if (currentSpinner) {
    currentSpinner.stop();
  }
  const prefix = chalk.dim(`[${step}/${totalSteps}]`);
  const spinner = ora(`${prefix} ${message}`).start();
  currentSpinner = spinner;
  return spinner;
}

export function stepSuccess(spinner: Ora, message: string): void {
  spinner.succeed(message);
  if (currentSpinner === spinner) {
    currentSpinner = null;
  }
}

export function stepFail(spinner: Ora, message: string): void {
  spinner.fail(message);
  if (currentSpinner === spinner) {
    currentSpinner = null;
  }
}

export function success(message: string): void {
  console.log(chalk.green("✔"), message);
}

export function error(message: string): void {
  console.error(chalk.red("✖"), message);
}

export function warn(message: string): void {
  console.log(chalk.yellow("⚠"), message);
}

export function info(message: string): void {
  console.log(chalk.blue("ℹ"), message);
}
