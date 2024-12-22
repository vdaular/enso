/** @file The directory header bar and directory item listing. */
import * as React from 'react'

import * as appUtils from '#/appUtils'
import Offline from '#/assets/offline_filled.svg'

import * as offlineHooks from '#/hooks/offlineHooks'
import * as toastAndLogHooks from '#/hooks/toastAndLogHooks'

import * as authProvider from '#/providers/AuthProvider'
import * as backendProvider from '#/providers/BackendProvider'
import * as textProvider from '#/providers/TextProvider'

import AssetListEventType from '#/events/AssetListEventType'

import { AssetPanel } from '#/layouts/AssetPanel'
import type * as assetsTable from '#/layouts/AssetsTable'
import AssetsTable from '#/layouts/AssetsTable'
import CategorySwitcher from '#/layouts/CategorySwitcher'
import * as categoryModule from '#/layouts/CategorySwitcher/Category'
import * as eventListProvider from '#/layouts/Drive/EventListProvider'
import DriveBar from '#/layouts/DriveBar'
import Labels from '#/layouts/Labels'

import * as ariaComponents from '#/components/AriaComponents'
import * as result from '#/components/Result'

import { ErrorBoundary, useErrorBoundary } from '#/components/ErrorBoundary'
import SvgMask from '#/components/SvgMask'
import { listDirectoryQueryOptions } from '#/hooks/backendHooks'
import { useEventCallback } from '#/hooks/eventCallbackHooks'
import { useTargetDirectory } from '#/providers/DriveProvider'
import { DirectoryDoesNotExistError, Plan } from '#/services/Backend'
import AssetQuery from '#/utilities/AssetQuery'
import * as download from '#/utilities/download'
import * as github from '#/utilities/github'
import { OfflineError } from '#/utilities/HttpClient'
import { tryFindSelfPermission } from '#/utilities/permissions'
import * as tailwindMerge from '#/utilities/tailwindMerge'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useDeferredValue, useEffect } from 'react'
import { toast } from 'react-toastify'
import { Suspense } from '../components/Suspense'
import { useDirectoryIds } from './Drive/directoryIdsHooks'

// =============
// === Drive ===
// =============

/** Props for a {@link Drive}. */
export interface DriveProps {
  readonly category: categoryModule.Category
  readonly setCategory: (category: categoryModule.Category) => void
  readonly resetCategory: () => void
  readonly hidden: boolean
  readonly initialProjectName: string | null
  readonly assetsManagementApiRef: React.Ref<assetsTable.AssetManagementApi>
}

const CATEGORIES_TO_DISPLAY_START_MODAL = ['cloud', 'local', 'local-directory']

/** Contains directory path and directory contents (projects, folders, secrets and files). */
function Drive(props: DriveProps) {
  const { category, resetCategory, setCategory } = props

  const { isOffline } = offlineHooks.useOffline()
  const toastAndLog = toastAndLogHooks.useToastAndLog()
  const { user } = authProvider.useFullUserSession()
  const localBackend = backendProvider.useLocalBackend()
  const { getText } = textProvider.useText()
  const isCloud = categoryModule.isCloudCategory(category)

  const supportLocalBackend = localBackend != null

  const status =
    isCloud && isOffline ? 'offline'
    : isCloud && !user.isEnabled ? 'not-enabled'
    : 'ok'

  switch (status) {
    case 'not-enabled': {
      return (
        <result.Result
          status="error"
          title={getText('notEnabledTitle')}
          testId="not-enabled-stub"
          subtitle={`${getText('notEnabledSubtitle')}${localBackend == null ? ' ' + getText('downloadFreeEditionMessage') : ''}`}
        >
          <ariaComponents.ButtonGroup align="center">
            <ariaComponents.Button variant="primary" size="medium" href={appUtils.SUBSCRIBE_PATH}>
              {getText('upgrade')}
            </ariaComponents.Button>

            {!supportLocalBackend && (
              <ariaComponents.Button
                data-testid="download-free-edition"
                size="medium"
                variant="accent"
                onPress={async () => {
                  const downloadUrl = await github.getDownloadUrl()
                  if (downloadUrl == null) {
                    toastAndLog('noAppDownloadError')
                  } else {
                    download.download(downloadUrl)
                  }
                }}
              >
                {getText('downloadFreeEdition')}
              </ariaComponents.Button>
            )}
          </ariaComponents.ButtonGroup>
        </result.Result>
      )
    }
    case 'offline':
    case 'ok': {
      return (
        <ErrorBoundary
          onBeforeFallbackShown={({ resetErrorBoundary, error, resetQueries }) => {
            if (error instanceof DirectoryDoesNotExistError) {
              toast.error(getText('directoryDoesNotExistError'), {
                toastId: 'directory-does-not-exist-error',
              })
              resetCategory()
              resetQueries()
              resetErrorBoundary()
            }

            if (error instanceof OfflineError) {
              return (
                <OfflineMessage
                  supportLocalBackend={supportLocalBackend}
                  setCategory={(nextCategory) => {
                    setCategory(nextCategory)
                    resetErrorBoundary()
                  }}
                />
              )
            }
          }}
        >
          <Suspense>
            <DriveAssetsView {...props} />
          </Suspense>
        </ErrorBoundary>
      )
    }
  }
}

/**
 * The assets view of the Drive.
 */
function DriveAssetsView(props: DriveProps) {
  const {
    category,
    setCategory,
    hidden = false,
    initialProjectName,
    assetsManagementApiRef,
  } = props

  const deferredCategory = useDeferredValue(category)
  const { showBoundary } = useErrorBoundary()

  const { isOffline } = offlineHooks.useOffline()
  const { user } = authProvider.useFullUserSession()
  const localBackend = backendProvider.useLocalBackend()
  const backend = backendProvider.useBackend(category)
  const dispatchAssetListEvent = eventListProvider.useDispatchAssetListEvent()

  const [query, setQuery] = React.useState(() => AssetQuery.fromString(''))
  const [shouldForceHideStartModal, setShouldForceHideStartModal] = React.useState(false)

  const isCloud = categoryModule.isCloudCategory(category)
  const supportLocalBackend = localBackend != null

  const targetDirectory = useTargetDirectory()

  const status =
    isCloud && isOffline ? 'offline'
    : isCloud && !user.isEnabled ? 'not-enabled'
    : 'ok'

  const doEmptyTrash = useEventCallback(() => {
    dispatchAssetListEvent({ type: AssetListEventType.emptyTrash })
  })

  const { rootDirectoryId } = useDirectoryIds({ category })

  const queryClient = useQueryClient()
  const rootDirectoryQuery = listDirectoryQueryOptions({
    backend,
    category,
    parentId: rootDirectoryId,
  })

  const {
    data: isEmpty,
    error,
    isFetching,
  } = useSuspenseQuery({
    ...rootDirectoryQuery,
    refetchOnMount: 'always',
    staleTime: ({ state }) => (state.error ? 0 : Infinity),
    select: (data) => data.length === 0,
  })

  // Show the error boundary if the query failed, but has data.
  if (error != null && !isFetching) {
    showBoundary(error)
    // Remove the query from the cache.
    // This will force the query to be refetched when the user navigates again.
    queryClient.removeQueries({ queryKey: rootDirectoryQuery.queryKey })
  }

  // When the directory is no longer empty, we need to hide the start modal.
  // This includes the cases when the directory wasn't empty before, but it's now empty
  // (e.g. when the user deletes the last asset).
  useEffect(() => {
    if (!isEmpty) {
      setShouldForceHideStartModal(true)
    }
  }, [isEmpty])

  // When the root directory changes, we need to show the start modal
  // if the directory is empty.
  useEffect(() => {
    setShouldForceHideStartModal(false)
  }, [category.type])

  const hasPermissionToCreateAssets = tryFindSelfPermission(
    user,
    targetDirectory?.item.permissions ?? [],
  )

  const shouldDisplayStartModal =
    isEmpty &&
    CATEGORIES_TO_DISPLAY_START_MODAL.includes(category.type) &&
    !shouldForceHideStartModal

  const shouldDisableActions =
    category.type === 'cloud' &&
    (user.plan === Plan.enterprise || user.plan === Plan.team) &&
    !hasPermissionToCreateAssets

  return (
    <div className={tailwindMerge.twMerge('relative flex grow', hidden && 'hidden')}>
      <div
        data-testid="drive-view"
        className="mt-4 flex flex-1 flex-col gap-4 overflow-visible px-page-x"
      >
        <DriveBar
          key={rootDirectoryId}
          backend={backend}
          query={query}
          setQuery={setQuery}
          category={category}
          doEmptyTrash={doEmptyTrash}
          isEmpty={isEmpty}
          shouldDisplayStartModal={shouldDisplayStartModal}
          isDisabled={shouldDisableActions}
        />

        <div className="flex flex-1 gap-drive overflow-hidden">
          <div className="flex w-36 flex-none flex-col gap-drive-sidebar overflow-y-auto overflow-x-hidden py-drive-sidebar-y">
            <CategorySwitcher category={category} setCategory={setCategory} />

            {isCloud && (
              <Labels
                backend={backend}
                draggable={category.type !== 'trash'}
                query={query}
                setQuery={setQuery}
              />
            )}
          </div>

          {status === 'offline' ?
            <OfflineMessage supportLocalBackend={supportLocalBackend} setCategory={setCategory} />
          : <AssetsTable
              assetManagementApiRef={assetsManagementApiRef}
              hidden={hidden}
              query={query}
              setQuery={setQuery}
              category={deferredCategory}
              initialProjectName={initialProjectName}
            />
          }
        </div>
      </div>

      <AssetPanel backendType={backend.type} category={deferredCategory} />
    </div>
  )
}

/**
 * Props for {@link OfflineMessage}
 */
interface OfflineMessageProps {
  readonly supportLocalBackend: boolean
  readonly setCategory: (category: categoryModule.Category) => void
}

/**
 * Offline message component.
 * Displays info that the ctegory selected in unavailable
 * in offline mode
 */
function OfflineMessage(props: OfflineMessageProps) {
  const { supportLocalBackend, setCategory } = props
  const { getText } = textProvider.useText()

  return (
    <result.Result
      status={<SvgMask src={Offline} className="aspect-square h-6" />}
      className="my-12"
      centered="horizontal"
      title={getText('cloudUnavailableOffline')}
      subtitle={`${getText('cloudUnavailableOfflineDescription')} ${supportLocalBackend ? getText('cloudUnavailableOfflineDescriptionOfferLocal') : ''}`}
    >
      {supportLocalBackend && (
        <ariaComponents.Button
          variant="primary"
          className="mx-auto"
          onPress={() => {
            setCategory({ type: 'local' })
          }}
        >
          {getText('switchToLocal')}
        </ariaComponents.Button>
      )}
    </result.Result>
  )
}

export default React.memo(Drive)
