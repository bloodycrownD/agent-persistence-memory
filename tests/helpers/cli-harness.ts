import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Command } from "commander";
import { afterEach } from "vitest";
import { buildProgram } from "../../src/index";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

export async function runCli(args: string[], cwd: string): Promise<{ out: string; err: string }> {
  const prev = process.cwd();
  const out: string[] = [];
  const err: string[] = [];
  const oldLog = console.log;
  const oldErr = console.error;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => err.push(a.join(" "));
  process.chdir(cwd);
  try {
    const program = buildProgram();
    await program.parseAsync(["node", "apm", ...args], { from: "node" });
    return { out: out.join("\n"), err: err.join("\n") };
  } finally {
    process.chdir(prev);
    console.log = oldLog;
    console.error = oldErr;
  }
}

export async function runCliFail(args: string[], cwd: string): Promise<string> {
  try {
    await runCli(args, cwd);
    throw new Error("Expected command to fail.");
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 模拟 stdin 管道执行 CLI（parseAsync 前替换 process.stdin 并设 isTTY=false）。 */
export async function runCliWithStdin(
  args: string[],
  cwd: string,
  stdinBody: string
): Promise<{ out: string; err: string }> {
  const prev = process.cwd();
  const prevStdin = process.stdin;
  const out: string[] = [];
  const err: string[] = [];
  const oldLog = console.log;
  const oldErr = console.error;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => err.push(a.join(" "));
  const mockStdin = Readable.from([stdinBody]);
  Object.defineProperty(mockStdin, "isTTY", { value: false, configurable: true });
  Object.defineProperty(process, "stdin", {
    value: mockStdin,
    configurable: true,
    writable: true
  });
  process.chdir(cwd);
  try {
    const program = buildProgram();
    await program.parseAsync(["node", "apm", ...args], { from: "node" });
    return { out: out.join("\n"), err: err.join("\n") };
  } finally {
    process.chdir(prev);
    Object.defineProperty(process, "stdin", {
      value: prevStdin,
      configurable: true,
      writable: true
    });
    console.log = oldLog;
    console.error = oldErr;
  }
}

export async function runCliWithStdinFail(
  args: string[],
  cwd: string,
  stdinBody: string
): Promise<string> {
  try {
    await runCliWithStdin(args, cwd, stdinBody);
    throw new Error("Expected command to fail.");
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function resolveCommand(program: Command, ...path: string[]): Command | undefined {
  let cmd: Command = program;
  for (const name of path) {
    const next = cmd.commands.find((c) => c.name() === name);
    if (!next) return undefined;
    cmd = next;
  }
  return cmd;
}

/** Run CLI when commander may call process.exit (e.g. unknown subcommand, --help). */
export async function runCliWithExit(
  args: string[],
  cwd: string
): Promise<{ code: number; stderr: string; out: string }> {
  const prev = process.cwd();
  const out: string[] = [];
  const stderr: string[] = [];
  const oldLog = console.log;
  const oldErr = console.error;
  const origWrite = process.stderr.write.bind(process.stderr);
  const origExit = process.exit;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => stderr.push(a.join(" "));
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    stderr.push(String(chunk));
    return origWrite(chunk as never, ...(rest as never[]));
  }) as typeof process.stderr.write;
  let exitCode = 0;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("__cli_exit__");
  }) as typeof process.exit;
  process.chdir(cwd);
  try {
    const program = buildProgram();
    await program.parseAsync(["node", "apm", ...args], { from: "node" });
    return { code: exitCode, stderr: stderr.join(""), out: out.join("\n") };
  } catch (e) {
    if (e instanceof Error && e.message === "__cli_exit__") {
      return { code: exitCode, stderr: stderr.join(""), out: out.join("\n") };
    }
    throw e;
  } finally {
    process.chdir(prev);
    console.log = oldLog;
    console.error = oldErr;
    process.stderr.write = origWrite;
    process.exit = origExit;
  }
}

export function newTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apm-cli-test-"));
  tempDirs.push(dir);
  return dir;
}
