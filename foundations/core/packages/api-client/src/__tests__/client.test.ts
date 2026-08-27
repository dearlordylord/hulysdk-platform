//
// Copyright © 2025 Hardcore Engineering Inc.
//

import { getClient as getAccountClient } from '@hcengineering/account-client'
import { getClient as getCollaboratorClient } from '@hcengineering/collaborator-client'
import {
  AccountRole,
  type Client,
  DOMAIN_TRANSIENT,
  SocialIdType,
  type Tx,
  type TxResult
} from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'

import { connect } from '../client'
import { loadServerConfig } from '../config'
import { MarkupContent } from '../markup/types'
import { getWorkspaceToken } from '../utils'

jest.mock('@hcengineering/account-client', () => ({
  getClient: jest.fn()
}))

jest.mock('@hcengineering/collaborator-client', () => ({
  getClient: jest.fn()
}))

jest.mock('@hcengineering/platform', () => {
  const actual = jest.requireActual('@hcengineering/platform')
  return {
    ...actual,
    addLocation: jest.fn(),
    getResource: jest.fn()
  }
})

jest.mock('../config', () => ({
  loadServerConfig: jest.fn()
}))

jest.mock('../utils', () => ({
  getWorkspaceToken: jest.fn()
}))

describe('connect createDoc markup processing', () => {
  const config = {
    ACCOUNTS_URL: 'https://accounts.example.com',
    COLLABORATOR_URL: 'https://collaborator.example.com',
    FILES_URL: 'https://files.example.com',
    UPLOAD_URL: 'https://upload.example.com'
  }
  const workspace = 'workspace-id' as any
  const token = 'workspace-token'
  const endpoint = 'https://transactor.example.com'
  const objectClass = 'class:test.Doc' as any
  const space = 'space:test' as any
  const objectId = 'doc-id' as any
  const markupRef = 'markup-ref' as any

  const mockedLoadServerConfig = jest.mocked(loadServerConfig)
  const mockedGetWorkspaceToken = jest.mocked(getWorkspaceToken)
  const mockedGetAccountClient = jest.mocked(getAccountClient)
  const mockedGetCollaboratorClient = jest.mocked(getCollaboratorClient)
  const mockedGetResource = jest.mocked(getResource)

  let connection: Client
  let transaction: jest.MockedFunction<(tx: Tx) => Promise<TxResult>>
  let uploadMarkup: jest.MockedFunction<(
    objectClass: any,
    objectId: any,
    objectAttr: string,
    value: string,
    format: 'markup' | 'html' | 'markdown'
  ) => Promise<any>>

  beforeEach(() => {
    jest.clearAllMocks()

    const hierarchy = {
      isDerived: jest.fn().mockReturnValue(false),
      findDomain: jest.fn().mockReturnValue(DOMAIN_TRANSIENT)
    }

    transaction = jest.fn().mockResolvedValue({})
    connection = {
      getHierarchy: jest.fn().mockReturnValue(hierarchy),
      getModel: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      tx: transaction,
      searchFulltext: jest.fn(),
      close: jest.fn(),
      domainRequest: jest.fn()
    }

    const clientFactory = jest.fn().mockResolvedValue(connection)
    mockedGetResource.mockResolvedValue(clientFactory)

    const socialId = {
      _id: 'social-id' as any,
      type: SocialIdType.HULY,
      value: 'person-id',
      key: 'huly:person-id'
    }
    const workspaceInfo = {
      account: 'account-id' as any,
      role: AccountRole.User,
      workspace,
      workspaceUrl: 'test-workspace',
      endpoint,
      token
    }
    const accountClient = {
      getSocialIds: jest.fn().mockResolvedValue([socialId]),
      selectWorkspace: jest.fn().mockResolvedValue(workspaceInfo)
    }
    mockedGetAccountClient.mockReturnValue(accountClient as any)

    uploadMarkup = jest.fn()
    mockedGetCollaboratorClient.mockReturnValue({ createMarkup: uploadMarkup } as any)

    mockedLoadServerConfig.mockResolvedValue(config)
    mockedGetWorkspaceToken.mockResolvedValue({
      endpoint,
      token,
      workspaceId: workspace,
      info: workspaceInfo as any
    })
  })

  async function createClient () {
    return await connect('https://huly.example.com', { token: 'account-token', workspace: 'test-workspace' })
  }

  it('waits for markup upload before invoking the transaction and passes its resolved reference', async () => {
    let resolveUpload!: (ref: any) => void
    uploadMarkup.mockReturnValue(new Promise((resolve) => {
      resolveUpload = resolve
    }))

    const client = await createClient()
    const createDocPromise = client.createDoc(objectClass, space, {
      content: new MarkupContent('rich text', 'markup')
    } as any, objectId)

    await Promise.resolve()
    expect(transaction).not.toHaveBeenCalled()

    resolveUpload(markupRef)
    await expect(createDocPromise).resolves.toBe(objectId)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0]?.[0]).toMatchObject({
      attributes: { content: markupRef }
    })
  })

  it('rejects createDoc when markup upload rejects and does not invoke the transaction', async () => {
    const uploadError = new Error('upload failed')
    uploadMarkup.mockRejectedValue(uploadError)

    const client = await createClient()

    await expect(
      client.createDoc(objectClass, space, {
        content: new MarkupContent('rich text', 'markup')
      } as any, objectId)
    ).rejects.toBe(uploadError)

    expect(transaction).not.toHaveBeenCalled()
  })
})
