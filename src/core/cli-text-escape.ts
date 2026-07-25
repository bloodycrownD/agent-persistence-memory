/**
 * 对 shell/argv 解析后的 CLI 字符串参数做反转义。
 * 仅展开 \\n、\\t、\\r、\\\\；其它 \\X 保留反斜杠与后续字符。
 */
export function unescapeCliText(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch !== "\\" || i + 1 >= input.length) {
      out += ch;
      continue;
    }
    const next = input[++i];
    switch (next) {
      case "n":
        out += "\n";
        break;
      case "t":
        out += "\t";
        break;
      case "r":
        out += "\r";
        break;
      case "\\":
        out += "\\";
        break;
      default:
        out += "\\" + next;
        break;
    }
  }
  return out;
}
