/**
 * @file Main dashboard component, responsible for listing user's projects as well as other
 * interactive components.
 */
import * as React from 'react'

import * as detect from 'enso-common/src/detect'

import { DashboardTabBar } from './DashboardTabBar'

import * as eventCallbacks from '#/hooks/eventCallbackHooks'
import * as projectHooks from '#/hooks/projectHooks'
import * as searchParamsState from '#/hooks/searchParamsStateHooks'

import * as authProvider from '#/providers/AuthProvider'
import * as backendProvider from '#/providers/BackendProvider'
import * as inputBindingsProvider from '#/providers/InputBindingsProvider'
import * as localStorageProvider from '#/providers/LocalStorageProvider'
import * as modalProvider from '#/providers/ModalProvider'
import ProjectsProvider, {
  TabType,
  useClearLaunchedProjects,
  useLaunchedProjects,
  usePage,
  useProjectsStore,
  useSetPage,
  type LaunchedProject,
} from '#/providers/ProjectsProvider'

import AssetListEventType from '#/events/AssetListEventType'

import type * as assetTable from '#/layouts/AssetsTable'
import EventListProvider, * as eventListProvider from '#/layouts/AssetsTable/EventListProvider'
import * as categoryModule from '#/layouts/CategorySwitcher/Category'
import Chat from '#/layouts/Chat'
import ChatPlaceholder from '#/layouts/ChatPlaceholder'
import type * as editor from '#/layouts/Editor'
import UserBar from '#/layouts/UserBar'

import * as aria from '#/components/aria'
import Page from '#/components/Page'

import ManagePermissionsModal from '#/modals/ManagePermissionsModal'

import * as backendModule from '#/services/Backend'
import * as localBackendModule from '#/services/LocalBackend'
import * as projectManager from '#/services/ProjectManager'

import { useSetCategory } from '#/providers/DriveProvider'
import { baseName } from '#/utilities/fileInfo'
import { tryFindSelfPermission } from '#/utilities/permissions'
import { STATIC_QUERY_OPTIONS } from '#/utilities/reactQuery'
import * as sanitizedEventTargets from '#/utilities/sanitizedEventTargets'
import { usePrefetchQuery } from '@tanstack/react-query'
import { DashboardTabPanels } from './DashboardTabPanels'

// =================
// === Dashboard ===
// =================

/** Props for {@link Dashboard}s that are common to all platforms. */
export interface DashboardProps {
  /** Whether the application may have the local backend running. */
  readonly supportsLocalBackend: boolean
  readonly appRunner: editor.GraphEditorRunner | null
  readonly initialProjectName: string | null
  readonly ydocUrl: string | null
}

/** The component that contains the entire UI. */
export default function Dashboard(props: DashboardProps) {
  return (
    <EventListProvider>
      <ProjectsProvider>
        <DashboardInner {...props} />
      </ProjectsProvider>
    </EventListProvider>
  )
}

/** Extract proper path from `file://` URL. */
function fileURLToPath(url: string): string | null {
  if (URL.canParse(url)) {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') {
      return decodeURIComponent(
        detect.platform() === detect.Platform.windows ?
          // On Windows, we must remove leading `/` from URL.
          parsed.pathname.slice(1)
        : parsed.pathname,
      )
    } else {
      return null
    }
  } else {
    return null
  }
}

/** The component that contains the entire UI. */
function DashboardInner(props: DashboardProps) {
  const { appRunner, initialProjectName: initialProjectNameRaw, ydocUrl } = props
  const { user } = authProvider.useFullUserSession()
  const localBackend = backendProvider.useLocalBackend()
  const { modalRef } = modalProvider.useModalRef()
  const { updateModal, unsetModal, setModal } = modalProvider.useSetModal()
  const { localStorage } = localStorageProvider.useLocalStorage()
  const inputBindings = inputBindingsProvider.useInputBindings()
  const [isHelpChatOpen, setIsHelpChatOpen] = React.useState(false)

  const dispatchAssetListEvent = eventListProvider.useDispatchAssetListEvent()
  const assetManagementApiRef = React.useRef<assetTable.AssetManagementApi | null>(null)

  const initialLocalProjectPath =
    initialProjectNameRaw != null ? fileURLToPath(initialProjectNameRaw) : null
  const initialProjectName = initialLocalProjectPath != null ? null : initialProjectNameRaw

  const [category, setCategoryRaw] =
    searchParamsState.useSearchParamsState<categoryModule.Category>(
      'driveCategory',
      () => (localBackend != null ? { type: 'local' } : { type: 'cloud' }),
      (value): value is categoryModule.Category =>
        categoryModule.CATEGORY_SCHEMA.safeParse(value).success,
    )

  const initialCategory = React.useRef(category)
  const setStoreCategory = useSetCategory()
  React.useEffect(() => {
    setStoreCategory(initialCategory.current)
  }, [setStoreCategory])

  const setCategory = eventCallbacks.useEventCallback((newCategory: categoryModule.Category) => {
    setCategoryRaw(newCategory)
    setStoreCategory(newCategory)
  })
  const backend = backendProvider.useBackend(category)

  const projectsStore = useProjectsStore()
  const page = usePage()
  const launchedProjects = useLaunchedProjects()
  // There is no shared enum type, but the other union member is the same type.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  const selectedProject = launchedProjects.find((p) => p.id === page) ?? null

  const setPage = useSetPage()
  const openEditor = projectHooks.useOpenEditor()
  const openProject = projectHooks.useOpenProject()
  const closeProject = projectHooks.useCloseProject()
  const closeAllProjects = projectHooks.useCloseAllProjects()
  const clearLaunchedProjects = useClearLaunchedProjects()

  usePrefetchQuery({
    queryKey: ['loadInitialLocalProject'],
    networkMode: 'always',
    ...STATIC_QUERY_OPTIONS,
    queryFn: async () => {
      if (initialLocalProjectPath != null && window.backendApi && localBackend) {
        const projectName = baseName(initialLocalProjectPath)
        const { id } = await window.backendApi.importProjectFromPath(
          initialLocalProjectPath,
          localBackend.rootPath(),
          projectName,
        )
        openProject({
          type: backendModule.BackendType.local,
          id: localBackendModule.newProjectId(projectManager.UUID(id)),
          title: projectName,
          parentId: localBackendModule.newDirectoryId(localBackend.rootPath()),
        })
      }
      return null
    },
    staleTime: Infinity,
  })

  React.useEffect(() => {
    window.projectManagementApi?.setOpenProjectHandler((project) => {
      setCategory({ type: 'local' })
      const projectId = localBackendModule.newProjectId(projectManager.UUID(project.id))
      openProject({
        type: backendModule.BackendType.local,
        id: projectId,
        title: project.name,
        parentId: localBackendModule.newDirectoryId(backendModule.Path(project.parentDirectory)),
      })
    })
    return () => {
      window.projectManagementApi?.setOpenProjectHandler(() => {})
    }
  }, [dispatchAssetListEvent, openEditor, openProject, setCategory])

  React.useEffect(
    () =>
      inputBindings.attach(sanitizedEventTargets.document.body, 'keydown', {
        closeModal: () => {
          updateModal((oldModal) => {
            if (oldModal == null) {
              const currentPage = projectsStore.getState().page
              if (currentPage === TabType.settings) {
                setPage(TabType.drive)
              }
            }
            return null
          })
          if (modalRef.current == null) {
            return false
          }
        },
      }),
    [inputBindings, modalRef, localStorage, updateModal, setPage, projectsStore],
  )

  React.useEffect(() => {
    if (detect.isOnElectron()) {
      // We want to handle the back and forward buttons in electron the same way as in the browser.
      return inputBindings.attach(sanitizedEventTargets.document.body, 'keydown', {
        goBack: () => {
          window.navigationApi.goBack()
        },
        goForward: () => {
          window.navigationApi.goForward()
        },
      })
    }
  }, [inputBindings])

  const doRemoveSelf = eventCallbacks.useEventCallback((project: LaunchedProject) => {
    dispatchAssetListEvent({ type: AssetListEventType.removeSelf, id: project.id })
    closeProject(project)
  })

  const onSignOut = eventCallbacks.useEventCallback(() => {
    setPage(TabType.drive)
    closeAllProjects()
    clearLaunchedProjects()
  })

  const doOpenShareModal = eventCallbacks.useEventCallback(() => {
    if (assetManagementApiRef.current != null && selectedProject != null) {
      const asset = assetManagementApiRef.current.getAsset(selectedProject.id)
      const self = tryFindSelfPermission(user, asset?.permissions)

      if (asset != null && self != null) {
        setModal(
          <ManagePermissionsModal
            backend={backend}
            category={category}
            item={asset}
            self={self}
            doRemoveSelf={() => {
              doRemoveSelf(selectedProject)
            }}
            eventTarget={null}
          />,
        )
      }
    }
  })

  const goToSettings = eventCallbacks.useEventCallback(() => {
    setPage(TabType.settings)
  })

  return (
    <Page hideInfoBar hideChat>
      <div
        className="flex min-h-full flex-col text-xs text-primary"
        onContextMenu={(event) => {
          event.preventDefault()
          unsetModal()
        }}
      >
        <aria.Tabs
          className="relative flex min-h-full grow select-none flex-col container-size"
          selectedKey={page}
          onSelectionChange={(newPage) => {
            // This is safe as we render only valid pages.
            // eslint-disable-next-line no-restricted-syntax
            setPage(newPage as TabType)
          }}
        >
          <div className="flex">
            <DashboardTabBar onCloseProject={closeProject} onOpenEditor={openEditor} />

            <UserBar
              onShareClick={selectedProject ? doOpenShareModal : undefined}
              setIsHelpChatOpen={setIsHelpChatOpen}
              goToSettingsPage={goToSettings}
              onSignOut={onSignOut}
            />
          </div>

          <DashboardTabPanels
            appRunner={appRunner}
            initialProjectName={initialProjectName}
            ydocUrl={ydocUrl}
            assetManagementApiRef={assetManagementApiRef}
            category={category}
            setCategory={setCategory}
          />
        </aria.Tabs>

        {process.env.ENSO_CLOUD_CHAT_URL != null ?
          <Chat
            isOpen={isHelpChatOpen}
            doClose={() => {
              setIsHelpChatOpen(false)
            }}
            endpoint={process.env.ENSO_CLOUD_CHAT_URL}
          />
        : <ChatPlaceholder
            isOpen={isHelpChatOpen}
            doClose={() => {
              setIsHelpChatOpen(false)
            }}
          />
        }
      </div>
    </Page>
  )
}
