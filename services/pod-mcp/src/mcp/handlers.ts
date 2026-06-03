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

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

import { type HulySession } from '../session'
import { toolByName, tools } from '../tools'
import { type McpProtocolHandlers } from './protocol-handlers'

const SERVER_NAME = 'huly-mcp'
const SERVER_VERSION = '0.7.0'

// Per-request handlers. `getSession` is lazy + memoized so discovery/list calls,
// which need no Huly session, don't pay to open a transactor connection.
export function createMcpProtocolHandlers (getSession: () => Promise<HulySession>): McpProtocolHandlers {
  return {
    serverDiscover: () => ({
      resultType: 'complete',
      supportedVersions: ['2026-07-28'] as const,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
    }),

    listTools: async () => ({ tools: tools.map((tool) => tool.definition) }),

    callTool: async (request) => {
      const tool = toolByName.get(request.params.name)
      if (tool === undefined) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`)
      }
      const session = await getSession()
      return await tool.run(session, request.params.arguments)
    },

    // Resources are out of scope for the PoC.
    listResources: async () => ({ resources: [] }),
    listResourceTemplates: () => ({ resourceTemplates: [] }),
    readResource: async () => {
      throw new McpError(ErrorCode.InvalidParams, 'Resources are not supported by this server')
    },

    drainInflight: async () => {}
  }
}
