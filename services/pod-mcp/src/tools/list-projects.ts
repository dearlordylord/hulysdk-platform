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
import tracker from '@hcengineering/tracker'

import { type HulySession } from '../session'

export const listProjectsDefinition: Tool = {
  name: 'list_projects',
  description: "List all projects in the Huly workspace. Returns each project's identifier (e.g. \"HULY\"), name, and description.",
  inputSchema: {
    type: 'object',
    properties: {}
  }
}

export async function listProjects (session: HulySession): Promise<CallToolResult> {
  const projects = await session.ops.findAll(tracker.class.Project, {})
  const rows = projects.map((p) => ({
    identifier: p.identifier,
    name: p.name,
    description: p.description
  }))
  return {
    content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }]
  }
}
