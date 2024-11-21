/** @file Hooks related to context menus. */
import * as React from 'react'

import * as modalProvider from '#/providers/ModalProvider'

import ContextMenu from '#/components/ContextMenu'
import ContextMenus from '#/components/ContextMenus'
import { useEventCallback } from '#/hooks/eventCallbackHooks'
import { useSyncRef } from '#/hooks/syncRefHooks'

/**
 * Return a ref that attaches a context menu event listener.
 * Should be used ONLY if the element does not expose an `onContextMenu` prop.
 */
export function useContextMenuRef(
  key: string,
  label: string,
  createEntries: (position: Pick<React.MouseEvent, 'pageX' | 'pageY'>) => React.JSX.Element | null,
  options: { enabled?: boolean } = {},
) {
  const { setModal } = modalProvider.useSetModal()
  const stableCreateEntries = useEventCallback(createEntries)
  const optionsRef = useSyncRef(options)
  const cleanupRef = React.useRef(() => {})

  return React.useMemo(
    () => (element: HTMLElement | null) => {
      cleanupRef.current()
      if (element == null) {
        cleanupRef.current = () => {}
      } else {
        const onContextMenu = (event: MouseEvent) => {
          const { enabled = true } = optionsRef.current
          if (enabled) {
            const position = { pageX: event.pageX, pageY: event.pageY }
            const children = stableCreateEntries(position)
            if (children != null) {
              event.preventDefault()
              event.stopPropagation()
              setModal(
                <ContextMenus
                  ref={(contextMenusElement) => {
                    if (contextMenusElement != null) {
                      const rect = contextMenusElement.getBoundingClientRect()
                      position.pageX = rect.left
                      position.pageY = rect.top
                    }
                  }}
                  key={key}
                  event={event}
                >
                  <ContextMenu aria-label={label}>{children}</ContextMenu>
                </ContextMenus>,
              )
            }
          }
        }
        element.addEventListener('contextmenu', onContextMenu)
        cleanupRef.current = () => {
          element.removeEventListener('contextmenu', onContextMenu)
        }
      }
    },
    [stableCreateEntries, key, label, optionsRef, setModal],
  )
}
