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

import { isWorkspaceLoginInfo } from '@hcengineering/account-client'
import { type AccountUuid, type Client, TxOperations, type WorkspaceUuid } from '@hcengineering/core'
import { createClient, getAccountClient } from '@hcengineering/server-client'
import { type Token } from '@hcengineering/server-token'

// A resolved, per-request Huly session the tools execute against. The dispatcher
// and tool handlers never see a token — only this. That keeps auth a single seam.
export interface HulySession {
  readonly ops: TxOperations
  readonly account: AccountUuid
  readonly workspace: WorkspaceUuid
  readonly close: () => Promise<void>
}

export type SessionResolver = (token: Token, rawToken: string) => Promise<HulySession>

// Path A: the agent presents its own Huly token as `Authorization: Bearer`. We open a
// transactor session AS that user, so every tool runs with exactly that user's
// permissions. For Path B (OAuth browser flow) only this function changes — the token
// would be minted by an OAuth façade instead of pasted by the user.
export const resolveSession: SessionResolver = async (token, rawToken) => {
  if (token.workspace === undefined) {
    throw new Error('Token is not workspace-scoped; the MCP endpoint requires a workspace token')
  }

  const accountClient = getAccountClient(rawToken)

  const wsLoginInfo = await accountClient.getLoginInfoByToken()
  if (!isWorkspaceLoginInfo(wsLoginInfo)) {
    throw new Error('Token does not resolve to a workspace login')
  }

  // PoC: act as the first social id. Production should select the primary
  // (pickPrimarySocialId) — affects only the modifiedBy attribution, not access.
  const socialIds = await accountClient.getSocialIds()
  const actAs = socialIds[0]?._id
  if (actAs === undefined) {
    throw new Error('Account has no social identity')
  }

  const client: Client = await createClient(wsLoginInfo.endpoint, rawToken)
  const ops = new TxOperations(client, actAs)

  return {
    ops,
    account: token.account,
    workspace: token.workspace,
    close: async () => {
      await client.close()
    }
  }
}
