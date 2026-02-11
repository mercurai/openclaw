#!/usr/bin/env node
/**
 * Automated error pattern migration script.
 * Replaces common patterns with utility functions.
 *
 * Usage:
 *   node --import tsx scripts/auto-migrate-error-patterns.ts --dry-run
 *   node --import tsx scripts/auto-migrate-error-patterns.ts --apply
 */

import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "src");
const INFRA_ERRORS_DIR = path.join(SRC_DIR, "infra", "errors");

let filesModified = 0;
let patternsReplaced = 0;

interface Replacement {
  file: string;
  lineNum: number;
  oldLine: string;
  newLine: string;
}

const replacements: Replacement[] = [];

function isExcluded(filePath: string): boolean {
  // Exclude the error infrastructure itself and test files
  return (
    filePath.startsWith(INFRA_ERRORS_DIR) ||
    filePath.includes(".test.ts") ||
    filePath.includes("test-")
  );
}

function needsImport(content: string): {
  needsFormatErrorForLog: boolean;
  needsFormatErrorForUser: boolean;
  needsToError: boolean;
} {
  return {
    needsFormatErrorForLog: content.includes("formatErrorForLog(err)"),
    needsFormatErrorForUser: content.includes("formatErrorForUser(err)"),
    needsToError: content.includes("toError(err)"),
  };
}

function hasImport(content: string, funcName: string): boolean {
  const importRegex = new RegExp(`import.*\\b${funcName}\\b.*from.*errors/index\\.js`);
  return importRegex.test(content);
}

function addImports(content: string, needs: ReturnType<typeof needsImport>): string {
  const imports: string[] = [];
  if (needs.needsFormatErrorForLog && !hasImport(content, "formatErrorForLog")) {
    imports.push("formatErrorForLog");
  }
  if (needs.needsFormatErrorForUser && !hasImport(content, "formatErrorForUser")) {
    imports.push("formatErrorForUser");
  }
  if (needs.needsToError && !hasImport(content, "toError")) {
    imports.push("toError");
  }

  if (imports.length === 0) {
    return content;
  }

  // Find appropriate relative path
  const relPath = content.includes("../infra/errors")
    ? (content.match(/['"]\.\.\/\.\.\/infra\/errors\/index\.js['"]/)?.[0] ??
      '"../infra/errors/index.js"')
    : '"../infra/errors/index.js"';

  const importStatement = `import { ${imports.join(", ")} } from ${relPath};\n`;

  // Find first import statement
  const firstImportMatch = content.match(/^import .*/m);
  if (firstImportMatch) {
    const insertPos = content.indexOf(firstImportMatch[0]);
    return content.slice(0, insertPos) + importStatement + content.slice(insertPos);
  }

  // No imports found, add at top
  return importStatement + content;
}

function migrateFile(filePath: string, dryRun: boolean): void {
  if (isExcluded(filePath)) {
    return;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  let modified = false;

  // Pattern 1: err instanceof Error ? err.message : String(err)
  const pattern1 = /err instanceof Error \? err\.message : String\(err\)/g;
  if (pattern1.test(content)) {
    content = content.replace(pattern1, "formatErrorForUser(err)");
    modified = true;
    patternsReplaced++;
  }

  // Pattern 2: String(err) in error messages (be conservative - only in obvious error contexts)
  const lines = content.split("\n");
  let hasStringErrReplacement = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only replace String(err) in clear error contexts
    if (
      line.includes("String(err)") &&
      (line.includes("error:") ||
        line.includes("Error:") ||
        line.includes("failed:") ||
        line.includes("log.") ||
        line.includes("console.error"))
    ) {
      // Check if we're in a catch block (look back up to 10 lines)
      let inCatch = false;
      for (let j = Math.max(0, i - 10); j < i; j++) {
        if (lines[j].includes("catch (")) {
          inCatch = true;
          break;
        }
      }

      if (inCatch) {
        lines[i] = line.replace(/String\(err\)/g, "formatErrorForLog(err)");
        hasStringErrReplacement = true;
        patternsReplaced++;
      }
    }
  }

  if (hasStringErrReplacement) {
    content = lines.join("\n");
    modified = true;
  }

  // If we made replacements, add necessary imports
  if (modified) {
    const needs = needsImport(content);
    content = addImports(content, needs);

    if (!dryRun) {
      fs.writeFileSync(filePath, content, "utf-8");
    }
    filesModified++;

    console.log(`✓ ${path.relative(process.cwd(), filePath)}`);
  }
}

function walkDir(dir: string, dryRun: boolean): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        walkDir(fullPath, dryRun);
      }
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      migrateFile(fullPath, dryRun);
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");

  if (!dryRun && !apply) {
    console.error(
      "Usage: node --import tsx scripts/auto-migrate-error-patterns.ts [--dry-run|--apply]",
    );
    process.exit(1);
  }

  console.log(
    dryRun
      ? "🔍 Dry run mode - no files will be modified\n"
      : "✏️  Apply mode - files will be modified\n",
  );

  walkDir(SRC_DIR, dryRun);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Files modified: ${filesModified}`);
  console.log(`Patterns replaced: ${patternsReplaced}`);

  if (dryRun) {
    console.log("\n💡 Run with --apply to apply these changes");
  } else {
    console.log("\n✅ Migration complete! Run 'pnpm build' to verify.");
  }
}

main();
