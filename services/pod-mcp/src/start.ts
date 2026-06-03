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

import { setMetadata } from '@hcengineering/platform'
import serverClient, { extractToken } from '@hcengineering/server-client'
import serverToken from '@hcengineering/server-token'
import cors from 'cors'
import express, { type Request, type Response } from 'express'

import config from './config'
import { createMcpProtocolHandlers } from './mcp/handlers'
import { dispatchMcp2026Request, shouldDispatchMcp2026Request } from './mcp/http-2026-dispatcher'
import { type HulySession, resolveSession } from './session'

const HTTP_UNAUTHORIZED = 401
const HTTP_BAD_REQUEST = 400

const extractRawToken = (authorization: string | undefined): string | undefined => {
  if (authorization === undefined) return undefined
  const match = /^Bearer (.+)$/i.exec(authorization)
  return match?.[1]
}

const handleMcp = async (req: Request, res: Response): Promise<void> => {
  // Path A auth: the agent's `Authorization: Bearer <huly-token>` is both the
  // endpoint credential and the workspace identity. `extractToken` verifies the
  // signature against SERVER_SECRET; the raw string opens the transactor session.
  const token = extractToken(req.headers)
  const rawToken = extractRawToken(req.headers.authorization)
  if (token === undefined || rawToken === undefined) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    res.status(HTTP_UNAUTHORIZED).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Unauthorized: provide a Huly token via Authorization: Bearer' }
    })
    return
  }

  if (!shouldDispatchMcp2026Request(req)) {
    res.status(HTTP_BAD_REQUEST).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'This endpoint serves MCP 2026-07-28 only; set MCP-Protocol-Version: 2026-07-28' }
    })
    return
  }

  let session: HulySession | undefined
  const getSession = async (): Promise<HulySession> => {
    if (session === undefined) {
      session = await resolveSession(token, rawToken)
    }
    return session
  }

  res.on('close', () => {
    void session?.close()
  })

  await dispatchMcp2026Request(req, res, createMcpProtocolHandlers(getSession))
}

export const start = async (): Promise<void> => {
  setMetadata(serverToken.metadata.Secret, config.ServerSecret)
  setMetadata(serverToken.metadata.Service, config.ServiceID)
  setMetadata(serverClient.metadata.Endpoint, config.AccountsURL)

  const app = express()
  app.use(cors())
  app.use(express.json())

  app.post('/mcp', (req: Request, res: Response) => {
    void handleMcp(req, res)
  })

  const server = app.listen(config.Port, () => {
    // eslint-disable-next-line no-console
    console.log(`pod-mcp listening on :${config.Port}/mcp`)
  })

  const onClose = (): void => {
    server.close(() => process.exit())
  }
  process.on('SIGINT', onClose)
  process.on('SIGTERM', onClose)
}
