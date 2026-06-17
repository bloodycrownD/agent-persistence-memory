import { unescapeCliText } from "./cli-text-escape";

/**
 * 从标准输入读取全部内容并解码为 UTF-8 字符串。
 */
export async function readStdinToString(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * 解析 CLI 正文来源：`--text` 与 `--stdin` 互斥；未传 `--text` 时读取 stdin。
 * stdin 与 `--text` 均经 `unescapeCliText` 处理。
 *
 * @throws 同时指定 `--text` 与 `--stdin` 时抛出互斥错误
 * @throws 交互式 TTY 且无 `--text`、无管道、无 `--stdin` 时抛出用法错误
 */
export async function resolveCliBodyText(opts: {
  text?: string;
  stdin?: boolean;
}): Promise<string> {
  const hasText = opts.text !== undefined;
  const wantsStdin = Boolean(opts.stdin);
  if (hasText && wantsStdin) {
    throw new Error("Cannot use both --text and --stdin.");
  }
  if (hasText) {
    return unescapeCliText(opts.text!);
  }
  if (wantsStdin || !process.stdin.isTTY) {
    return unescapeCliText(await readStdinToString());
  }
  throw new Error("Provide --text or pipe content to stdin (or use --stdin).");
}
