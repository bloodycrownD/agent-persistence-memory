/**
 * Unescape CLI string arguments after shell/argv parsing.
 * Only \\n \\t \\r \\\\ are expanded; other \\X keeps backslash + character.
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
