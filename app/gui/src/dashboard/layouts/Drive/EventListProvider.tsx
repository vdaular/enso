/** @file The React provider (and associated hooks) for providing reactive events. */
import * as React from 'react'

import invariant from 'tiny-invariant'
import * as zustand from 'zustand'

import type * as assetEvent from '#/events/assetEvent'
import type * as assetListEvent from '#/events/assetListEvent'
import { useEventCallback } from '#/hooks/eventCallbackHooks'

// ======================
// === EventListStore ===
// ======================

/** The state of this zustand store. */
interface EventListStore {
  readonly assetEvents: readonly assetEvent.AssetEvent[]
  readonly assetListEvents: readonly assetListEvent.AssetListEvent[]
  readonly dispatchAssetEvent: (event: assetEvent.AssetEvent) => void
  readonly dispatchAssetListEvent: (event: assetListEvent.AssetListEvent) => void
}

// ========================
// === EventListContext ===
// ========================

/** State contained in a `EventListContext`. */
export type EventListContextType = zustand.StoreApi<EventListStore>

const EventListContext = React.createContext<EventListContextType | null>(null)

/** Props for a {@link EventListProvider}. */
export type EventListProviderProps = Readonly<React.PropsWithChildren>

// =========================
// === EventListProvider ===
// =========================

/**
 * A React provider (and associated hooks) for determining whether the current area
 * containing the current element is focused.
 */
export default function EventListProvider(props: EventListProviderProps) {
  const { children } = props
  const [store] = React.useState(() =>
    zustand.createStore<EventListStore>((set, get) => ({
      assetEvents: [],
      dispatchAssetEvent: (event) => {
        set({ assetEvents: [...get().assetEvents, event] })
      },
      assetListEvents: [],
      dispatchAssetListEvent: (event) => {
        set({ assetListEvents: [...get().assetListEvents, event] })
      },
    })),
  )

  React.useEffect(
    () =>
      store.subscribe((state) => {
        // Run after the next render.
        setTimeout(() => {
          if (state.assetEvents.length) {
            store.setState({ assetEvents: [] })
          }
          if (state.assetListEvents.length) {
            store.setState({ assetListEvents: [] })
          }
        })
      }),
    [store],
  )

  return <EventListContext.Provider value={store}>{children}</EventListContext.Provider>
}

// ====================
// === useEventList ===
// ====================

/** Functions for getting and setting the event list. */
function useEventList() {
  const store = React.useContext(EventListContext)

  invariant(store, 'Event list store can only be used inside an `EventListProvider`.')

  return store
}

// =============================
// === useDispatchAssetEvent ===
// =============================

/** A function to add a new reactive event. */
export function useDispatchAssetEvent() {
  const store = useEventList()
  return zustand.useStore(store, (state) => state.dispatchAssetEvent)
}

// =================================
// === useDispatchAssetListEvent ===
// =================================

/** A function to add a new reactive event. */
export function useDispatchAssetListEvent() {
  const store = useEventList()
  return zustand.useStore(store, (state) => state.dispatchAssetListEvent)
}

// =============================
// === useAssetEventListener ===
// =============================

/** Execute a callback for every new asset event. */
export function useAssetEventListener(
  callback: (event: assetEvent.AssetEvent) => Promise<void> | void,
  initialEvents?: readonly assetEvent.AssetEvent[] | null,
) {
  const stableCallback = useEventCallback(callback)
  const store = useEventList()
  const seen = React.useRef(new WeakSet())
  const initialEventsRef = React.useRef(initialEvents)

  React.useEffect(() => {
    const events = initialEventsRef.current
    if (events) {
      for (const event of events) {
        void stableCallback(event)
      }
    }
    // Clear the events list to avoid handling them twice in dev mode.
    initialEventsRef.current = undefined
  }, [stableCallback])

  React.useEffect(
    () =>
      store.subscribe((state, prevState) => {
        if (state.assetEvents !== prevState.assetEvents) {
          for (const event of state.assetEvents) {
            if (!seen.current.has(event)) {
              seen.current.add(event)
              void stableCallback(event)
            }
          }
        }
      }),
    [stableCallback, store],
  )
}

// =================================
// === useAssetListEventListener ===
// =================================

/** Execute a callback for every new asset list event. */
export function useAssetListEventListener(
  callback: (event: assetListEvent.AssetListEvent) => Promise<void> | void,
  initialEvents?: readonly assetListEvent.AssetListEvent[] | null,
) {
  const stableCallback = useEventCallback(callback)
  const store = useEventList()
  const seen = React.useRef(new WeakSet())
  const initialEventsRef = React.useRef(initialEvents)

  React.useEffect(() => {
    const events = initialEventsRef.current
    if (events) {
      for (const event of events) {
        void stableCallback(event)
      }
    }
    // Clear the events list to avoid handling them twice in dev mode.
    initialEventsRef.current = undefined
  }, [stableCallback])

  React.useEffect(
    () =>
      store.subscribe((state, prevState) => {
        if (state.assetListEvents !== prevState.assetListEvents) {
          for (const event of state.assetListEvents) {
            if (!seen.current.has(event)) {
              seen.current.add(event)
              void stableCallback(event)
            }
          }
        }
      }),
    [stableCallback, store],
  )
}
