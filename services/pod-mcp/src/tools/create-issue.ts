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
import core, { type MarkupBlobRef, type Ref, SortingOrder, generateId } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import tracker, { type Issue, IssuePriority } from '@hcengineering/tracker'

import { type HulySession } from '../session'

export const createIssueDefinition: Tool = {
  name: 'create_issue',
  description:
    'Create an issue in a Huly project. Provide the project identifier (e.g. "HULY") and a title. Returns the new issue identifier (e.g. "HULY-42").',
  inputSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'Project identifier, e.g. "HULY"' },
      title: { type: 'string', description: 'Issue title' }
    },
    required: ['project', 'title']
  }
}

interface CreateIssueArgs {
  project: string
  title: string
}

function parseArgs (args: unknown): CreateIssueArgs {
  if (typeof args !== 'object' || args === null) {
    throw new Error('Arguments object is required')
  }
  const record = args as Record<string, unknown>
  if (typeof record.project !== 'string' || record.project === '') {
    throw new Error('project (identifier) is required')
  }
  if (typeof record.title !== 'string' || record.title === '') {
    throw new Error('title is required')
  }
  return { project: record.project, title: record.title }
}

export async function createIssue (session: HulySession, rawArgs: unknown): Promise<CallToolResult> {
  const args = parseArgs(rawArgs)
  const client = session.ops

  const project = await client.findOne(tracker.class.Project, { identifier: args.project })
  if (project === undefined) {
    throw new Error(`Project not found: ${args.project}`)
  }

  const issueId: Ref<Issue> = generateId()

  // Increment the project's issue sequence to get the next issue number.
  const incResult = await client.updateDoc(
    tracker.class.Project,
    core.space.Space,
    project._id,
    { $inc: { sequence: 1 } },
    true
  )
  const sequence = (incResult as any).object.sequence

  // Insert after the last issue (rank ordering within the project).
  const lastOne = await client.findOne<Issue>(
    tracker.class.Issue,
    { space: project._id },
    { sort: { rank: SortingOrder.Descending } }
  )

  await client.addCollection(
    tracker.class.Issue,
    project._id,
    project._id,
    project._class,
    'issues',
    {
      title: args.title,
      // PoC: empty description. Rich markdown needs a storage-backed markup upload (v2).
      description: '' as MarkupBlobRef,
      status: project.defaultIssueStatus,
      number: sequence,
      kind: tracker.taskTypes.Issue,
      identifier: `${project.identifier}-${sequence}`,
      priority: IssuePriority.NoPriority,
      assignee: null,
      component: null,
      estimation: 0,
      remainingTime: 0,
      reportedTime: 0,
      reports: 0,
      subIssues: 0,
      parents: [],
      childInfo: [],
      dueDate: null,
      rank: makeRank(lastOne?.rank, undefined)
    },
    issueId
  )

  return {
    content: [{ type: 'text', text: `Created issue ${project.identifier}-${sequence}` }]
  }
}
