import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMemorySearchManager } from "./src/memory/index.js";

const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-mem-debug-"));
const indexPath = path.join(workspaceDir, "index.sqlite");
await fs.mkdir(path.join(workspaceDir, "memory"));
await fs.writeFile(path.join(workspaceDir, "MEMORY.md"), "Hello");

const cfg = {
  agents: {
    defaults: {
      workspace: workspaceDir,
      memorySearch: {
        provider: "openai",
        model: "mock-embed",
        store: { path: indexPath },
        sync: { watch: true, watchDebounceMs: 1, onSessionStart: false, onSearch: false },
      },
    },
    list: [{ id: "main", default: true }],
  },
};

try {
  const result = await getMemorySearchManager({ cfg, agentId: "main" });
  console.log("Manager:", !!result.manager);
  console.log("Error:", result.error);
} catch (err) {
  console.error("Exception:", err);
} finally {
  await fs.rm(workspaceDir, { recursive: true, force: true });
}
