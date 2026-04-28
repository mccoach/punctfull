const DEBUG_ENABLED = false;

export function debugLog(_scope: string, _message: string, _payload?: unknown) {
  if (!DEBUG_ENABLED) return;
}

export function debugGroup(_scope: string, _title: string) {
  if (!DEBUG_ENABLED) return;
}

export function debugGroupEnd() {
  if (!DEBUG_ENABLED) return;
}
