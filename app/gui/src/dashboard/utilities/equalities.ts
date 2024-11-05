/**
 * @file
 *
 * This file contains functions for checking equality between values.
 */

/**
 * Strict equality check.
 */
export function refEquality<T>(a: T, b: T) {
  return a === b
}

/**
 * Object.is equality check.
 */
export function objectEquality<T>(a: T, b: T) {
  return Object.is(a, b)
}

/**
 * Shallow equality check.
 */
export function shallowEquality<T>(a: T, b: T) {
  if (Object.is(a, b)) {
    return true
  }

  if (typeof a !== 'object' || a == null || typeof b !== 'object' || b == null) {
    return false
  }

  const keysA = Object.keys(a)

  if (keysA.length !== Object.keys(b).length) {
    return false
  }

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]

    if (key != null) {
      // @ts-expect-error Typescript doesn't know that key is in a and b, but it doesn't matter here
      if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
        return false
      }
    }
  }

  return true
}
