//
// Copyright © 2026 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Protocol-only seam consumed by the Huly-agnostic dispatcher
// (`http-2026-dispatcher.ts`). The Huly-specific implementation lives in
// `handlers.ts`; the dispatcher only ever sees this interface.

import type {
  CallToolResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  ReadResourceResult
} from '@modelcontextprotocol/sdk/types.js'

export interface ServerDiscoverResult {
  readonly resultType: 'complete'
  readonly supportedVersions: readonly ['2026-07-28']
  readonly capabilities: {
    readonly tools: Record<string, never>
    readonly resources: Record<string, never>
  }
  readonly serverInfo: {
    readonly name: string
    readonly version: string
  }
}

export interface ToolCallRequest {
  readonly params: {
    readonly name: string
    readonly arguments?: unknown
  }
}

export interface ResourceReadRequest {
  readonly params: {
    readonly uri: string
  }
}

export interface McpProtocolHandlers {
  readonly listTools: () => Promise<ListToolsResult>
  readonly callTool: (request: ToolCallRequest) => Promise<CallToolResult>
  readonly listResources: () => Promise<ListResourcesResult>
  readonly listResourceTemplates: () => ListResourceTemplatesResult
  readonly readResource: (request: ResourceReadRequest) => Promise<ReadResourceResult>
  readonly serverDiscover: () => ServerDiscoverResult
  readonly drainInflight: () => Promise<void>
}
