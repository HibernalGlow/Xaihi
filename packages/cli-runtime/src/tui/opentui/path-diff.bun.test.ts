import { describe, expect, test } from "bun:test";
import { splitPathDiff } from "./path-diff.js";

describe("splitPathDiff", () => {
  test("highlights only the renamed filename stem", () => {
    expect(splitPathDiff("D:/media/old-name.jpg", "D:/media/new-name.jpg")).toEqual({
      oldPrefix: "D:/media/",
      oldChanged: "old",
      oldSuffix: "-name.jpg",
      newPrefix: "D:/media/",
      newChanged: "new",
      newSuffix: "-name.jpg",
    });
  });

  test("supports moves and empty changed sides", () => {
    const diff = splitPathDiff("a/file.txt", "archive/a/file.txt");
    expect(diff.oldChanged).toBe("");
    expect(diff.newChanged).toBe("archive/");
    expect(diff.oldSuffix).toBe("a/file.txt");
  });
});
