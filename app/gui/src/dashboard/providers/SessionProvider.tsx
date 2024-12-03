/**
 * @file Provider for the {@link SessionContextType}, which contains information about the
 * currently authenticated user's session.
 */
import * as React from 'react'

import * as reactQuery from '@tanstack/react-query'
import invariant from 'tiny-invariant'

import * as eventCallback from '#/hooks/eventCallbackHooks'

import * as httpClientProvider from '#/providers/HttpClientProvider'

import * as errorModule from '#/utilities/error'

import type * as cognito from '#/authentication/cognito'
import * as listen from '#/authentication/listen'
import { useToastAndLog } from '#/hooks/toastAndLogHooks'

// ======================
// === SessionContext ===
// ======================

/** State contained in a {@link SessionContext}. */
interface SessionContextType {
  readonly session: cognito.UserSession | null
  readonly sessionQueryKey: reactQuery.QueryKey
}

const SessionContext = React.createContext<SessionContextType | null>(null)

// =======================
// === SessionProvider ===
// =======================

/** Props for a {@link SessionProvider}. */
export interface SessionProviderProps {
  /**
   * The URL that the content of the app is served at, by Electron.
   *
   * This **must** be the actual page that the content is served at, otherwise the OAuth flow will
   * not work and will redirect the user to a blank page. If this is the correct URL, no redirect
   * will occur (which is the desired behaviour).
   *
   * The URL includes a scheme, hostname, and port (e.g., `http://localhost:8080`). The port is not
   * known ahead of time, since the content may be served on any free port. Thus, the URL is
   * obtained by reading the window location at the time that authentication is instantiated. This
   * is guaranteed to be the correct location, since authentication is instantiated when the content
   * is initially served.
   */
  readonly mainPageUrl: URL
  readonly registerAuthEventListener: listen.ListenFunction | null
  readonly userSession: (() => Promise<cognito.UserSession | null>) | null
  readonly saveAccessToken?: ((accessToken: cognito.UserSession) => void) | null
  readonly refreshUserSession: (() => Promise<cognito.UserSession | null>) | null
  readonly children: React.ReactNode | ((props: SessionContextType) => React.ReactNode)
}

/** Create a query for the user session. */
function createSessionQuery(userSession: (() => Promise<cognito.UserSession | null>) | null) {
  return reactQuery.queryOptions({
    queryKey: ['userSession'],
    queryFn: async () => {
      const session = (await userSession?.().catch(() => null)) ?? null
      return session
    },
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
  })
}

/** A React provider for the session of the authenticated user. */
export default function SessionProvider(props: SessionProviderProps) {
  const {
    mainPageUrl,
    children,
    userSession,
    registerAuthEventListener,
    refreshUserSession,
    saveAccessToken,
  } = props

  // stabilize the callback so that it doesn't change on every render
  const saveAccessTokenEventCallback = eventCallback.useEventCallback(
    (accessToken: cognito.UserSession) => saveAccessToken?.(accessToken),
  )

  const httpClient = httpClientProvider.useHttpClient()
  const queryClient = reactQuery.useQueryClient()
  const toastAndLog = useToastAndLog()

  const sessionQuery = createSessionQuery(userSession)

  const session = reactQuery.useSuspenseQuery(sessionQuery)

  const refreshUserSessionMutation = reactQuery.useMutation({
    mutationKey: ['refreshUserSession', { expireAt: session.data?.expireAt }],
    mutationFn: async () => refreshUserSession?.() ?? null,
    onSuccess: (data) => {
      if (data) {
        httpClient?.setSessionToken(data.accessToken)
      }
      return queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    },
    onError: (error) => {
      // Something went wrong with the refresh token, so we need to sign the user out.
      toastAndLog('sessionExpiredError', error)
      queryClient.setQueryData(sessionQuery.queryKey, null)
    },
  })

  if (session.data) {
    httpClient?.setSessionToken(session.data.accessToken)
  }

  // Register an effect that will listen for authentication events. When the event occurs, we
  // will refresh or clear the user's session, forcing a re-render of the page with the new
  // session.
  // For example, if a user clicks the "sign out" button, this will clear the user's session, which
  // means the login screen (which is a child of this provider) should render.
  React.useEffect(
    () =>
      registerAuthEventListener?.((event) => {
        switch (event) {
          case listen.AuthEvent.signIn:
          case listen.AuthEvent.signOut: {
            void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
            break
          }
          case listen.AuthEvent.customOAuthState:
          case listen.AuthEvent.cognitoHostedUi: {
            // AWS Amplify doesn't provide a way to set the redirect URL for the OAuth flow, so
            // we have to hack it by replacing the URL in the browser's history. This is done
            // because otherwise the user will be redirected to a URL like `enso://auth`, which
            // will not work.
            // See https://github.com/aws-amplify/amplify-js/issues/3391#issuecomment-756473970
            history.replaceState({}, '', mainPageUrl)
            void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
            break
          }
          default: {
            throw new errorModule.UnreachableCaseError(event)
          }
        }
      }),
    [registerAuthEventListener, mainPageUrl, queryClient, sessionQuery.queryKey],
  )

  React.useEffect(() => {
    if (session.data) {
      // Save access token so can it be reused by backend services
      saveAccessTokenEventCallback(session.data)
    }
  }, [session.data, saveAccessTokenEventCallback])

  const sessionContextValue = {
    session: session.data,
    sessionQueryKey: sessionQuery.queryKey,
  }

  return (
    <SessionContext.Provider value={sessionContextValue}>
      {session.data && (
        <SessionRefresher
          session={session.data}
          refreshUserSession={refreshUserSessionMutation.mutateAsync}
        />
      )}

      {typeof children === 'function' ? children(sessionContextValue) : children}
    </SessionContext.Provider>
  )
}

/** Props for a {@link SessionRefresher}. */
interface SessionRefresherProps {
  readonly session: cognito.UserSession
  readonly refreshUserSession: () => Promise<cognito.UserSession | null>
}

const TEN_SECONDS_MS = 10_000
const SIX_HOURS_MS = 21_600_000

/**
 * A component that will refresh the user's session at a given interval.
 */
function SessionRefresher(props: SessionRefresherProps) {
  const { refreshUserSession, session } = props

  reactQuery.useQuery({
    queryKey: ['refreshUserSession', { refreshToken: session.refreshToken }] as const,
    queryFn: () => refreshUserSession(),
    meta: { persist: false },
    networkMode: 'online',
    initialData: session,
    initialDataUpdatedAt: Date.now(),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchOnMount: 'always',
    refetchInterval: () => {
      const expireAt = session.expireAt

      const timeUntilRefresh =
        // If the session has not expired, we should refresh it when it is 5 minutes from expiring.
        // We use 1 second to ensure that we refresh even if the time is very close to expiring
        // and value won't be less than 0.
        Math.max(new Date(expireAt).getTime() - Date.now() - TEN_SECONDS_MS, TEN_SECONDS_MS)

      return timeUntilRefresh < SIX_HOURS_MS ? timeUntilRefresh : SIX_HOURS_MS
    },
  })

  return null
}

// ==================
// === useSession ===
// ==================

/**
 * React context hook returning the session of the authenticated user.
 * @throws {Error} when used outside a {@link SessionProvider}.
 */
export function useSession() {
  const context = React.useContext(SessionContext)

  invariant(context != null, '`useSession` can only be used inside an `<SessionProvider />`.')

  return context
}

/**
 * React context hook returning the session of the authenticated user.
 * @throws {invariant} if the session is not defined.
 */
export function useSessionStrict() {
  const { session, sessionQueryKey } = useSession()

  invariant(session != null, 'Session must be defined')

  return { session, sessionQueryKey } as const
}
