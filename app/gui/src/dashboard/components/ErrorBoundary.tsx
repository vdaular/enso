/** @file Catches errors in child components. */
import * as React from 'react'

import * as sentry from '@sentry/react'
import * as reactQuery from '@tanstack/react-query'
import * as errorBoundary from 'react-error-boundary'

import * as detect from 'enso-common/src/detect'

import * as offlineHooks from '#/hooks/offlineHooks'

import * as textProvider from '#/providers/TextProvider'

import * as ariaComponents from '#/components/AriaComponents'
import * as result from '#/components/Result'

import { useEventCallback } from '#/hooks/eventCallbackHooks'
import * as errorUtils from '#/utilities/error'

// =====================
// === ErrorBoundary ===
// =====================

/** Arguments for the {@link ErrorBoundaryProps.onBeforeFallbackShown} callback. */
export interface OnBeforeFallbackShownArgs {
  readonly error: unknown
  readonly resetErrorBoundary: () => void
  readonly resetQueries: () => void
}

/** Props for an {@link ErrorBoundary}. */
export interface ErrorBoundaryProps
  extends Readonly<React.PropsWithChildren>,
    Readonly<
      Pick<
        errorBoundary.ErrorBoundaryProps,
        'FallbackComponent' | 'onError' | 'onReset' | 'resetKeys'
      >
    > {
  /** Called before the fallback is shown. */
  readonly onBeforeFallbackShown?: (args: OnBeforeFallbackShownArgs) => void
  readonly title?: string
  readonly subtitle?: string
}

/**
 * Catches errors in child components
 * Shows a fallback UI when there is an error.
 * The error can also be logged to an error reporting service.
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  const {
    FallbackComponent = ErrorDisplay,
    onError = () => {},
    onReset = () => {},
    onBeforeFallbackShown = () => {},
    title,
    subtitle,
    ...rest
  } = props

  return (
    <reactQuery.QueryErrorResetBoundary>
      {({ reset }) => (
        <errorBoundary.ErrorBoundary
          FallbackComponent={(fallbackProps) => (
            <FallbackComponent
              {...fallbackProps}
              onBeforeFallbackShown={onBeforeFallbackShown}
              resetQueries={reset}
              title={title}
              subtitle={subtitle}
            />
          )}
          onError={(error, info) => {
            sentry.captureException(error, { extra: { info } })
            onError(error, info)
          }}
          onReset={(details) => {
            reset()
            onReset(details)
          }}
          {...rest}
        />
      )}
    </reactQuery.QueryErrorResetBoundary>
  )
}

/** Props for a {@link ErrorDisplay}. */
export interface ErrorDisplayProps extends errorBoundary.FallbackProps {
  readonly status?: result.ResultProps['status']
  readonly onBeforeFallbackShown?: (args: OnBeforeFallbackShownArgs) => void
  readonly resetQueries?: () => void
  readonly title?: string | undefined
  readonly subtitle?: string | undefined
  readonly error: unknown
}

/** Default fallback component to show when there is an error. */
export function ErrorDisplay(props: ErrorDisplayProps): React.JSX.Element {
  const { getText } = textProvider.useText()
  const { isOffline } = offlineHooks.useOffline()

  const {
    error,
    resetErrorBoundary,
    title = getText('somethingWentWrong'),
    subtitle = isOffline ? getText('offlineErrorMessage') : getText('arbitraryErrorSubtitle'),
    status = isOffline ? 'info' : 'error',
    onBeforeFallbackShown,
    resetQueries = () => {},
  } = props

  const message = errorUtils.getMessageOrToString(error)
  const stack = errorUtils.tryGetStack(error)

  onBeforeFallbackShown?.({ error, resetErrorBoundary, resetQueries })

  const onReset = useEventCallback(() => {
    resetErrorBoundary()
  })

  return (
    <result.Result className="h-full" status={status} title={title} subtitle={subtitle}>
      <ariaComponents.ButtonGroup align="center">
        <ariaComponents.Button
          variant="submit"
          size="small"
          rounded="full"
          className="w-24"
          onPress={onReset}
        >
          {getText('tryAgain')}
        </ariaComponents.Button>
      </ariaComponents.ButtonGroup>

      {detect.IS_DEV_MODE && stack != null && (
        <div className="mt-6">
          <ariaComponents.Separator className="my-2" />

          <ariaComponents.Text color="primary" variant="h1" className="text-start">
            {getText('developerInfo')}
          </ariaComponents.Text>

          <ariaComponents.Text color="danger" variant="body">
            {getText('errorColon')}
            {message}
          </ariaComponents.Text>

          <ariaComponents.Alert
            className="mx-auto mt-2 max-h-[80vh] max-w-screen-lg overflow-auto"
            variant="neutral"
          >
            <ariaComponents.Text
              elementType="pre"
              className="whitespace-pre-wrap text-left"
              color="primary"
              variant="body"
            >
              {stack}
            </ariaComponents.Text>
          </ariaComponents.Alert>
        </div>
      )}
    </result.Result>
  )
}

export { useErrorBoundary, withErrorBoundary } from 'react-error-boundary'
