import React from "react";
import { getTableName } from "drizzle-orm";
import type { SmithersCtx } from "./SmithersCtx";
import type { OutputKey } from "./OutputKey";
import type { TaskScopeInfo } from "./utils/loop-scope";
import { getScopedTaskNodeId } from "./utils/loop-scope";

export type OutputSnapshot = {
  [tableName: string]: Array<any>;
};

function normalizeInputRow(input: any) {
  if (!input || typeof input !== "object") return input;
  if (!("payload" in input)) return input;
  const keys = Object.keys(input);
  const payloadOnly = keys.every((key) => key === "runId" || key === "payload");
  if (!payloadOnly) return input;
  const payload = (input as any).payload;
  if (payload == null) return {};
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return payload;
    }
  }
  return payload;
}

export function buildContext<Schema>(opts: {
  runId: string;
  iteration: number;
  iterations?: Record<string, number>;
  taskScopeMap?: Record<string, TaskScopeInfo>;
  input: any;
  outputs: OutputSnapshot;
  zodToKeyName?: Map<any, string>;
}): SmithersCtx<Schema> {
  const {
    runId,
    iteration,
    iterations,
    taskScopeMap,
    input,
    outputs,
    zodToKeyName,
  } = opts;
  const normalizedInput = normalizeInputRow(input);

  const outputsFn: any = (table: string) => {
    return outputs[table] ?? [];
  };

  for (const [name, rows] of Object.entries(outputs)) {
    outputsFn[name] = rows;
  }

  function resolveTableName(table: any): string {
    if (typeof table === "string") return table;
    // Zod schema — resolve via zodToKeyName map
    if (zodToKeyName) {
      const key = zodToKeyName.get(table);
      if (key) return key;
    }
    // Drizzle table object — extract snake_case table name
    try {
      const name = getTableName(table);
      if (name && typeof name === "string") return name;
    } catch {}
    return String(table);
  }

  function resolveNodeId(nodeId: string): string {
    return getScopedTaskNodeId(nodeId, taskScopeMap?.[nodeId], iterations);
  }

  function resolveIteration(nodeId: string, explicitIteration?: number): number {
    if (typeof explicitIteration === "number") return explicitIteration;
    const ownLoopId = taskScopeMap?.[nodeId]?.ownLoopId;
    if (ownLoopId) return iterations?.[ownLoopId] ?? 0;
    return iteration;
  }

  function resolveRow<T>(table: any, key: OutputKey): T | undefined {
    const tableName = resolveTableName(table);
    const rows = outputs[tableName] ?? [];
    const scopedNodeId = resolveNodeId(key.nodeId);
    const targetIteration = resolveIteration(key.nodeId, key.iteration);
    return rows.find((row) => {
      if (row.nodeId !== scopedNodeId) return false;
      return (row.iteration ?? 0) === targetIteration;
    });
  }

  return {
    runId,
    iteration,
    iterations,
    input: normalizedInput,
    outputs: outputsFn,
    output(table: any, key: OutputKey): any {
      const row = resolveRow(table, key);
      if (!row) {
        throw new Error(
          `Missing output for nodeId=${key.nodeId} iteration=${key.iteration ?? 0}`,
        );
      }
      return row;
    },
    outputMaybe(table: any, key: OutputKey): any {
      return resolveRow(table, key);
    },
    latest(table: any, nodeId: string): any {
      const tableName = resolveTableName(table);
      const tableRows = outputs[tableName] ?? [];
      const scopedNodeId = resolveNodeId(nodeId);
      let best: any = undefined;
      let bestIteration = -Infinity;
      for (const row of tableRows) {
        if (!row || row.nodeId !== scopedNodeId) continue;
        const iter = Number.isFinite(Number(row.iteration))
          ? Number(row.iteration)
          : 0;
        if (!best || iter >= bestIteration) {
          best = row;
          bestIteration = iter;
        }
      }
      return best;
    },
    latestArray(value: unknown, schema: import("zod").ZodType): any[] {
      if (value == null) return [];
      let arr: unknown[];
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          arr = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [];
        }
      } else if (Array.isArray(value)) {
        arr = value;
      } else {
        arr = [value];
      }
      const result: any[] = [];
      for (const item of arr) {
        const parsed = schema.safeParse(item);
        if (parsed.success) {
          result.push(parsed.data);
        }
      }
      return result;
    },
    iterationCount(table: any, nodeId: string): number {
      const tableName = resolveTableName(table);
      const tableRows = outputs[tableName] ?? [];
      const scopedNodeId = resolveNodeId(nodeId);
      const seen = new Set<number>();
      for (const row of tableRows) {
        if (!row || row.nodeId !== scopedNodeId) continue;
        const iter = Number.isFinite(Number(row.iteration))
          ? Number(row.iteration)
          : 0;
        seen.add(iter);
      }
      return seen.size;
    },
  };
}

export function createSmithersContext<Schema>() {
  const SmithersContext = React.createContext<SmithersCtx<Schema> | null>(null);

  function useCtx(): SmithersCtx<Schema> {
    const ctx = React.useContext(SmithersContext);
    if (!ctx) {
      throw new Error(
        "useCtx() must be called inside a <Workflow> created by createSmithers()",
      );
    }
    return ctx;
  }

  return { SmithersContext, useCtx };
}
