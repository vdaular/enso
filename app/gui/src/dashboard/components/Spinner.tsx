/**
 * @file A spinning arc that animates using the `dasharray-<percentage>` custom Tailwind
 * classes.
 */
import { twMerge } from '#/utilities/tailwindMerge'

/** The state of the spinner. It should go from `initial`, to `loading`, to `done`. */
export type SpinnerState = 'done' | 'initial' | 'loading-fast' | 'loading-medium' | 'loading-slow'

export const SPINNER_CSS_CLASSES: Readonly<Record<SpinnerState, string>> = {
  initial: 'dasharray-5 ease-linear',
  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  'loading-slow': 'dasharray-75 duration-spinner-slow ease-linear',
  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  'loading-medium': 'dasharray-75 duration-spinner-medium ease-linear',
  /* eslint-disable-next-line @typescript-eslint/naming-convention */
  'loading-fast': 'dasharray-75 duration-spinner-fast ease-linear',
  done: 'dasharray-100 duration-spinner-fast ease-in',
}

/** Props for a {@link Spinner}. */
export interface SpinnerProps {
  readonly size?: number
  readonly padding?: number
  readonly className?: string
  readonly state: SpinnerState
}

/** A spinning arc that animates using the `dasharray-<percentage>` custom Tailwind classes. */
export function Spinner(props: SpinnerProps) {
  const { size, padding, className, state } = props

  return (
    <svg
      width={size}
      height={size}
      className={className}
      style={{ padding }}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid="spinner"
    >
      <rect
        x={1.5}
        y={1.5}
        width={21}
        height={21}
        rx={10.5}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={3}
        className={twMerge(
          'pointer-events-none origin-center !animate-spin-ease transition-stroke-dasharray [transition-duration:var(--spinner-slow-transition-duration)]',
          SPINNER_CSS_CLASSES[state],
        )}
      />
    </svg>
  )
}
