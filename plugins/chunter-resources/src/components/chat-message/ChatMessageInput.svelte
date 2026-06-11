<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
-->
<script lang="ts">
  import activity, { ActivityMessage } from '@hcengineering/activity'
  import { Analytics } from '@hcengineering/analytics'
  import { AttachmentRefInput } from '@hcengineering/attachment-resources'
  import chunter, { ChatMessage, ChunterEvents, ThreadMessage } from '@hcengineering/chunter'
  import { Class, Doc, generateId, getCurrentAccount, Ref, type CommitResult } from '@hcengineering/core'
  import { createQuery, DraftController, draftsStore, getClient } from '@hcengineering/presentation'
  import { EmptyMarkup, isEmptyMarkup } from '@hcengineering/text'
  import { createEventDispatcher } from 'svelte'
  import { getObjectId } from '@hcengineering/view-resources'
  import { ThrottledCaller } from '@hcengineering/ui'
  import { getSpace, editingMessageStore } from '@hcengineering/activity-resources'

  import { getChannelSpace } from '../../utils'
  import ChannelTypingInfo from '../ChannelTypingInfo.svelte'

  export let object: Doc
  export let chatMessage: ChatMessage | undefined = undefined
  export let shouldSaveDraft: boolean = true
  export let focusIndex: number = -1
  export let boundary: HTMLElement | undefined = undefined
  export let loading = false
  export let collection: string = 'comments'
  export let autofocus = false
  export let withTypingInfo = false
  export let onKeyDown: ((e: KeyboardEvent) => void) | undefined = undefined

  import { setTyping, clearTyping } from '@hcengineering/presence-resources'

  type MessageDraft = Pick<ChatMessage, '_id' | 'message' | 'attachments'>

  const dispatch = createEventDispatcher()

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const createdMessageQuery = createQuery()

  const emptyMessage: Pick<MessageDraft, 'message' | 'attachments'> = {
    message: EmptyMarkup,
    attachments: 0
  }

  let inputRef: AttachmentRefInput | undefined
  let objectId = object._id
  let objectClass = object._class
  let chatMessageId = chatMessage?._id
  let _class: Ref<Class<ChatMessage>> = getMessageClass(object)
  let draftKey = getDraftKey(object, _class)
  let draftController = new DraftController<MessageDraft>(draftKey)
  let currentDraft = shouldSaveDraft ? $draftsStore[draftKey] : undefined
  let currentMessage: MessageDraft = chatMessage ?? currentDraft ?? getDefault()
  let _id = currentMessage._id
  let inputContent = currentMessage.message

  $: currentDraft = shouldSaveDraft ? $draftsStore[draftKey] : undefined

  $: {
    const nextClass = getMessageClass(object)
    const nextDraftKey = getDraftKey(object, nextClass)
    if (
      objectId !== object._id ||
      objectClass !== object._class ||
      chatMessageId !== chatMessage?._id ||
      draftKey !== nextDraftKey
    ) {
      resetObjectState(nextClass, nextDraftKey)
    }
  }

  $: if (currentDraft != null) {
    createdMessageQuery.query(_class, { _id, space: getSpace(object) }, (result: ChatMessage[]) => {
      if (result.length > 0 && _id !== chatMessage?._id) {
        // Ouch we have got comment with same id created already.
        clear()
      }
    })
  } else {
    createdMessageQuery.unsubscribe()
  }

  function clear (): void {
    currentMessage = getDefault()
    _id = currentMessage._id
    inputContent = currentMessage.message
    inputRef?.removeDraft(false)
  }

  function objectChange (draft: MessageDraft, empty: Partial<MessageDraft>): void {
    if (shouldSaveDraft) {
      draftController.save(draft, empty)
    }
  }

  $: objectChange(currentMessage, emptyMessage)

  function getDefault (): MessageDraft {
    return {
      _id: generateId(),
      ...emptyMessage
    }
  }

  function getMessageClass (object: Doc): Ref<Class<ChatMessage>> {
    return hierarchy.isDerived(object._class, activity.class.ActivityMessage)
      ? chunter.class.ThreadMessage
      : chunter.class.ChatMessage
  }

  function getDraftKey (object: Doc, _class: Ref<Class<ChatMessage>>): string {
    return `${object._id}_${_class}`
  }

  function resetObjectState (nextClass: Ref<Class<ChatMessage>>, nextDraftKey: string): void {
    objectId = object._id
    objectClass = object._class
    chatMessageId = chatMessage?._id
    _class = nextClass
    draftKey = nextDraftKey
    draftController = new DraftController<MessageDraft>(draftKey)
    currentDraft = shouldSaveDraft ? $draftsStore[draftKey] : undefined
    currentMessage = chatMessage ?? currentDraft ?? getDefault()
    _id = currentMessage._id
    inputContent = currentMessage.message
    createdMessageQuery.unsubscribe()
    inputRef?.removeDraft(false)
  }

  const acc = getCurrentAccount()
  const throttle = new ThrottledCaller(500)

  async function deleteTypingInfo (targetObject: Doc): Promise<void> {
    if (!withTypingInfo) return
    void clearTyping(acc.primarySocialId, targetObject._id)
  }

  async function updateTypingInfo (): Promise<void> {
    if (!withTypingInfo) return

    throttle.call(() => {
      void setTyping(acc.primarySocialId, object._id)
    })
  }

  function onUpdate (event: CustomEvent): void {
    if (!isEmptyMarkup(event.detail.message)) {
      void updateTypingInfo()
    }
    if (!shouldSaveDraft) {
      return
    }
    const { message, attachments } = event.detail
    currentMessage.message = message
    currentMessage.attachments = attachments
  }

  async function handleCreate (
    event: CustomEvent,
    _id: Ref<ChatMessage>,
    targetObject: Doc,
    targetClass: Ref<Class<ChatMessage>>,
    targetCollection: string
  ): Promise<void> {
    try {
      const res = await createMessage(
        event,
        _id,
        targetObject,
        targetClass,
        targetCollection,
        `chunter.create.${targetClass} ${targetObject._class}`
      )

      console.log(`create.${targetClass} measure`, res.serverTime, res.time)
      const objectId = await getObjectId(targetObject, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageCreated, {
        ok: res.result,
        objectId,
        objectClass: targetObject._class
      })
    } catch (err: any) {
      const objectId = await getObjectId(targetObject, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageCreated, { ok: false, objectId, objectClass: targetObject._class })
      Analytics.handleError(err)
    }
  }

  async function handleEdit (event: CustomEvent): Promise<void> {
    try {
      await editMessage(event)
      const objectId = await getObjectId(object, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageEdited, { ok: true, objectId, objectClass: object._class })
    } catch (err: any) {
      const objectId = await getObjectId(object, client.getHierarchy())
      Analytics.handleEvent(ChunterEvents.MessageEdited, { ok: false, objectId, objectClass: object._class })
      Analytics.handleError(err)
    }
  }

  async function onMessage (event: CustomEvent): Promise<void> {
    const submitObject = object
    const submitClass = _class
    const submitCollection = collection
    const submitId = _id

    draftController.remove()
    inputRef?.removeDraft(false)

    if (chatMessage !== undefined) {
      loading = true
      await handleEdit(event)
    } else {
      void handleCreate(event, submitId, submitObject, submitClass, submitCollection)
      void deleteTypingInfo(submitObject)
    }

    // Remove draft from Local Storage
    clear()
    dispatch('submit', false)
    loading = false
  }

  async function createMessage (
    event: CustomEvent,
    _id: Ref<ChatMessage>,
    targetObject: Doc,
    targetClass: Ref<Class<ChatMessage>>,
    targetCollection: string,
    msg: string
  ): Promise<CommitResult> {
    const { message, attachments } = event.detail
    const operations = client.apply(undefined, msg)

    if (targetClass === chunter.class.ThreadMessage) {
      const parentMessage = targetObject as ActivityMessage

      await operations.addCollection<ActivityMessage, ThreadMessage>(
        chunter.class.ThreadMessage,
        parentMessage.space,
        parentMessage._id,
        parentMessage._class,
        'replies',
        {
          message,
          attachments,
          objectClass: parentMessage.attachedToClass,
          objectId: parentMessage.attachedTo
        },
        _id as Ref<ThreadMessage>
      )
    } else {
      await operations.addCollection<Doc, ChatMessage>(
        targetClass,
        getSpace(targetObject),
        targetObject._id,
        targetObject._class,
        targetCollection,
        { message, attachments },
        _id
      )
    }
    return await operations.commit()
  }

  async function editMessage (event: CustomEvent): Promise<void> {
    if (chatMessage === undefined) {
      return
    }
    const { message, attachments } = event.detail
    await client.update(chatMessage, { message, attachments, editedOn: Date.now() })
  }
  export function submit (): void {
    inputRef?.submit()
  }

  function handleKeyDown (event: KeyboardEvent): boolean {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (inputRef?.isEmptyDraft() === true && chatMessage == null) {
        onKeyDown?.(event)
      }
    }

    if (event.key === 'Escape') {
      if ($editingMessageStore === undefined) return false
      event.stopPropagation()
      event.preventDefault()
      editingMessageStore.set(undefined)
    }
    return false
  }
</script>

<AttachmentRefInput
  {focusIndex}
  bind:this={inputRef}
  bind:content={inputContent}
  docId={object._id}
  docClass={object._class}
  {_class}
  space={getChannelSpace(object._class, object._id, object.space)}
  skipAttachmentsPreload={(currentMessage.attachments ?? 0) === 0}
  bind:objectId={_id}
  {shouldSaveDraft}
  {boundary}
  {autofocus}
  on:message={onMessage}
  on:update={onUpdate}
  on:focus
  on:blur
  bind:loading
  onKeyDown={handleKeyDown}
/>

{#if withTypingInfo}
  <ChannelTypingInfo {object} />
{/if}
