/**
 * @file
 *
 * `<AnimatedBackground />` component visually highlights selected items by sliding a background into view when hovered over or clicked.
 */
import type { Transition } from 'framer-motion'
import { AnimatePresence, motion } from 'framer-motion'
import type { PropsWithChildren } from 'react'
import { createContext, memo, useContext, useId, useMemo } from 'react'

import { twJoin } from '#/utilities/tailwindMerge'
import invariant from 'tiny-invariant'

/** Props for {@link AnimatedBackground}. */
interface AnimatedBackgroundProps extends PropsWithChildren {
  /**
   * Active value.
   * You can omit this prop if you want to use the `isSelected` prop on {@link AnimatedBackground.Item}.
   */
  readonly value?: string
  readonly transition?: Transition
}

const AnimatedBackgroundContext = createContext<{
  value: string | undefined
  transition: Transition
  layoutId: string
} | null>(null)

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  stiffness: 300,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  damping: 20,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  mass: 0.1,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  velocity: 12,
}

/** `<AnimatedBackground />` component visually highlights selected items by sliding a background into view when hovered over or clicked. */
export function AnimatedBackground(props: AnimatedBackgroundProps) {
  const { value, transition = DEFAULT_TRANSITION, children } = props

  const layoutId = useId()

  const contextValue = useMemo(
    () => ({ value, transition, layoutId }),
    [value, transition, layoutId],
  )

  return (
    <AnimatedBackgroundContext.Provider value={contextValue}>
      {children}
    </AnimatedBackgroundContext.Provider>
  )
}

/**
 * Props for {@link AnimatedBackground.Item}.
 */
type AnimatedBackgroundItemProps = PropsWithChildren<
  AnimatedBackgroundItemPropsWithSelected | AnimatedBackgroundItemPropsWithValue
> & {
  readonly className?: string
  readonly animationClassName?: string
  readonly underlayElement?: React.ReactNode
}

/**
 * Props for {@link AnimatedBackground.Item} with a `value` prop.
 */
interface AnimatedBackgroundItemPropsWithValue {
  readonly value: string
  readonly isSelected?: never
}

/**
 * Props for {@link AnimatedBackground.Item} with a `isSelected` prop.
 */
interface AnimatedBackgroundItemPropsWithSelected {
  readonly isSelected: boolean
  readonly value?: never
}

/** Item within an {@link AnimatedBackground}. */
AnimatedBackground.Item = memo(function AnimatedBackgroundItem(props: AnimatedBackgroundItemProps) {
  const {
    value,
    className,
    animationClassName,
    children,
    isSelected,
    underlayElement = <div className={twJoin('h-full w-full', animationClassName)} />,
  } = props

  const context = useContext(AnimatedBackgroundContext)
  invariant(context, '<AnimatedBackground.Item /> must be placed within an <AnimatedBackground />')
  const { value: activeValue, transition, layoutId } = context

  invariant(
    activeValue === undefined || isSelected === undefined,
    'isSelected shall be passed either directly or via context by matching the value prop in <AnimatedBackground.Item /> and value from <AnimatedBackground />',
  )

  const isActive = isSelected ?? activeValue === value

  return (
    <div className={twJoin('relative *:isolate', className)}>
      <AnimatedBackgroundItemUnderlay
        isActive={isActive}
        underlayElement={underlayElement}
        layoutId={layoutId}
        transition={transition}
      />

      {children}
    </div>
  )
})

/**
 * Props for {@link AnimatedBackgroundItemUnderlay}.
 */
interface AnimatedBackgroundItemUnderlayProps {
  readonly isActive: boolean
  readonly underlayElement: React.ReactNode
  readonly layoutId: string
  readonly transition: Transition
}

/**
 * Underlay for {@link AnimatedBackground.Item}.
 */
// eslint-disable-next-line no-restricted-syntax
const AnimatedBackgroundItemUnderlay = memo(function AnimatedBackgroundItemUnderlay(
  props: AnimatedBackgroundItemUnderlayProps,
) {
  const { isActive, underlayElement, layoutId, transition } = props

  return (
    <AnimatePresence initial={!isActive}>
      {isActive && (
        <motion.div
          layout="position"
          layoutId={`background-${layoutId}`}
          className="pointer-events-none absolute inset-0"
          transition={transition}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {underlayElement}
        </motion.div>
      )}
    </AnimatePresence>
  )
})
