/** @file Tabs for the asset panel. Contains the visual state for the tabs and animations. */
import { AnimatedBackground } from '#/components/AnimatedBackground'
import type { TabListProps, TabPanelProps, TabProps } from '#/components/aria'
import { Tab, TabList, TabPanel, Tabs, type TabsProps } from '#/components/aria'
import { useVisualTooltip } from '#/components/AriaComponents'
import { ErrorBoundary } from '#/components/ErrorBoundary'
import { Suspense } from '#/components/Suspense'
import SvgMask from '#/components/SvgMask'
import { AnimatePresence, motion } from 'framer-motion'
import { memo, useRef } from 'react'

/** Display a set of tabs. */
export function AssetPanelTabs(props: TabsProps) {
  const { children } = props

  return <Tabs {...props}>{children}</Tabs>
}

/** Display a list of tabs. */
export function AssetPanelTabList<T extends object>(props: TabListProps<T>) {
  return (
    <AnimatedBackground>
      <TabList {...props} />
    </AnimatedBackground>
  )
}

/** Props for a {@link AssetPanelTab}. */
export interface AssetPanelTabProps extends TabProps {
  readonly id: string
  readonly icon: string
  readonly label: string
  readonly isExpanded: boolean
  readonly onPress?: () => void
}

const UNDERLAY_ELEMENT = (
  <>
    <div className="h-full w-full rounded-r-2xl bg-background" />
    <div className="absolute -top-5 left-0 aspect-square w-5 [background:radial-gradient(circle_at_100%_0%,_transparent_70%,_var(--color-background)_70%)]" />
    <div className="absolute -bottom-5 left-0 aspect-square w-5 [background:radial-gradient(circle_at_100%_100%,_transparent_70%,_var(--color-background)_70%)]" />
  </>
)

/** Display a tab. */
export const AssetPanelTab = memo(function AssetPanelTab(props: AssetPanelTabProps) {
  const { id, icon, label, isExpanded } = props

  const tabRef = useRef<HTMLDivElement>(null)

  const { targetProps, tooltip } = useVisualTooltip({
    children: label,
    targetRef: tabRef,
    overlayPositionProps: { placement: 'left' },
  })

  return (
    <Tab
      ref={tabRef}
      id={id}
      aria-label={label}
      className="aspect-square w-full cursor-pointer"
      data-testid={`asset-panel-tab-${id}`}
    >
      {({ isSelected, isHovered }) => {
        const isActive = isSelected && isExpanded
        return (
          <>
            <AnimatedBackground.Item
              isSelected={isActive}
              className="h-full w-full rounded-2xl"
              underlayElement={UNDERLAY_ELEMENT}
            >
              <motion.div
                className="h-full w-full"
                // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                initial={{ x: 100 }}
                animate={{ x: 0 }}
                // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                exit={{ x: 100 }}
              >
                <motion.div
                  variants={{ active: { opacity: 1 }, inactive: { opacity: 0 } }}
                  initial="inactive"
                  animate={!isActive && isHovered ? 'active' : 'inactive'}
                  className="absolute inset-x-1.5 inset-y-1.5 -z-1 rounded-full bg-invert transition-colors duration-300"
                />

                <div
                  ref={tabRef}
                  className="flex h-full w-full items-center justify-center"
                  {...targetProps}
                >
                  <SvgMask src={icon} />
                </div>
              </motion.div>
            </AnimatedBackground.Item>

            {tooltip}
          </>
        )
      }}
    </Tab>
  )
})

/** Props for a {@link AssetPanelTabPanel}. */
export interface AssetPanelTabPanelProps extends TabPanelProps {
  readonly resetKeys?: unknown[]
}

/** Display a tab panel. */
export function AssetPanelTabPanel(props: AssetPanelTabPanelProps) {
  const { children, id = '', resetKeys = [] } = props

  return (
    <TabPanel className="contents" shouldForceMount {...props}>
      {(renderProps) => {
        const isSelected = renderProps.state.selectionManager.isSelected(id)

        return (
          <AnimatePresence initial={!isSelected} mode="popLayout">
            {isSelected && (
              <motion.div
                // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                initial={{ x: 16, filter: 'blur(4px)', opacity: 0 }}
                animate={{ x: 0, filter: 'blur(0px)', opacity: 1 }}
                // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                exit={{ x: 16, filter: 'blur(4px)', opacity: 0 }}
                className="flex h-full w-full flex-col overflow-y-auto scroll-offset-edge-3xl"
              >
                <Suspense loaderProps={{ className: 'my-auto' }}>
                  <ErrorBoundary resetKeys={[renderProps.state.selectedItem, ...resetKeys]}>
                    <div className="pointer-events-auto flex h-fit min-h-full w-full shrink-0 px-4 py-5">
                      {typeof children === 'function' ? children(renderProps) : children}
                    </div>
                  </ErrorBoundary>
                </Suspense>
              </motion.div>
            )}
          </AnimatePresence>
        )
      }}
    </TabPanel>
  )
}

AssetPanelTabs.Tab = AssetPanelTab
AssetPanelTabs.TabPanel = AssetPanelTabPanel
AssetPanelTabs.TabList = AssetPanelTabList
