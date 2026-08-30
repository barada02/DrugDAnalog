/**
 * Minimal typing for the WebMCP draft API. Note it is `document.modelContext`,
 * not `navigator.modelContext` — the getter moved to Document in the May 2026
 * draft and the Navigator name is deprecated as of Chromium 150.
 */
export {}

type JSONSchema = {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export type ToolDescriptor = {
  name: string
  description: string
  inputSchema: JSONSchema
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
  execute: (args: never, context: { signal: AbortSignal }) => Promise<ToolResult> | ToolResult
}

export interface ModelContext {
  registerTool(tool: ToolDescriptor, options?: { signal?: AbortSignal }): Promise<void>
  getTools(): Promise<{ name: string }[]>
}

declare global {
  interface Document {
    modelContext?: ModelContext
  }
}
