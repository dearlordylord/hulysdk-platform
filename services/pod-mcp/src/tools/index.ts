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

import { type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'

import { type HulySession } from '../session'
import { createIssue, createIssueDefinition } from './create-issue'
import { listProjects, listProjectsDefinition } from './list-projects'

export interface McpTool {
  readonly definition: Tool
  readonly run: (session: HulySession, args: unknown) => Promise<CallToolResult>
}

export const tools: readonly McpTool[] = [
  { definition: listProjectsDefinition, run: async (session) => await listProjects(session) },
  { definition: createIssueDefinition, run: async (session, args) => await createIssue(session, args) }
]

export const toolByName: ReadonlyMap<string, McpTool> = new Map(
  tools.map((tool) => [tool.definition.name, tool])
)
