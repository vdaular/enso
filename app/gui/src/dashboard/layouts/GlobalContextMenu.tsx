/** @file A context menu available everywhere in the directory. */
import { useStore } from 'zustand'

import AssetListEventType from '#/events/AssetListEventType'

import ContextMenu from '#/components/ContextMenu'
import ContextMenuEntry from '#/components/ContextMenuEntry'

import UpsertDatalinkModal from '#/modals/UpsertDatalinkModal'
import UpsertSecretModal from '#/modals/UpsertSecretModal'

import { useDispatchAssetListEvent } from '#/layouts/AssetsTable/EventListProvider'
import { useDriveStore } from '#/providers/DriveProvider'
import { useSetModal } from '#/providers/ModalProvider'
import { useText } from '#/providers/TextProvider'
import type * as backendModule from '#/services/Backend'
import type Backend from '#/services/Backend'
import { BackendType } from '#/services/Backend'
import { inputFiles } from '#/utilities/input'

/** Props for a {@link GlobalContextMenu}. */
export interface GlobalContextMenuProps {
  readonly hidden?: boolean
  readonly backend: Backend
  readonly rootDirectoryId: backendModule.DirectoryId
  readonly directoryKey: backendModule.DirectoryId | null
  readonly directoryId: backendModule.DirectoryId | null
  readonly doPaste: (
    newParentKey: backendModule.DirectoryId,
    newParentId: backendModule.DirectoryId,
  ) => void
}

/** A context menu available everywhere in the directory. */
export const GlobalContextMenu = function GlobalContextMenu(props: GlobalContextMenuProps) {
  // For some reason, applying the ReactCompiler for this component breaks the copy-paste functionality
  // eslint-disable-next-line react-compiler/react-compiler
  'use no memo'

  const {
    hidden = false,
    backend,
    directoryKey = null,
    directoryId = null,
    rootDirectoryId,
  } = props
  const { doPaste } = props

  const { getText } = useText()
  const { setModal, unsetModal } = useSetModal()
  const dispatchAssetListEvent = useDispatchAssetListEvent()

  const driveStore = useDriveStore()
  const hasPasteData = useStore(
    driveStore,
    (storeState) => (storeState.pasteData?.data.ids.size ?? 0) > 0,
  )

  const isCloud = backend.type === BackendType.remote

  return (
    <ContextMenu aria-label={getText('globalContextMenuLabel')} hidden={hidden}>
      <ContextMenuEntry
        hidden={hidden}
        action="uploadFiles"
        doAction={async () => {
          const files = await inputFiles()
          dispatchAssetListEvent({
            type: AssetListEventType.uploadFiles,
            parentKey: directoryKey ?? rootDirectoryId,
            parentId: directoryId ?? rootDirectoryId,
            files: Array.from(files),
          })
        }}
      />
      <ContextMenuEntry
        hidden={hidden}
        action="newProject"
        doAction={() => {
          unsetModal()
          dispatchAssetListEvent({
            type: AssetListEventType.newProject,
            parentKey: directoryKey ?? rootDirectoryId,
            parentId: directoryId ?? rootDirectoryId,
            templateId: null,
            datalinkId: null,
            preferredName: null,
          })
        }}
      />
      <ContextMenuEntry
        hidden={hidden}
        action="newFolder"
        doAction={() => {
          unsetModal()
          dispatchAssetListEvent({
            type: AssetListEventType.newFolder,
            parentKey: directoryKey ?? rootDirectoryId,
            parentId: directoryId ?? rootDirectoryId,
          })
        }}
      />
      {isCloud && (
        <ContextMenuEntry
          hidden={hidden}
          action="newSecret"
          doAction={() => {
            setModal(
              <UpsertSecretModal
                id={null}
                name={null}
                doCreate={(name, value) => {
                  dispatchAssetListEvent({
                    type: AssetListEventType.newSecret,
                    parentKey: directoryKey ?? rootDirectoryId,
                    parentId: directoryId ?? rootDirectoryId,
                    name,
                    value,
                  })
                }}
              />,
            )
          }}
        />
      )}
      {isCloud && (
        <ContextMenuEntry
          hidden={hidden}
          action="newDatalink"
          doAction={() => {
            setModal(
              <UpsertDatalinkModal
                doCreate={(name, value) => {
                  dispatchAssetListEvent({
                    type: AssetListEventType.newDatalink,
                    parentKey: directoryKey ?? rootDirectoryId,
                    parentId: directoryId ?? rootDirectoryId,
                    name,
                    value,
                  })
                }}
              />,
            )
          }}
        />
      )}
      {isCloud && directoryKey == null && hasPasteData && (
        <ContextMenuEntry
          hidden={hidden}
          action="paste"
          doAction={() => {
            unsetModal()
            doPaste(rootDirectoryId, rootDirectoryId)
          }}
        />
      )}
    </ContextMenu>
  )
}
