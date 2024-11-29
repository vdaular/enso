/**
 * @file A dialog is an overlay shown above other content in an application.
 * Can be used to display alerts, confirmations, or other content.
 */
import * as React from 'react'

import * as aria from '#/components/aria'
import * as ariaComponents from '#/components/AriaComponents'
import * as errorBoundary from '#/components/ErrorBoundary'
import * as portal from '#/components/Portal'
import * as suspense from '#/components/Suspense'

import * as mergeRefs from '#/utilities/mergeRefs'

import { useEventCallback } from '#/hooks/eventCallbackHooks'
import { useMeasure } from '#/hooks/measureHooks'
import { motion, type Spring } from '#/utilities/motion'
import type { VariantProps } from '#/utilities/tailwindVariants'
import { tv } from '#/utilities/tailwindVariants'
import { Close } from './Close'
import * as dialogProvider from './DialogProvider'
import * as dialogStackProvider from './DialogStackProvider'
import type * as types from './types'
import * as utlities from './utilities'
import { DIALOG_BACKGROUND } from './variants'

// eslint-disable-next-line no-restricted-syntax
const MotionDialog = motion(aria.Dialog)

const OVERLAY_STYLES = tv({
  base: 'fixed inset-0 isolate flex items-center justify-center bg-primary/20 z-tooltip',
  variants: {
    isEntering: { true: 'animate-in fade-in duration-200 ease-out' },
    isExiting: { true: 'animate-out fade-out duration-200 ease-in' },
    blockInteractions: { true: 'backdrop-blur-md transition-[backdrop-filter] duration-200' },
  },
})

const MODAL_STYLES = tv({
  base: 'fixed inset-0 flex items-center justify-center text-xs text-primary',
  variants: {
    isEntering: { true: 'animate-in ease-out duration-200' },
    isExiting: { true: 'animate-out ease-in duration-200' },
    type: { modal: '', fullscreen: 'p-3.5' },
  },
  compoundVariants: [
    { type: 'modal', isEntering: true, class: 'slide-in-from-top-1' },
    { type: 'modal', isExiting: true, class: 'slide-out-to-top-1' },
    { type: 'fullscreen', isEntering: true, class: 'zoom-in-[1.015]' },
    { type: 'fullscreen', isExiting: true, class: 'zoom-out-[1.015]' },
  ],
})

const DIALOG_STYLES = tv({
  base: DIALOG_BACKGROUND({
    className: 'w-full max-w-full flex flex-col text-left align-middle shadow-xl overflow-clip',
  }),
  variants: {
    type: {
      modal: {
        base: 'w-full min-h-[100px] max-h-[90vh]',
        header: 'px-3.5 pt-[3px] pb-0.5 min-h-[42px]',
      },
      fullscreen: {
        base: 'w-full h-full max-w-full max-h-full bg-clip-border',
        header: 'px-4 pt-[5px] pb-1.5 min-h-12',
      },
    },
    fitContent: {
      true: {
        base: 'min-w-max',
        content: 'min-w-max',
      },
    },
    hideCloseButton: { true: { closeButton: 'hidden' } },
    closeButton: {
      normal: { base: '', closeButton: '' },
      floating: {
        base: '',
        closeButton: 'absolute left-4 top-4 visible z-1 transition-all duration-150',
        header: 'p-0 max-h-0 min-h-0 h-0 border-0 z-1',
        content: 'isolate',
      },
      none: {},
    },
    rounded: {
      none: { base: '' },
      small: { base: 'rounded-sm' },
      medium: { base: 'rounded-md' },
      large: { base: 'rounded-lg' },
      xlarge: { base: 'rounded-xl' },
      xxlarge: { base: 'rounded-2xl', scroller: 'scroll-offset-edge-2xl' },
      xxxlarge: { base: 'rounded-3xl', scroller: 'scroll-offset-edge-3xl' },
      xxxxlarge: { base: 'rounded-4xl', scroller: 'scroll-offset-edge-4xl' },
    },
    /**
     * The size of the dialog.
     * Only applies to the `modal` type.
     */
    size: {
      small: { base: '' },
      medium: { base: '' },
      large: { base: '' },
      xlarge: { base: '' },
      xxlarge: { base: '' },
      xxxlarge: { base: '' },
      xxxxlarge: { base: '' },
    },
    padding: {
      none: { content: 'p-0' },
      small: { content: 'px-1 pt-3.5 pb-3.5' },
      medium: { content: 'px-4 pt-3 pb-4' },
      large: { content: 'px-8 pt-5 pb-5' },
      xlarge: { content: 'p-12 pt-6 pb-8' },
      xxlarge: { content: 'p-16 pt-8 pb-12' },
      xxxlarge: { content: 'p-20 pt-10 pb-16' },
    },
    scrolledToTop: { true: { header: 'border-transparent' } },
  },
  slots: {
    header:
      'sticky z-1 top-0 grid grid-cols-[1fr_auto_1fr] items-center border-b border-primary/10 transition-[border-color] duration-150',
    closeButton: 'col-start-1 col-end-1 mr-auto',
    heading: 'col-start-2 col-end-2 my-0 text-center',
    scroller: 'flex flex-col overflow-y-auto max-h-[inherit]',
    measurerWrapper: 'inline-grid h-fit max-h-fit min-h-fit w-full grid-rows-[auto]',
    measurer: 'pointer-events-none block [grid-area:1/1]',
    content: 'inline-block h-fit max-h-fit min-h-fit [grid-area:1/1] min-w-0',
  },
  compoundVariants: [
    { type: 'modal', size: 'small', class: 'max-w-sm' },
    { type: 'modal', size: 'medium', class: 'max-w-md' },
    { type: 'modal', size: 'large', class: 'max-w-lg' },
    { type: 'modal', size: 'xlarge', class: 'max-w-xl' },
    { type: 'modal', size: 'xxlarge', class: 'max-w-2xl' },
    { type: 'modal', size: 'xxxlarge', class: 'max-w-3xl' },
    { type: 'modal', size: 'xxxxlarge', class: 'max-w-4xl' },
  ],
  defaultVariants: {
    type: 'modal',
    closeButton: 'normal',
    hideCloseButton: false,
    size: 'medium',
    padding: 'none',
    rounded: 'xxxlarge',
  },
})

const TRANSITION: Spring = {
  type: 'spring',
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  stiffness: 1_200,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  damping: 90,
  mass: 3,
}

// ==============
// === Dialog ===
// ==============

/** Props for the {@link Dialog} component. */
export interface DialogProps
  extends types.DialogProps,
    Omit<VariantProps<typeof DIALOG_STYLES>, 'scrolledToTop'> {}

/**
 * A dialog is an overlay shown above other content in an application.
 * Can be used to display alerts, confirmations, or other content.
 */
export function Dialog(props: DialogProps) {
  const {
    type = 'modal',
    isDismissable = true,
    isKeyboardDismissDisabled = false,
    onOpenChange = () => {},
    modalProps = {},
  } = props

  const root = portal.useStrictPortalContext()

  return (
    <aria.ModalOverlay
      className={({ isEntering, isExiting }) =>
        OVERLAY_STYLES({ isEntering, isExiting, blockInteractions: !isDismissable })
      }
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      UNSTABLE_portalContainer={root}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={() => false}
      {...modalProps}
    >
      {(values) => (
        <aria.Modal
          className={({ isEntering, isExiting }) => MODAL_STYLES({ type, isEntering, isExiting })}
          isDismissable={isDismissable}
          isKeyboardDismissDisabled={isKeyboardDismissDisabled}
          UNSTABLE_portalContainer={root}
          onOpenChange={onOpenChange}
          shouldCloseOnInteractOutside={() => false}
          {...modalProps}
        >
          <DialogContent {...props} modalState={values.state} />
        </aria.Modal>
      )}
    </aria.ModalOverlay>
  )
}

const TYPE_TO_DIALOG_TYPE: Record<
  NonNullable<DialogProps['type']>,
  dialogStackProvider.DialogStackItem['type']
> = {
  modal: 'dialog',
  fullscreen: 'dialog-fullscreen',
}

/**
 * Props for the {@link DialogContent} component.
 */
interface DialogContentProps extends DialogProps, VariantProps<typeof DIALOG_STYLES> {
  readonly modalState: aria.OverlayTriggerState
}

/**
 * The content of a dialog.
 * @internal
 */
function DialogContent(props: DialogContentProps) {
  const {
    variants = DIALOG_STYLES,
    modalState,
    className,
    type = 'modal',
    rounded,
    hideCloseButton = false,
    closeButton = 'normal',
    size,
    padding: paddingRaw,
    fitContent,
    testId = 'dialog',
    title,
    children,
    isDismissable = true,
    ...ariaDialogProps
  } = props

  const dialogRef = React.useRef<HTMLDivElement>(null)
  const scrollerRef = React.useRef<HTMLDivElement | null>()
  const dialogId = aria.useId()

  const titleId = `${dialogId}-title`
  const padding = paddingRaw ?? (type === 'modal' ? 'medium' : 'xlarge')
  const isFullscreen = type === 'fullscreen'

  const [isScrolledToTop, setIsScrolledToTop] = React.useState(true)

  const [isLayoutDisabled, setIsLayoutDisabled] = React.useState(true)

  const [contentDimensionsRef, dimensions] = useMeasure({
    isDisabled: isLayoutDisabled,
    useRAF: false,
  })

  const [headerDimensionsRef, headerDimensions] = useMeasure({
    isDisabled: isLayoutDisabled,
    useRAF: false,
  })

  utlities.useInteractOutside({
    ref: dialogRef,
    id: dialogId,
    onInteractOutside: () => {
      if (isDismissable) {
        modalState.close()
      } else {
        if (dialogRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          utlities.animateScale(dialogRef.current, 1.02)
        }
      }
    },
  })

  /** Handles the scroll event on the dialog content. */
  const handleScroll = useEventCallback((ref: HTMLDivElement | null) => {
    scrollerRef.current = ref
    React.startTransition(() => {
      if (ref && ref.scrollTop > 0) {
        setIsScrolledToTop(false)
      } else {
        setIsScrolledToTop(true)
      }
    })
  })

  const handleScrollEvent = useEventCallback((event: React.UIEvent<HTMLDivElement>) => {
    handleScroll(event.currentTarget)
  })

  React.useEffect(() => {
    if (isFullscreen) {
      return
    }

    setIsLayoutDisabled(false)

    return () => {
      setIsLayoutDisabled(true)
    }
  }, [isFullscreen])

  const styles = variants({
    className,
    type,
    rounded,
    hideCloseButton,
    closeButton,
    scrolledToTop: isScrolledToTop,
    size,
    padding,
    fitContent,
  })

  const dialogHeight = () => {
    if (isFullscreen) {
      return ''
    }

    if (dimensions == null || headerDimensions == null) {
      return ''
    }

    return dimensions.height + headerDimensions.height
  }

  return (
    <>
      <MotionDialog
        layout
        transition={TRANSITION}
        style={{ height: dialogHeight() }}
        id={dialogId}
        onLayoutAnimationStart={() => {
          if (scrollerRef.current) {
            scrollerRef.current.style.overflowY = 'clip'
          }
        }}
        onLayoutAnimationComplete={() => {
          if (scrollerRef.current) {
            scrollerRef.current.style.overflowY = ''
          }
        }}
        ref={(ref: HTMLDivElement | null) => {
          mergeRefs.mergeRefs(dialogRef, (element) => {
            if (element) {
              // This is a workaround for the `data-testid` attribute not being
              // supported by the 'react-aria-components' library.
              // We need to set the `data-testid` attribute on the dialog element
              // so that we can use it in our tests.
              // This is a temporary solution until we refactor the Dialog component
              // to use `useDialog` hook from the 'react-aria-components' library.
              // this will allow us to set the `data-testid` attribute on the dialog
              element.dataset.testId = testId
            }
          })(ref)
        }}
        className={styles.base()}
        aria-labelledby={titleId}
        {...ariaDialogProps}
      >
        {(opts) => (
          <>
            <dialogProvider.DialogProvider close={opts.close} dialogId={dialogId}>
              <motion.div layout className="w-full" transition={{ duration: 0 }}>
                <DialogHeader
                  closeButton={closeButton}
                  title={title}
                  titleId={titleId}
                  headerClassName={styles.header({ scrolledToTop: isScrolledToTop })}
                  closeButtonClassName={styles.closeButton()}
                  headingClassName={styles.heading()}
                  headerDimensionsRef={headerDimensionsRef}
                />
              </motion.div>

              <motion.div
                layout
                layoutScroll
                className={styles.scroller()}
                ref={handleScroll}
                onScroll={handleScrollEvent}
                transition={{ duration: 0 }}
              >
                <div className={styles.measurerWrapper()}>
                  {/* eslint-disable jsdoc/check-alignment */}
                  {/**
                   * This div is used to measure the content dimensions.
                   * It's takes the same grid area as the content, thus
                   * resizes together with the content.
                   *
                   * We use grid + grid-area to avoid setting `position: relative`
                   * on the element, which would interfere with the layout.
                   *
                   * It's set to `pointer-events-none` so that it doesn't
                   * interfere with the layout.
                   */}
                  {/* eslint-enable jsdoc/check-alignment */}
                  <div ref={contentDimensionsRef} className={styles.measurer()} />
                  <div className={styles.content()}>
                    <errorBoundary.ErrorBoundary>
                      <suspense.Suspense
                        loaderProps={{ minHeight: type === 'fullscreen' ? 'full' : 'h32' }}
                      >
                        {typeof children === 'function' ? children(opts) : children}
                      </suspense.Suspense>
                    </errorBoundary.ErrorBoundary>
                  </div>
                </div>
              </motion.div>
            </dialogProvider.DialogProvider>
          </>
        )}
      </MotionDialog>

      <dialogStackProvider.DialogStackRegistrar id={dialogId} type={TYPE_TO_DIALOG_TYPE[type]} />
    </>
  )
}

/**
 * Props for the {@link DialogHeader} component.
 */
interface DialogHeaderProps {
  readonly headerClassName: string
  readonly closeButtonClassName: string
  readonly headingClassName: string
  readonly closeButton: DialogProps['closeButton']
  readonly title: DialogProps['title']
  readonly titleId: string
  readonly headerDimensionsRef: (node: HTMLElement | null) => void
}

/**
 * The header of a dialog.
 * @internal
 */
// eslint-disable-next-line no-restricted-syntax
const DialogHeader = React.memo(function DialogHeader(props: DialogHeaderProps) {
  const {
    closeButton,
    title,
    titleId,
    headerClassName,
    closeButtonClassName,
    headingClassName,
    headerDimensionsRef,
  } = props

  const { close } = dialogProvider.useDialogStrictContext()

  return (
    <aria.Header ref={headerDimensionsRef} className={headerClassName}>
      {closeButton !== 'none' && (
        <ariaComponents.CloseButton className={closeButtonClassName} onPress={close} />
      )}

      {title != null && (
        <ariaComponents.Text.Heading
          id={titleId}
          level={2}
          className={headingClassName}
          weight="semibold"
        >
          {title}
        </ariaComponents.Text.Heading>
      )}
    </aria.Header>
  )
})

Dialog.Close = Close
