/**
 * @file
 * Toggle for opening the asset panel.
 */
import RightPanelIcon from '#/assets/right_panel.svg'
import { Button } from '#/components/AriaComponents'

import { useIsAssetPanelHidden, useSetIsAssetPanelHidden } from '#/providers/DriveProvider'
import { useText } from '#/providers/TextProvider'
import type { Spring } from 'framer-motion'
import { AnimatePresence, motion } from 'framer-motion'
import { memo } from 'react'

/**
 * Props for a {@link AssetPanelToggle}.
 */
export interface AssetPanelToggleProps {
  readonly className?: string
  readonly showWhen?: 'collapsed' | 'expanded'
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

const COLLAPSED_X_TRANSLATION = 16
const EXPANDED_X_TRANSLATION = -16

/**
 * Toggle for opening the asset panel.
 */
export const AssetPanelToggle = memo(function AssetPanelToggle(props: AssetPanelToggleProps) {
  const { className, showWhen = 'collapsed' } = props

  const { getText } = useText()
  const isAssetPanelHidden = useIsAssetPanelHidden()
  const setIsAssetPanelHidden = useSetIsAssetPanelHidden()

  const canDisplay = showWhen === 'collapsed' ? isAssetPanelHidden : !isAssetPanelHidden

  return (
    <AnimatePresence initial={!canDisplay} mode="sync">
      {canDisplay && (
        <motion.div
          className={className}
          layout="position"
          initial={{
            opacity: 0,
            filter: 'blur(4px)',
            x: showWhen === 'collapsed' ? COLLAPSED_X_TRANSLATION : EXPANDED_X_TRANSLATION,
          }}
          animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
          exit={{
            opacity: 0,
            filter: 'blur(4px)',
            x: showWhen === 'collapsed' ? COLLAPSED_X_TRANSLATION : EXPANDED_X_TRANSLATION,
          }}
          transition={DEFAULT_TRANSITION_OPTIONS}
        >
          <Button
            size="medium"
            variant="custom"
            isActive={!isAssetPanelHidden}
            icon={RightPanelIcon}
            aria-label={getText('openAssetPanel')}
            onPress={() => {
              setIsAssetPanelHidden(!isAssetPanelHidden)
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
})
