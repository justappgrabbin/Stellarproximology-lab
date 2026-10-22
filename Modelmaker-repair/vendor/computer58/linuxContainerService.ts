import { spawn } from "child_process";
import path from "path";
import os from "os";

export interface ContainerCommandResult {
  command: string;
  cwd: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  shell: string;
  timedOut: boolean;
}

export interface ContainerStatus {
  enabled: boolean;
  platform: NodeJS.Platform;
  shell: string;
  cwd: string;
  node: string;
  message: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 256_000;

function getWorkspaceRoot() {
  return path.resolve(process.env.LINUX_CONTAINER_WORKDIR || process.cwd());
}

function resolveCwd(requestedCwd?: string) {
  const root = getWorkspaceRoot();
  const candidate = requestedCwd
    ? path.resolve(root, requestedCwd)
    : root;

  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw new Error("Command cwd must stay inside the configured workspace");
  }

  return candidate;
}

function getShell() {
  if (process.env.LINUX_CONTAINER_SHELL) {
    return process.env.LINUX_CONTAINER_SHELL;
  }

  return os.platform() === "win32" ? "powershell.exe" : "/bin/bash";
}

function getShellArgs(command: string) {
  return os.platform() === "win32"
    ? ["-NoLogo", "-NoProfile", "-Command", command]
    : ["-lc", command];
}

function clampOutput(value: string) {
  if (Buffer.byteLength(value, "utf8") <= MAX_OUTPUT_BYTES) {
    return value;
  }

  return value.slice(0, MAX_OUTPUT_BYTES) + "\n[output truncated]";
}

export function getContainerStatus(): ContainerStatus {
  const enabled = process.env.LINUX_CONTAINER_ENABLED === "true";
  const cwd = getWorkspaceRoot();

  return {
    enabled,
    platform: process.platform,
    shell: getShell(),
    cwd,
    node: process.version,
    message: enabled
      ? "Linux container bridge is enabled"
      : "Linux container bridge is disabled. Set LINUX_CONTAINER_ENABLED=true to run commands.",
  };
}

export async function runContainerCommand(command: string, cwd?: string): Promise<ContainerCommandResult> {
  if (process.env.LINUX_CONTAINER_ENABLED !== "true") {
    throw new Error("Linux container bridge is disabled");
  }

  const resolvedCwd = resolveCwd(cwd);
  const shell = getShell();
  const child = spawn(shell, getShellArgs(command), {
    cwd: resolvedCwd,
    env: process.env,
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, Number(process.env.LINUX_CONTAINER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

  child.stdout.on("data", (chunk) => {
    stdout = clampOutput(stdout + chunk.toString());
  });

  child.stderr.on("data", (chunk) => {
    stderr = clampOutput(stderr + chunk.toString());
  });

  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        command,
        cwd: resolvedCwd,
        code,
        signal,
        stdout,
        stderr: timedOut ? `${stderr}\nCommand timed out`.trim() : stderr,
        shell,
        timedOut,
      });
    });
  });
}
