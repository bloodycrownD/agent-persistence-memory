import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCliBodyText } from "../src/core/cli-body-input";

describe("resolveCliBodyText", () => {
  let prevStdin: typeof process.stdin;

  afterEach(() => {
    Object.defineProperty(process, "stdin", {
      value: prevStdin,
      configurable: true,
      writable: true
    });
  });

  function mockStdin(body: string, isTTY: boolean): void {
    prevStdin = process.stdin;
    const mock = Readable.from([body]);
    Object.defineProperty(mock, "isTTY", { value: isTTY, configurable: true });
    Object.defineProperty(process, "stdin", {
      value: mock,
      configurable: true,
      writable: true
    });
  }

  it("--text 经 unescapeCliText 展开转义", async () => {
    await expect(resolveCliBodyText({ text: "a\\nb" })).resolves.toBe("a\nb");
  });

  it("同时传 --text 与 --stdin 时互斥报错", async () => {
    await expect(resolveCliBodyText({ text: "hi", stdin: true })).rejects.toThrow(
      /Cannot use both --text and --stdin/i
    );
  });

  it("显式 --stdin 时读取标准输入", async () => {
    mockStdin("piped-body", false);
    await expect(resolveCliBodyText({ stdin: true })).resolves.toBe("piped-body");
  });

  it("非 TTY 且未传 --text 时隐式读取 stdin", async () => {
    mockStdin("implicit-pipe", false);
    await expect(resolveCliBodyText({})).resolves.toBe("implicit-pipe");
  });

  it("交互 TTY 且无正文来源时提示用法", async () => {
    mockStdin("", true);
    await expect(resolveCliBodyText({})).rejects.toThrow(/Provide --text or pipe content to stdin/i);
  });
});
