#!/usr/bin/env node
/**
 * Fix incorrect import paths for error utilities.
 * Calculates correct relative path based on file location.
 */

import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "src");

function calculateRelativePath(fromFile: string): string {
  const fromDir = path.dirname(fromFile);
  const toFile = path.join(SRC_DIR, "infra", "errors", "index.js");
  const rel = path.relative(fromDir, toFile).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function fixFile(filePath: string): void {
  let content = fs.readFileSync(filePath, "utf-8");

  // Find incorrect import
  const incorrectPattern = /from ["']\.\.\/infra\/errors\/index\.js["']/;
  if (!incorrectPattern.test(content)) {
    return;
  }

  const correctPath = calculateRelativePath(filePath);
  content = content.replace(
    /from ["']\.\.\/infra\/errors\/index\.js["']/g,
    `from "${correctPath}"`,
  );

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`✓ Fixed ${path.relative(process.cwd(), filePath)}: ${correctPath}`);
}

function walkDir(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      fixFile(fullPath);
    }
  }
}

console.log("🔧 Fixing import paths...\n");
walkDir(SRC_DIR);
console.log("\n✅ Done!");
