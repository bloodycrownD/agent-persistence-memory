import { describe, expect, it } from "vitest";
import { unescapeCliText } from "../src/core/cli-text-escape";

describe("unescapeCliText", () => {
  it("T-ESC-01: \\n becomes LF", () => {
    expect(unescapeCliText("a\\nb")).toBe("a\nb");
  });

  it("T-ESC-02: \\\\n stays backslash + n", () => {
    expect(unescapeCliText("a\\\\nb")).toBe("a\\nb");
  });

  it("T-ESC-03: \\\\ becomes single backslash", () => {
    expect(unescapeCliText("\\\\")).toBe("\\");
  });

  it("T-ESC-04: \\t becomes tab", () => {
    expect(unescapeCliText("a\\tb")).toBe("a\tb");
  });

  it("unknown escape keeps backslash and char", () => {
    expect(unescapeCliText("a\\qb")).toBe("a\\qb");
  });
});
