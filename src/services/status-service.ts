import { z } from "zod";
import { apmPaths, ensureApm } from "../storage/paths";
import { readJson } from "../storage/json";
import { STATUS_SHAPE_HINT, StatusSchema } from "../schemas/status";
import { nowLocal } from "../core/time";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";

export function readStatus(cwd: string) {
  ensureApm(cwd);
  return readJson(apmPaths(cwd).status, StatusSchema, { label: "status file", expectedShapeHint: STATUS_SHAPE_HINT });
}

export function updateStatus(cwd: string, patch: Partial<z.infer<typeof StatusSchema>>): Promise<void> {
  const p = apmPaths(cwd);
  const next = { ...readStatus(cwd), ...patch, updatedAt: nowLocal() };
  return withGlobalLock(p.lock, async () => {
    await serialWrite(p.status, async () => {
      await atomicWrite(p.status, JSON.stringify(next, null, 2));
    });
  });
}

