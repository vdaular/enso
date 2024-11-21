/** @file Modal for confirming delete of any type of asset. */
import * as React from 'react'

import * as modalProvider from '#/providers/ModalProvider'

import { useEventCallback } from '#/hooks/eventCallbackHooks'
import { DIALOG_BACKGROUND } from '../components/AriaComponents'

// =================
// === Constants ===
// =================

/** The default offset (up and to the right) of the drag element. */
const DEFAULT_OFFSET_PX = 16

// =================
// === DragModal ===
// =================

/** Props for a {@link DragModal}. */
export interface DragModalProps
  extends Readonly<React.PropsWithChildren>,
    Readonly<JSX.IntrinsicElements['div']> {
  readonly event: React.DragEvent
  readonly onDragEnd: () => void
  readonly offsetPx?: number
  readonly offsetXPx?: number
  readonly offsetYPx?: number
}

/** A modal for confirming the deletion of an asset. */
export default function DragModal(props: DragModalProps) {
  const {
    event,
    offsetPx,
    offsetXPx = DEFAULT_OFFSET_PX,
    offsetYPx = DEFAULT_OFFSET_PX,
    children,
    style,
    className,
    onDragEnd: onDragEndRaw,
    ...passthrough
  } = props
  const { unsetModal } = modalProvider.useSetModal()
  const [left, setLeft] = React.useState(event.pageX - (offsetPx ?? offsetXPx))
  const [top, setTop] = React.useState(event.pageY - (offsetPx ?? offsetYPx))
  const onDragEndOuter = useEventCallback(onDragEndRaw)

  React.useEffect(() => {
    const onDrag = (dragEvent: MouseEvent) => {
      if (dragEvent.pageX !== 0 || dragEvent.pageY !== 0) {
        setLeft(dragEvent.pageX - (offsetPx ?? offsetXPx))
        setTop(dragEvent.pageY - (offsetPx ?? offsetYPx))
      }
    }
    const onDragEnd = () => {
      React.startTransition(() => {
        onDragEndOuter()
        unsetModal()
      })
    }
    // Update position (non-FF)
    document.addEventListener('drag', onDrag, { capture: true })
    // Update position (FF)
    document.addEventListener('dragover', onDrag, { capture: true })
    document.addEventListener('dragend', onDragEnd, { capture: true })
    return () => {
      document.removeEventListener('drag', onDrag, { capture: true })
      document.removeEventListener('dragover', onDrag, { capture: true })
      document.removeEventListener('dragend', onDragEnd, { capture: true })
    }
  }, [offsetPx, offsetXPx, offsetYPx, onDragEndOuter, unsetModal])

  return (
    <div className="pointer-events-none absolute size-full overflow-hidden">
      <div
        {...passthrough}
        style={{ left, top, ...style }}
        className={DIALOG_BACKGROUND({
          className: ['relative z-10 w-min -translate-x-1/3 -translate-y-1/3', className],
        })}
      >
        {children}
      </div>
    </div>
  )
}
