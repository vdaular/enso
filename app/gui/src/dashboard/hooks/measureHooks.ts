/**
 * @file
 *
 * This file contains the useMeasure hook, which is used to measure the size and position of an element.
 */
import { frame, useMotionValue } from 'framer-motion'

import { useEffect, useRef, useState } from 'react'
import { unsafeMutable } from '../utilities/object'
import { useDebouncedCallback } from './debounceCallbackHooks'
import { useEventCallback } from './eventCallbackHooks'
import { useUnmount } from './unmountHooks'

/**
 * A read-only version of the DOMRect object.
 */
export interface RectReadOnly {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/**
 * A type that represents an HTML or SVG element.
 */
type HTMLOrSVGElement = HTMLElement | SVGElement

/**
 * A type that represents the result of the useMeasure hook.
 */
type Result = [(element: HTMLOrSVGElement | null) => void, RectReadOnly | null, () => void]

/**
 * A type that represents the state of the useMeasure hook.
 */
interface State {
  readonly element: HTMLOrSVGElement | null
  readonly scrollContainers: HTMLOrSVGElement[] | null
  readonly lastBounds: RectReadOnly | null
}

/**
 * A type that represents a callback that is called when the element is resized.
 */
export type OnResizeCallback = (bounds: RectReadOnly) => void

/**
 * A type that represents the options for the useMeasure hook.
 */
export interface Options {
  readonly debounce?: number | { readonly scroll: number; readonly resize: number }
  readonly scroll?: boolean
  readonly offsetSize?: boolean
  readonly onResize?: OnResizeCallback
  readonly maxWait?: number | { readonly scroll: number; readonly resize: number }
  /**
   * Whether to use RAF to measure the element.
   */
  readonly useRAF?: boolean
  readonly isDisabled?: boolean
}

/**
 * Custom hook to measure the size and position of an element
 */
export function useMeasure(options: Options = {}): Result {
  const { onResize } = options

  const [bounds, set] = useState<RectReadOnly | null>(null)

  const onResizeStableCallback = useEventCallback<OnResizeCallback>((nextBounds) => {
    set(nextBounds)

    onResize?.(nextBounds)
  })

  const [ref, forceRefresh] = useMeasureCallback({ ...options, onResize: onResizeStableCallback })

  return [ref, bounds, forceRefresh] as const
}

/**
 * Helper hook that uses motion primitive to optimize renders, works best with motion components
 */
export function useMeasureSignal(options: Options = {}) {
  const { onResize } = options

  const bounds = useMotionValue<RectReadOnly | null>(null)

  const onResizeStableCallback = useEventCallback<OnResizeCallback>((nextBounds) => {
    bounds.set(nextBounds)

    onResize?.(nextBounds)
  })

  const [ref, forceRefresh] = useMeasureCallback({ ...options, onResize: onResizeStableCallback })

  return [ref, bounds, forceRefresh] as const
}

const DEFAULT_MAX_WAIT = 500

/**
 * Same as useMeasure, but doesn't rerender the component when the element is resized.
 * Instead, it calls the `onResize` callback with the new bounds. This is useful when you want to
 * measure the size of an element without causing a rerender.
 */
export function useMeasureCallback(options: Options & Required<Pick<Options, 'onResize'>>) {
  const {
    debounce = 0,
    scroll = false,
    offsetSize = false,
    onResize,
    maxWait = DEFAULT_MAX_WAIT,
    useRAF = true,
    isDisabled = false,
  } = options

  // keep all state in a ref
  const state = useRef<State>({
    element: null,
    scrollContainers: null,
    lastBounds: null,
  })
  // make sure to update state only as long as the component is truly mounted
  const mounted = useRef(false)

  const onResizeStableCallback = useEventCallback<OnResizeCallback>(onResize)

  const scrollMaxWait = typeof maxWait === 'number' ? maxWait : maxWait.scroll
  const resizeMaxWait = typeof maxWait === 'number' ? maxWait : maxWait.resize

  // set actual debounce values early, so effects know if they should react accordingly
  const scrollDebounce = typeof debounce === 'number' ? debounce : debounce.scroll
  const resizeDebounce = typeof debounce === 'number' ? debounce : debounce.resize

  const callback = useEventCallback(() => {
    frame.read(measureCallback)
  })

  const measureCallback = useEventCallback(() => {
    const element = state.current.element

    if (!element || isDisabled) return

    const { left, top, width, height, bottom, right, x, y } = element.getBoundingClientRect()

    const size = { left, top, width, height, bottom, right, x, y }

    if (element instanceof HTMLElement && offsetSize) {
      size.height = element.offsetHeight
      size.width = element.offsetWidth
    }

    if (mounted.current && !areBoundsEqual(state.current.lastBounds, size)) {
      unsafeMutable(state.current).lastBounds = size
      onResizeStableCallback(size)
    }
  })

  const resizeDebounceCallback = useDebouncedCallback(
    measureCallback,
    resizeDebounce,
    resizeMaxWait,
  )

  const scrollDebounceCallback = useDebouncedCallback(
    measureCallback,
    scrollDebounce,
    scrollMaxWait,
  )

  const [resizeObserver] = useState(() => new ResizeObserver(measureCallback))
  const [mutationObserver] = useState(() => new MutationObserver(measureCallback))

  const forceRefresh = useDebouncedCallback(callback, 0)

  // cleanup current scroll-listeners / observers
  const removeListeners = useEventCallback(() => {
    if (state.current.scrollContainers) {
      state.current.scrollContainers.forEach((element) => {
        element.removeEventListener('scroll', scrollDebounceCallback, true)
      })
      unsafeMutable(state.current).scrollContainers = null
    }

    resizeObserver.disconnect()
    mutationObserver.disconnect()
  })

  const addListeners = useEventCallback(() => {
    if (!state.current.element) return

    resizeObserver.observe(state.current.element)
    mutationObserver.observe(state.current.element, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    if (useRAF) {
      frame.read(() => {
        measureCallback()
      }, true)
    }

    if (scroll && state.current.scrollContainers) {
      state.current.scrollContainers.forEach((scrollContainer) => {
        scrollContainer.addEventListener('scroll', scrollDebounceCallback, {
          capture: true,
          passive: true,
        })
      })
    }
  })

  // the ref we expose to the user
  const ref = useEventCallback((node: HTMLOrSVGElement | null) => {
    mounted.current = node != null

    if (!node || node === state.current.element) return

    removeListeners()

    unsafeMutable(state.current).element = node
    unsafeMutable(state.current).scrollContainers = findScrollContainers(node)

    measureCallback()

    addListeners()
  })

  // add general event listeners
  useOnWindowScroll(scrollDebounceCallback, Boolean(scroll))
  useOnWindowResize(resizeDebounceCallback)

  // respond to changes that are relevant for the listeners
  useEffect(() => {
    removeListeners()
    addListeners()
  }, [useRAF, scroll, removeListeners, addListeners])

  useUnmount(removeListeners)

  return [ref, forceRefresh] as const
}

/**
 * Adds a window resize event listener
 */
function useOnWindowResize(onWindowResize: (event: Event) => void) {
  useEffect(() => {
    const cb = onWindowResize
    window.addEventListener('resize', cb)
    return () => {
      window.removeEventListener('resize', cb)
    }
  }, [onWindowResize])
}

/**
 * Adds a window scroll event listener
 */
function useOnWindowScroll(onScroll: () => void, enabled: boolean) {
  useEffect(() => {
    if (enabled) {
      const cb = onScroll
      window.addEventListener('scroll', cb, { capture: true, passive: true })
      return () => {
        window.removeEventListener('scroll', cb, true)
      }
    }
  }, [onScroll, enabled])
}

// Returns a list of scroll offsets
/**
 * Finds all scroll containers that have overflow set to 'auto' or 'scroll'
 * @param element - The element to start searching from
 * @returns An array of scroll containers
 */
function findScrollContainers(element: HTMLOrSVGElement | null): HTMLOrSVGElement[] {
  const result: HTMLOrSVGElement[] = []
  if (!element || element === document.body) return result

  const { overflow, overflowX, overflowY } = window.getComputedStyle(element)
  if ([overflow, overflowX, overflowY].some((prop) => prop === 'auto' || prop === 'scroll')) {
    result.push(element)
  }
  return [...result, ...findScrollContainers(element.parentElement)]
}

// Checks if element boundaries are equal
const RECT_KEYS: readonly (keyof RectReadOnly)[] = [
  'x',
  'y',
  'top',
  'bottom',
  'left',
  'right',
  'width',
  'height',
]

/**
 * Compares two RectReadOnly objects to check if their boundaries are equal
 * @param a - First RectReadOnly object
 * @param b - Second RectReadOnly object
 * @returns boolean indicating whether the boundaries are equal
 */
function areBoundsEqual(a: RectReadOnly | null, b: RectReadOnly | null): boolean {
  if (a == null || b == null) return false

  return RECT_KEYS.every((key) => a[key] === b[key])
}
