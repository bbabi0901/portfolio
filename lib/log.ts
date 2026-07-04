export interface ApiLogContext {
  route: string
  level: "info" | "warn" | "error"
  durationMs?: number
  status?: number
  error?: string
  model?: string
}

export function logApi(ctx: ApiLogContext): void {
  // stdout only — never log tokens, API keys, or IPs
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...ctx }))
}
