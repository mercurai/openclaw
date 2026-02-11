#!/usr/bin/env node
/**
 * CI enforcement script for error handling patterns.
 * Scans for discouraged patterns like String(err) in catch blocks.
 *
 * Usage:
 *   pnpm check:errors
 *   node --import tsx scripts/check-error-patterns.ts --baseline 50
 */

import fs from "node:fs";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "src");
const INFRA_ERRORS_DIR = path.join(SRC_DIR, "infra", "errors");

interface Violation {
  file: string;
  line: number;
  pattern: string;
  context: string;
}

const violations: Violation[] = [];

function isExcluded(filePath: string): boolean {
  // Exclude the error infrastructure itself
  return filePath.startsWith(INFRA_ERRORS_DIR);
}

function scanFile(filePath: string): void {
  if (isExcluded(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Pattern 1: String(err) in catch blocks
    if (line.includes("String(err)")) {
      // Check if we're in a catch block (look back up to 5 lines)
      let inCatch = false;
      for (let j = Math.max(0, i - 5); j <= i; j++) {
        if (lines[j].includes("catch (")) {
          inCatch = true;
          break;
        }
      }

      if (inCatch) {
        violations.push({
          file: path.relative(process.cwd(), filePath),
          line: lineNum,
          pattern: "String(err) in catch block",
          context: line.trim(),
        });
      }
    }

    // Pattern 2: err instanceof Error ? err.message : String(err)
    if (line.includes("instanceof Error") && line.includes("String(err)")) {
      violations.push({
        file: path.relative(process.cwd(), filePath),
        line: lineNum,
        pattern: "instanceof Error ternary with String(err)",
        context: line.trim(),
      });
    }

    // Pattern 3: Bare err.message without instanceof check (stricter check)
    if (line.match(/\berr\.message\b/) && !line.includes("instanceof") && !line.includes("//")) {
      // Only flag if it looks like error handling code
      if (line.includes("error:") || line.includes("Error:") || line.includes("log.")) {
        violations.push({
          file: path.relative(process.cwd(), filePath),
          line: lineNum,
          pattern: "bare err.message",
          context: line.trim(),
        });
      }
    }
  }
}

function walkDir(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      scanFile(fullPath);
    }
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const baselineIndex = args.indexOf("--baseline");
  const baseline = baselineIndex !== -1 ? parseInt(args[baselineIndex + 1], 10) : undefined;

  console.log("🔍 Scanning for discouraged error patterns...\n");

  walkDir(SRC_DIR);

  console.log(`Found ${violations.length} violation(s):\n`);

  if (violations.length > 0) {
    // Group by pattern
    const byPattern = new Map<string, Violation[]>();
    for (const v of violations) {
      const list = byPattern.get(v.pattern) ?? [];
      list.push(v);
      byPattern.set(v.pattern, list);
    }

    for (const [pattern, viols] of byPattern) {
      console.log(`\n${pattern} (${viols.length}):`);
      for (const v of viols.slice(0, 10)) {
        // Show first 10
        console.log(`  ${v.file}:${v.line}`);
        console.log(`    ${v.context}`);
      }
      if (viols.length > 10) {
        console.log(`  ... and ${viols.length - 10} more`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Total violations: ${violations.length}`);

  if (baseline !== undefined) {
    console.log(`Baseline: ${baseline}`);
    if (violations.length > baseline) {
      console.log(`❌ FAIL: Violations increased (${violations.length} > ${baseline})`);
      process.exit(1);
    } else {
      console.log(`✅ PASS: Violations within baseline (${violations.length} <= ${baseline})`);
      process.exit(0);
    }
  } else {
    console.log(`\n💡 Run with --baseline ${violations.length} to set current count as baseline`);
    // Don't fail if no baseline set, just report
    process.exit(0);
  }
}

main();
