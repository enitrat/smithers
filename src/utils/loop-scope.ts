export type LoopScopeEntry = {
  logicalId: string;
  iteration: number;
};

export type TaskScopeInfo = {
  ancestorLoopIds: string[];
  ownLoopId?: string;
};

function encodeScopeId(value: string): string {
  return encodeURIComponent(value);
}

function renderScopePath(entries: LoopScopeEntry[]): string {
  return entries
    .map((entry) => `${encodeScopeId(entry.logicalId)}=${entry.iteration}`)
    .join("/");
}

export function scopeLoopId(
  logicalId: string,
  ancestors: LoopScopeEntry[],
): string {
  if (ancestors.length === 0) return logicalId;
  return `${logicalId}@@${renderScopePath(ancestors)}`;
}

export function scopeTaskId(
  logicalId: string,
  ancestors: LoopScopeEntry[],
): string {
  if (ancestors.length === 0) return logicalId;
  return `${logicalId}@@${renderScopePath(ancestors)}`;
}

export function buildCurrentLoopIterations(
  loopScopeMap: Record<string, string[]>,
  scopedIterations: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(loopScopeMap).sort(
    (a, b) => a[1].length - b[1].length,
  );
  const iterations: Record<string, number> = {};

  for (const [logicalId, ancestorLoopIds] of entries) {
    const scopedId = scopeLoopId(
      logicalId,
      ancestorLoopIds.map((ancestorId) => ({
        logicalId: ancestorId,
        iteration: iterations[ancestorId] ?? 0,
      })),
    );
    iterations[logicalId] = scopedIterations[scopedId] ?? 0;
  }

  return iterations;
}

export function getCurrentIterationValue(
  loopScopeMap: Record<string, string[]>,
  iterations: Record<string, number>,
): number {
  let bestDepth = -1;
  let bestIteration = 0;

  for (const [logicalId, ancestors] of Object.entries(loopScopeMap)) {
    if (ancestors.length < bestDepth) continue;
    bestDepth = ancestors.length;
    bestIteration = iterations[logicalId] ?? 0;
  }

  return bestIteration;
}

export function getScopedTaskNodeId(
  logicalNodeId: string,
  taskScope: TaskScopeInfo | undefined,
  iterations: Record<string, number> | undefined,
): string {
  if (!taskScope || taskScope.ancestorLoopIds.length === 0) {
    return logicalNodeId;
  }
  return scopeTaskId(
    logicalNodeId,
    taskScope.ancestorLoopIds.map((loopId) => ({
      logicalId: loopId,
      iteration: iterations?.[loopId] ?? 0,
    })),
  );
}
