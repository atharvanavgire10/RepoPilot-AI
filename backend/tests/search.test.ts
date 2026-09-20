import { describe, it, expect } from "vitest";
import { searchFiles } from "../src/services/search.js";

function file(path: string, content: string) {
  return { path, language: "Other", size: content.length, lineCount: content.split("\n").length, content } as never;
}

describe("filename matching", () => {
  it("surfaces filename-only matches", () => {
    const hits = searchFiles([file("src/payments/stripe.ts", "export const x = 1;\n")], "stripe");
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ file: "src/payments/stripe.ts", line: 1, filenameMatch: true });
  });
  it("ranks filename matches before content matches", () => {
    const hits = searchFiles(
      [
        file("b/other.ts", "const stripe = 1;\n"),
        file("a/stripe.ts", "export const x = 1;\nconst stripe = 2;\n"),
      ],
      "stripe"
    );
    expect(hits[0].file).toBe("a/stripe.ts");
  });
});

describe("relevance ranking", () => {
  it("prefers whole-word matches", () => {
    const hits = searchFiles(
      [file("a.ts", "const stripedown = 1;\n"), file("b.ts", "const stripe = 1;\n")],
      "stripe"
    );
    // "stripedown" contains "stripe" as substring; whole-word "stripe" wins
    expect(hits[0].file).toBe("b.ts");
  });
  it("prefers files with more occurrences", () => {
    const hits = searchFiles(
      [file("a.ts", "auth once\n"), file("b.ts", "auth one\nauth two\nauth three\n")],
      "auth"
    );
    expect(hits[0].file).toBe("b.ts");
  });
  it("returns empty for blank queries", () => {
    expect(searchFiles([file("a.ts", "x")], "   ")).toEqual([]);
  });
  it("respects the limit", () => {
    const files = [file("a.ts", Array(100).fill("hit me").join("\n"))];
    expect(searchFiles(files, "hit", 5).length).toBeLessThanOrEqual(5);
  });
});
