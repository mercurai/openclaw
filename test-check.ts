import { describe, it, expect } from "vitest";
const result = await import("./src/memory/search-manager.js");
console.log("Import successful:", !!result.getMemorySearchManager);
