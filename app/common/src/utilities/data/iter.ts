/** @file Utilities for manipulating {@link Iterator}s and {@link Iterable}s. */

/** Similar to {@link Array.prototype.reduce|}, but consumes elements from any iterable. */
export function reduce<T, A>(
  iterable: Iterable<T>,
  f: (accumulator: A, element: T) => A,
  initialAccumulator: A,
): A {
  const iterator = iterable[Symbol.iterator]()
  let accumulator = initialAccumulator
  let result = iterator.next()
  while (!result.done) {
    accumulator = f(accumulator, result.value)
    result = iterator.next()
  }
  return accumulator
}

/**
 * Iterates the provided iterable, returning the number of elements it yielded. Note that if the input is an iterator,
 * it will be consumed.
 */
export function count(it: Iterable<unknown>): number {
  return reduce(it, (a) => a + 1, 0)
}

/** An iterable with zero elements. */
export function* empty(): Generator<never> {}

/**
 * An iterable `yield`ing numeric values with the given step between the start (inclusive)
 * and the end (exclusive).
 */
export function* range(start: number, stop: number, step = start <= stop ? 1 : -1) {
  if ((step > 0 && start > stop) || (step < 0 && start < stop)) {
    throw new Error(
      "The range's step is in the wrong direction - please use Infinity or -Infinity as the endpoint for an infinite range.",
    )
  }
  if (start <= stop) {
    while (start < stop) {
      yield start
      start += step
    }
  } else {
    while (start > stop) {
      yield start
      start += step
    }
  }
}

/** @returns An iterator that yields the results of applying the given function to each value of the given iterable. */
export function* map<T, U>(it: Iterable<T>, f: (value: T) => U): IterableIterator<U> {
  for (const value of it) yield f(value)
}

export function filter<T, S extends T>(
  iter: Iterable<T>,
  include: (value: T) => value is S,
): IterableIterator<S>
export function filter<T>(iter: Iterable<T>, include: (value: T) => boolean): IterableIterator<T>
/**
 * Return an {@link Iterable} that `yield`s only the values from the given source iterable
 * that pass the given predicate.
 */
export function* filter<T>(iter: Iterable<T>, include: (value: T) => boolean): IterableIterator<T> {
  for (const value of iter) if (include(value)) yield value
}

/**
 * Return an {@link Iterable} that `yield`s values from each iterable sequentially,
 * yielding values from the second iterable only after exhausting the first iterable, and so on.
 */
export function* chain<T>(...iters: Iterable<T>[]) {
  for (const iter of iters) {
    yield* iter
  }
}

/**
 * Return an iterable that `yield`s the next value from both given source iterables at the same time.
 * Stops `yield`ing when *either* iterable is exhausted.
 */
export function* zip<T, U>(left: Iterable<T>, right: Iterable<U>): Generator<[T, U]> {
  const leftIterator = left[Symbol.iterator]()
  const rightIterator = right[Symbol.iterator]()
  while (true) {
    const leftResult = leftIterator.next()
    const rightResult = rightIterator.next()
    if (leftResult.done || rightResult.done) break
    yield [leftResult.value, rightResult.value]
  }
}

/**
 * Return an iterable that `yield`s the next value from both given source iterables at the same time.
 * `yield`s `undefined` for the shorter iterator when it is exhausted.
 */
export function* zipLongest<T, U>(
  left: Iterable<T>,
  right: Iterable<U>,
): Generator<[T | undefined, U | undefined]> {
  const leftIterator = left[Symbol.iterator]()
  const rightIterator = right[Symbol.iterator]()
  while (true) {
    const leftResult = leftIterator.next()
    const rightResult = rightIterator.next()
    if (leftResult.done && rightResult.done) break
    yield [
      leftResult.done ? undefined : leftResult.value,
      rightResult.done ? undefined : rightResult.value,
    ]
  }
}

/**
 * Return the value of the iterator if and only if it contains exactly one value.
 * Otherwise, return `undefined`.
 */
export function tryGetSoleValue<T>(iter: Iterable<T>): T | undefined {
  const iterator = iter[Symbol.iterator]()
  const result = iterator.next()
  if (result.done) return
  const excessResult = iterator.next()
  if (!excessResult.done) return
  return result.value
}

/** Utility to simplify consuming an iterator one part at a time. */
export class Resumable<T> {
  private readonly iterator: Iterator<T>
  private current: IteratorResult<T>
  /** Create a {@link Resumable}. */
  constructor(iterable: Iterable<T>) {
    this.iterator = iterable[Symbol.iterator]()
    this.current = this.iterator.next()
  }

  /** The current value of the iterator. */
  peek() {
    return this.current.done ? undefined : this.current.value
  }

  /** Advance the iterator, saving the new current value of the iterator. */
  advance() {
    this.current = this.iterator.next()
  }

  /**
   * The given function peeks at the current value. If the function returns `true`, the current value will be advanced
   * and the function called again; if it returns `false`, the peeked value remains current and `advanceWhile` returns.
   */
  advanceWhile(f: (value: T) => boolean) {
    while (!this.current.done && f(this.current.value)) {
      this.current = this.iterator.next()
    }
  }

  /** Apply the given function to all values remaining in the iterator. */
  forEach(f: (value: T) => void) {
    while (!this.current.done) {
      f(this.current.value)
      this.current = this.iterator.next()
    }
  }
}

/** Returns an iterator that yields the values of the provided iterator that are not strictly-equal to `undefined`. */
export function* filterDefined<T>(iterable: Iterable<T | undefined>): IterableIterator<T> {
  for (const value of iterable) {
    if (value !== undefined) yield value
  }
}

/**
 * Returns whether the predicate returned `true` for all values yielded by the provided iterator. Short-circuiting.
 * Returns `true` if the iterator doesn't yield any values.
 */
export function every<T>(iter: Iterable<T>, f: (value: T) => boolean): boolean {
  for (const value of iter) if (!f(value)) return false
  return true
}

/**
 * Returns whether the predicate returned `true` for any values yielded by the provided iterator. Short-circuiting.
 * Returns `false` if the iterator doesn't yield any values.
 */
export function some<T>(iter: Iterable<T>, f: (value: T) => boolean): boolean {
  for (const value of iter) if (f(value)) return true
  return false
}

export function find<T, S extends T>(iter: Iterable<T>, f: (value: T) => value is S): S | undefined
export function find<T>(iter: Iterable<T>, f: (value: T) => boolean): T | undefined
/** Return the first element returned by the iterable which meets the condition. */
export function find<T>(iter: Iterable<T>, f: (value: T) => boolean): T | undefined {
  for (const value of iter) {
    if (f(value)) return value
  }
  return undefined
}

/** Returns the first element yielded by the iterable. */
export function first<T>(iterable: Iterable<T>): T | undefined {
  const iterator = iterable[Symbol.iterator]()
  const result = iterator.next()
  return result.done ? undefined : result.value
}

/**
 * Return last element returned by the iterable.
 * NOTE: Linear complexity. This function always visits the whole iterable. Using this with an
 * infinite generator will cause an infinite loop.
 */
export function last<T>(iter: Iterable<T>): T | undefined {
  let last
  for (const el of iter) last = el
  return last
}

/** Yields items of the iterable with their index. */
export function* enumerate<T>(items: Iterable<T>): Generator<[T, number]> {
  let index = 0
  for (const item of items) {
    yield [item, index++]
  }
}
