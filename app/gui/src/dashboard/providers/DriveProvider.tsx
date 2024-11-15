/** @file The React provider (and associated hooks) for Data Catalog state. */
import * as React from 'react'

import * as zustand from '#/utilities/zustand'
import invariant from 'tiny-invariant'

import type { AssetPanelContextProps } from '#/layouts/AssetPanel'
import type { Suggestion } from '#/layouts/AssetSearchBar'
import type { Category } from '#/layouts/CategorySwitcher/Category'
import { useLocalStorage } from '#/providers/LocalStorageProvider'
import type AssetTreeNode from '#/utilities/AssetTreeNode'
import type { PasteData } from '#/utilities/pasteData'
import { EMPTY_SET } from '#/utilities/set'
import type {
  AssetId,
  BackendType,
  DirectoryAsset,
  DirectoryId,
} from 'enso-common/src/services/Backend'
import { EMPTY_ARRAY } from 'enso-common/src/utilities/data/array'
import { useEventCallback } from '../hooks/eventCallbackHooks'

// ==================
// === DriveStore ===
// ==================

/** Attached data for a paste payload. */
export interface DrivePastePayload {
  readonly backendType: BackendType
  readonly category: Category
  readonly ids: ReadonlySet<AssetId>
}

/** The state of this zustand store. */
interface DriveStore {
  readonly category: Category
  readonly setCategory: (category: Category) => void
  readonly targetDirectory: AssetTreeNode<DirectoryAsset> | null
  readonly setTargetDirectory: (targetDirectory: AssetTreeNode<DirectoryAsset> | null) => void
  readonly newestFolderId: DirectoryId | null
  readonly setNewestFolderId: (newestFolderId: DirectoryId | null) => void
  readonly canCreateAssets: boolean
  readonly setCanCreateAssets: (canCreateAssets: boolean) => void
  readonly canDownload: boolean
  readonly setCanDownload: (canDownload: boolean) => void
  readonly pasteData: PasteData<DrivePastePayload> | null
  readonly setPasteData: (pasteData: PasteData<DrivePastePayload> | null) => void
  readonly selectedKeys: ReadonlySet<AssetId>
  readonly setSelectedKeys: (selectedKeys: ReadonlySet<AssetId>) => void
  readonly visuallySelectedKeys: ReadonlySet<AssetId> | null
  readonly setVisuallySelectedKeys: (visuallySelectedKeys: ReadonlySet<AssetId> | null) => void
  readonly isAssetPanelPermanentlyVisible: boolean
  readonly setIsAssetPanelExpanded: (isAssetPanelExpanded: boolean) => void
  readonly setIsAssetPanelPermanentlyVisible: (isAssetPanelTemporarilyVisible: boolean) => void
  readonly toggleIsAssetPanelPermanentlyVisible: () => void
  readonly isAssetPanelTemporarilyVisible: boolean
  readonly setIsAssetPanelTemporarilyVisible: (isAssetPanelTemporarilyVisible: boolean) => void
  readonly assetPanelProps: AssetPanelContextProps
  readonly setAssetPanelProps: (assetPanelProps: Partial<AssetPanelContextProps>) => void
  readonly suggestions: readonly Suggestion[]
  readonly setSuggestions: (suggestions: readonly Suggestion[]) => void
  readonly isAssetPanelHidden: boolean
  readonly setIsAssetPanelHidden: (isAssetPanelHidden: boolean) => void
}

// =======================
// === ProjectsContext ===
// =======================

/** State contained in a `ProjectsContext`. */
export type ProjectsContextType = zustand.StoreApi<DriveStore>

const DriveContext = React.createContext<ProjectsContextType | null>(null)

/** Props for a {@link DriveProvider}. */
export type ProjectsProviderProps = Readonly<React.PropsWithChildren>

// ========================
// === ProjectsProvider ===
// ========================

/**
 * A React provider (and associated hooks) for determining whether the current area
 * containing the current element is focused.
 */
export default function DriveProvider(props: ProjectsProviderProps) {
  const { children } = props
  const { localStorage } = useLocalStorage()
  const [store] = React.useState(() =>
    zustand.createStore<DriveStore>((set, get) => ({
      category: { type: 'cloud' },
      setCategory: (category) => {
        if (get().category !== category) {
          set({
            category,
            targetDirectory: null,
            selectedKeys: EMPTY_SET,
            visuallySelectedKeys: null,
            suggestions: EMPTY_ARRAY,
            assetPanelProps: {
              selectedTab: get().assetPanelProps.selectedTab,
              backend: null,
              item: null,
              spotlightOn: null,
              path: null,
            },
          })
        }
      },
      targetDirectory: null,
      setTargetDirectory: (targetDirectory) => {
        if (get().targetDirectory !== targetDirectory) {
          set({ targetDirectory })
        }
      },
      newestFolderId: null,
      setNewestFolderId: (newestFolderId) => {
        if (get().newestFolderId !== newestFolderId) {
          set({ newestFolderId })
        }
      },
      canCreateAssets: true,
      setCanCreateAssets: (canCreateAssets) => {
        if (get().canCreateAssets !== canCreateAssets) {
          set({ canCreateAssets })
        }
      },
      canDownload: false,
      setCanDownload: (canDownload) => {
        if (get().canDownload !== canDownload) {
          set({ canDownload })
        }
      },
      pasteData: null,
      setPasteData: (pasteData) => {
        if (get().pasteData !== pasteData) {
          set({ pasteData })
        }
      },
      selectedKeys: EMPTY_SET,
      setSelectedKeys: (selectedKeys) => {
        if (get().selectedKeys !== selectedKeys) {
          set({ selectedKeys })
        }
      },
      visuallySelectedKeys: null,
      setVisuallySelectedKeys: (visuallySelectedKeys) => {
        if (get().visuallySelectedKeys !== visuallySelectedKeys) {
          set({ visuallySelectedKeys })
        }
      },
      isAssetPanelPermanentlyVisible: localStorage.get('isAssetPanelVisible') ?? false,
      toggleIsAssetPanelPermanentlyVisible: () => {
        const state = get()
        const next = !state.isAssetPanelPermanentlyVisible

        state.setIsAssetPanelPermanentlyVisible(next)
      },
      setIsAssetPanelPermanentlyVisible: (isAssetPanelPermanentlyVisible) => {
        if (get().isAssetPanelPermanentlyVisible !== isAssetPanelPermanentlyVisible) {
          set({ isAssetPanelPermanentlyVisible })
          localStorage.set('isAssetPanelVisible', isAssetPanelPermanentlyVisible)
        }
      },
      setIsAssetPanelExpanded: (isAssetPanelExpanded) => {
        const state = get()

        if (state.isAssetPanelPermanentlyVisible !== isAssetPanelExpanded) {
          state.setIsAssetPanelPermanentlyVisible(isAssetPanelExpanded)
          state.setIsAssetPanelTemporarilyVisible(false)
        }

        if (state.isAssetPanelHidden && isAssetPanelExpanded) {
          state.setIsAssetPanelHidden(false)
        }
      },
      isAssetPanelTemporarilyVisible: false,
      setIsAssetPanelTemporarilyVisible: (isAssetPanelTemporarilyVisible) => {
        const state = get()

        if (state.isAssetPanelHidden && isAssetPanelTemporarilyVisible) {
          state.setIsAssetPanelHidden(false)
        }

        if (state.isAssetPanelTemporarilyVisible !== isAssetPanelTemporarilyVisible) {
          set({ isAssetPanelTemporarilyVisible })
        }
      },
      assetPanelProps: {
        selectedTab: localStorage.get('assetPanelTab') ?? 'settings',
        backend: null,
        item: null,
        spotlightOn: null,
        path: null,
      },
      setAssetPanelProps: (assetPanelProps) => {
        const current = get().assetPanelProps
        if (current !== assetPanelProps) {
          set({ assetPanelProps: { ...current, ...assetPanelProps } })
        }
      },
      suggestions: EMPTY_ARRAY,
      setSuggestions: (suggestions) => {
        set({ suggestions })
      },
      isAssetPanelHidden: localStorage.get('isAssetPanelHidden') ?? false,
      setIsAssetPanelHidden: (isAssetPanelHidden) => {
        const state = get()

        if (state.isAssetPanelHidden !== isAssetPanelHidden) {
          set({ isAssetPanelHidden })
          localStorage.set('isAssetPanelHidden', isAssetPanelHidden)
        }
      },
    })),
  )

  return <DriveContext.Provider value={store}>{children}</DriveContext.Provider>
}

/** The drive store. */
export function useDriveStore() {
  const store = React.useContext(DriveContext)

  invariant(store, 'Drive store can only be used inside an `DriveProvider`.')

  return store
}

/** The category of the Asset Table. */
export function useCategory() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.category)
}

/** A function to set the category of the Asset Table. */
export function useSetCategory() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setCategory)
}

/** The target directory of the Asset Table selection. */
export function useTargetDirectory() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.targetDirectory)
}

/** A function to set the target directory of the Asset Table selection. */
export function useSetTargetDirectory() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setTargetDirectory)
}

/** The ID of the most newly created folder. */
export function useNewestFolderId() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.newestFolderId)
}

/** A function to set the ID of the most newly created folder. */
export function useSetNewestFolderId() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setNewestFolderId)
}

/** Whether assets can be created in the current directory. */
export function useCanCreateAssets() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.canCreateAssets)
}

/** A function to set whether assets can be created in the current directory. */
export function useSetCanCreateAssets() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setCanCreateAssets)
}

/** Whether the current Asset Table selection is downloadble. */
export function useCanDownload() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.canDownload)
}

/** A function to set whether the current Asset Table selection is downloadble. */
export function useSetCanDownload() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setCanDownload)
}

/** The paste data for the Asset Table. */
export function usePasteData() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.pasteData)
}

/** A function to set the paste data for the Asset Table. */
export function useSetPasteData() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setPasteData)
}

/** The selected keys in the Asset Table. */
export function useSelectedKeys() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.selectedKeys)
}

/** A function to set the selected keys of the Asset Table selection. */
export function useSetSelectedKeys() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setSelectedKeys)
}

/** The visually selected keys in the Asset Table. */
export function useVisuallySelectedKeys() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.selectedKeys, {
    unsafeEnableTransition: true,
  })
}

/** A function to set the visually selected keys in the Asset Table. */
export function useSetVisuallySelectedKeys() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setVisuallySelectedKeys, {
    unsafeEnableTransition: true,
  })
}

/** Whether the Asset Panel is toggled on. */
export function useIsAssetPanelPermanentlyVisible() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.isAssetPanelPermanentlyVisible, {
    unsafeEnableTransition: true,
  })
}

/** A function to set whether the Asset Panel is toggled on. */
export function useSetIsAssetPanelPermanentlyVisible() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setIsAssetPanelPermanentlyVisible, {
    unsafeEnableTransition: true,
  })
}

/** Whether the Asset Panel is currently visible (e.g. for editing a Datalink). */
export function useIsAssetPanelTemporarilyVisible() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.isAssetPanelTemporarilyVisible, {
    unsafeEnableTransition: true,
  })
}

/** A function to set whether the Asset Panel is currently visible (e.g. for editing a Datalink). */
export function useSetIsAssetPanelTemporarilyVisible() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setIsAssetPanelTemporarilyVisible, {
    unsafeEnableTransition: true,
  })
}

/** Whether the Asset Panel is currently visible, either temporarily or permanently. */
export function useIsAssetPanelVisible() {
  const isAssetPanelPermanentlyVisible = useIsAssetPanelPermanentlyVisible()
  const isAssetPanelTemporarilyVisible = useIsAssetPanelTemporarilyVisible()
  return isAssetPanelPermanentlyVisible || isAssetPanelTemporarilyVisible
}

/**
 * Whether the Asset Panel is expanded.
 */
export function useIsAssetPanelExpanded() {
  const store = useDriveStore()
  return zustand.useStore(
    store,
    ({ isAssetPanelPermanentlyVisible, isAssetPanelTemporarilyVisible }) =>
      isAssetPanelPermanentlyVisible || isAssetPanelTemporarilyVisible,
    { unsafeEnableTransition: true },
  )
}

/** A function to set whether the Asset Panel is expanded. */
export function useSetIsAssetPanelExpanded() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setIsAssetPanelExpanded, {
    unsafeEnableTransition: true,
  })
}

/** Props for the Asset Panel. */
export function useAssetPanelProps() {
  const store = useDriveStore()

  return zustand.useStore(store, (state) => state.assetPanelProps, {
    unsafeEnableTransition: true,
    areEqual: 'shallow',
  })
}

/**
 * The selected tab of the Asset Panel.
 */
export function useAssetPanelSelectedTab() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.assetPanelProps.selectedTab, {
    unsafeEnableTransition: true,
  })
}

/** A function to set props for the Asset Panel. */
export function useSetAssetPanelProps() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setAssetPanelProps, {
    unsafeEnableTransition: true,
  })
}

/**
 * A function to reset the Asset Panel props to their default values.
 */
export function useResetAssetPanelProps() {
  const store = useDriveStore()
  return useEventCallback(() => {
    const current = store.getState().assetPanelProps
    if (current.item != null) {
      store.setState({
        assetPanelProps: {
          selectedTab: current.selectedTab,
          backend: null,
          item: null,
          spotlightOn: null,
          path: null,
        },
      })
    }
  })
}

/**
 * A function to set the selected tab of the Asset Panel.
 */
export function useSetAssetPanelSelectedTab() {
  const store = useDriveStore()

  return useEventCallback((selectedTab: AssetPanelContextProps['selectedTab']) => {
    const current = store.getState().assetPanelProps
    if (current.selectedTab !== selectedTab) {
      store.setState({
        assetPanelProps: { ...current, selectedTab },
      })
    }
  })
}

/** Search suggestions. */
export function useSuggestions() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.suggestions, {
    unsafeEnableTransition: true,
  })
}

/** Set search suggestions. */
export function useSetSuggestions() {
  const store = useDriveStore()
  const setSuggestions = zustand.useStore(store, (state) => state.setSuggestions)
  return useEventCallback((suggestions: readonly Suggestion[]) => {
    React.startTransition(() => {
      setSuggestions(suggestions)
    })
  })
}

/** Whether the Asset Panel is hidden. */
export function useIsAssetPanelHidden() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.isAssetPanelHidden)
}

/** A function to set whether the Asset Panel is hidden. */
export function useSetIsAssetPanelHidden() {
  const store = useDriveStore()
  return zustand.useStore(store, (state) => state.setIsAssetPanelHidden)
}
