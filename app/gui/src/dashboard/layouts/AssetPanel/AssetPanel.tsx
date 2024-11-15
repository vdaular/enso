/**
 * @file
 * @description
 * The asset panel is a sidebar that can be expanded or collapsed.
 * It is used to view and interact with assets in the drive.
 */
import docsIcon from '#/assets/file_text.svg'
import sessionsIcon from '#/assets/group.svg'
import inspectIcon from '#/assets/inspect.svg'
import versionsIcon from '#/assets/versions.svg'

import { useEventCallback } from '#/hooks/eventCallbackHooks'
import { useBackend } from '#/providers/BackendProvider'
import {
  useAssetPanelProps,
  useAssetPanelSelectedTab,
  useIsAssetPanelExpanded,
  useIsAssetPanelHidden,
  useSetAssetPanelSelectedTab,
  useSetIsAssetPanelExpanded,
} from '#/providers/DriveProvider'
import { useText } from '#/providers/TextProvider'
import type Backend from '#/services/Backend'
import LocalStorage from '#/utilities/LocalStorage'
import type { AnyAsset, BackendType } from 'enso-common/src/services/Backend'
import type { Spring } from 'framer-motion'
import { AnimatePresence, motion } from 'framer-motion'
import { memo, startTransition } from 'react'
import { z } from 'zod'
import { AssetDocs } from '../AssetDocs'
import AssetProjectSessions from '../AssetProjectSessions'
import type { AssetPropertiesSpotlight } from '../AssetProperties'
import AssetProperties from '../AssetProperties'
import AssetVersions from '../AssetVersions/AssetVersions'
import type { Category } from '../CategorySwitcher/Category'
import { AssetPanelTabs } from './components/AssetPanelTabs'
import { AssetPanelToggle } from './components/AssetPanelToggle'

const ASSET_SIDEBAR_COLLAPSED_WIDTH = 48
const ASSET_PANEL_WIDTH = 480
const ASSET_PANEL_TOTAL_WIDTH = ASSET_PANEL_WIDTH + ASSET_SIDEBAR_COLLAPSED_WIDTH

/** Determines the content of the {@link AssetPanel}. */
const ASSET_PANEL_TABS = ['settings', 'versions', 'sessions', 'schedules', 'docs'] as const

/** Determines the content of the {@link AssetPanel}. */
type AssetPanelTab = (typeof ASSET_PANEL_TABS)[number]

declare module '#/utilities/LocalStorage' {
  /** */
  interface LocalStorageData {
    readonly isAssetPanelVisible: boolean
    readonly isAssetPanelHidden: boolean
    readonly assetPanelTab: AssetPanelTab
    readonly assetPanelWidth: number
  }
}

const ASSET_PANEL_TAB_SCHEMA = z.enum(ASSET_PANEL_TABS)

LocalStorage.register({
  assetPanelTab: { schema: ASSET_PANEL_TAB_SCHEMA },
  assetPanelWidth: { schema: z.number().int() },
  isAssetPanelHidden: { schema: z.boolean() },
  isAssetPanelVisible: { schema: z.boolean() },
})

/** Props supplied by the row. */
export interface AssetPanelContextProps {
  readonly backend: Backend | null
  readonly selectedTab: AssetPanelTab
  readonly item: AnyAsset | null
  readonly path: string | null
  readonly spotlightOn: AssetPropertiesSpotlight | null
}

/**
 * Props for an {@link AssetPanel}.
 */
export interface AssetPanelProps {
  readonly backendType: BackendType
  readonly category: Category
}

const DEFAULT_TRANSITION_OPTIONS: Spring = {
  type: 'spring',
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  stiffness: 200,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  damping: 30,
  mass: 1,
  velocity: 0,
}

/**
 * The asset panel is a sidebar that can be expanded or collapsed.
 * It is used to view and interact with assets in the drive.
 */
export function AssetPanel(props: AssetPanelProps) {
  const isHidden = useIsAssetPanelHidden()
  const isExpanded = useIsAssetPanelExpanded()

  const panelWidth = isExpanded ? ASSET_PANEL_TOTAL_WIDTH : ASSET_SIDEBAR_COLLAPSED_WIDTH
  const isVisible = !isHidden

  return (
    <AnimatePresence initial={!isVisible} mode="sync">
      {isVisible && (
        <motion.div
          data-testid="asset-panel"
          initial="initial"
          animate="animate"
          exit="exit"
          custom={panelWidth}
          variants={{
            initial: { opacity: 0, width: 0 },
            animate: (width: number) => ({ opacity: 1, width }),
            exit: { opacity: 0, width: 0 },
          }}
          transition={DEFAULT_TRANSITION_OPTIONS}
          className="relative flex h-full flex-col shadow-softer clip-path-left-shadow"
          onClick={(event) => {
            // Prevent deselecting Assets Table rows.
            event.stopPropagation()
          }}
        >
          <InternalAssetPanelTabs {...props} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * The internal implementation of the Asset Panel Tabs.
 */
const InternalAssetPanelTabs = memo(function InternalAssetPanelTabs(props: AssetPanelProps) {
  const { category } = props

  const { item, spotlightOn, path } = useAssetPanelProps()

  const selectedTab = useAssetPanelSelectedTab()
  const setSelectedTab = useSetAssetPanelSelectedTab()
  const isHidden = useIsAssetPanelHidden()

  const isReadonly = category.type === 'trash'

  const { getText } = useText()

  const isExpanded = useIsAssetPanelExpanded()
  const setIsExpanded = useSetIsAssetPanelExpanded()

  const expandTab = useEventCallback(() => {
    setIsExpanded(true)
  })

  const backend = useBackend(category)

  return (
    <AssetPanelTabs
      className="h-full"
      orientation="vertical"
      selectedKey={selectedTab}
      defaultSelectedKey={selectedTab}
      onSelectionChange={(key) => {
        if (isHidden) {
          return
        }

        startTransition(() => {
          if (key === selectedTab && isExpanded) {
            setIsExpanded(false)
          } else {
            // This is safe because we know the key is a valid AssetPanelTab.
            // eslint-disable-next-line no-restricted-syntax
            setSelectedTab(key as AssetPanelTab)
            setIsExpanded(true)
          }
        })
      }}
    >
      <AnimatePresence initial={!isExpanded} mode="sync">
        {isExpanded && (
          <div
            className="min-h-full"
            // We use clipPath to prevent the sidebar from being visible under tabs while expanding.
            style={{ clipPath: `inset(0 ${ASSET_SIDEBAR_COLLAPSED_WIDTH}px 0 0)` }}
          >
            <motion.div
              initial={{ filter: 'blur(8px)' }}
              animate={{ filter: 'blur(0px)' }}
              exit={{ filter: 'blur(8px)' }}
              transition={DEFAULT_TRANSITION_OPTIONS}
              className="absolute left-0 top-0 h-full w-full bg-background"
              style={{ width: ASSET_PANEL_WIDTH }}
            >
              <AssetPanelTabs.TabPanel id="settings" resetKeys={[item?.id]}>
                <AssetProperties
                  backend={backend}
                  item={item}
                  isReadonly={isReadonly}
                  category={category}
                  spotlightOn={spotlightOn}
                  path={path}
                />
              </AssetPanelTabs.TabPanel>

              <AssetPanelTabs.TabPanel id="versions" resetKeys={[item?.id]}>
                <AssetVersions backend={backend} item={item} />
              </AssetPanelTabs.TabPanel>

              <AssetPanelTabs.TabPanel id="sessions" resetKeys={[item?.id]}>
                <AssetProjectSessions backend={backend} item={item} />
              </AssetPanelTabs.TabPanel>

              <AssetPanelTabs.TabPanel id="docs" resetKeys={[item?.id]}>
                <AssetDocs backend={backend} item={item} />
              </AssetPanelTabs.TabPanel>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div
        className="absolute bottom-0 right-0 top-0 pt-2.5"
        style={{ width: ASSET_SIDEBAR_COLLAPSED_WIDTH }}
      >
        <AssetPanelToggle
          showWhen="expanded"
          className="flex aspect-square w-full items-center justify-center"
        />

        <AssetPanelTabs.TabList>
          <AssetPanelTabs.Tab
            id="settings"
            icon={inspectIcon}
            label={getText('properties')}
            isExpanded={isExpanded}
            onPress={expandTab}
          />
          <AssetPanelTabs.Tab
            id="versions"
            icon={versionsIcon}
            label={getText('versions')}
            isExpanded={isExpanded}
            isDisabled={isHidden}
            onPress={expandTab}
          />
          <AssetPanelTabs.Tab
            id="sessions"
            icon={sessionsIcon}
            label={getText('projectSessions')}
            isExpanded={isExpanded}
            onPress={expandTab}
          />
          <AssetPanelTabs.Tab
            id="docs"
            icon={docsIcon}
            label={getText('docs')}
            isExpanded={isExpanded}
            onPress={expandTab}
          />
        </AssetPanelTabs.TabList>
      </div>
    </AssetPanelTabs>
  )
})
