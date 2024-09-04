/** @file Modal for accepting the terms of service. */
import { useId } from 'react'

import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { Outlet } from 'react-router'
import * as z from 'zod'

import { Input } from '#/components/aria'
import { Button, Dialog, Form, Text } from '#/components/AriaComponents'
import { useAuth } from '#/providers/AuthProvider'
import { useLocalStorage } from '#/providers/LocalStorageProvider'
import { useText } from '#/providers/TextProvider'
import LocalStorage from '#/utilities/LocalStorage'
import { omit } from '#/utilities/object'
import { twMerge } from '#/utilities/tailwindMerge'

// =================
// === Constants ===
// =================

const TEN_MINUTES_MS = 600_000
const TOS_SCHEMA = z.object({ versionHash: z.string() })
const PRIVACY_POLICY_SCHEMA = z.object({ versionHash: z.string() })
const TOS_ENDPOINT_SCHEMA = z.object({ hash: z.string() })
const PRIVACY_POLICY_ENDPOINT_SCHEMA = z.object({ hash: z.string() })

export const latestTermsOfServiceQueryOptions = queryOptions({
  queryKey: ['termsOfService', 'currentVersion'],
  queryFn: async () => {
    const response = await fetch(new URL('/eula.json', process.env.ENSO_CLOUD_ENSO_HOST))
    if (!response.ok) {
      throw new Error('Failed to fetch Terms of Service')
    } else {
      return TOS_ENDPOINT_SCHEMA.parse(await response.json())
    }
  },
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: true,
  refetchInterval: TEN_MINUTES_MS,
})

export const latestPrivacyPolicyQueryOptions = queryOptions({
  queryKey: ['privacyPolicy', 'currentVersion'],
  queryFn: async () => {
    const response = await fetch(new URL('/privacy.json', process.env.ENSO_CLOUD_ENSO_HOST))
    if (!response.ok) {
      throw new Error('Failed to fetch Privacy Policy')
    } else {
      return PRIVACY_POLICY_ENDPOINT_SCHEMA.parse(await response.json())
    }
  },
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: true,
  refetchInterval: TEN_MINUTES_MS,
})

// ============================
// === Global configuration ===
// ============================

declare module '#/utilities/LocalStorage' {
  /** Metadata containing the version hash of the terms of service that the user has accepted. */
  interface LocalStorageData {
    readonly termsOfService: z.infer<typeof TOS_SCHEMA>
    readonly privacyPolicy: z.infer<typeof PRIVACY_POLICY_SCHEMA>
  }
}

LocalStorage.registerKey('termsOfService', { schema: TOS_SCHEMA })
LocalStorage.registerKey('privacyPolicy', { schema: PRIVACY_POLICY_SCHEMA })

// =======================
// === AgreementsModal ===
// =======================

/** Modal for accepting the terms of service. */
export function AgreementsModal() {
  const { getText } = useText()
  const { localStorage } = useLocalStorage()
  const checkboxId = useId()
  const { session } = useAuth()

  const cachedTosHash = localStorage.get('termsOfService')?.versionHash
  const { data: tosHash } = useSuspenseQuery({
    ...latestTermsOfServiceQueryOptions,
    // If the user has already accepted the EULA, we don't need to
    // block user interaction with the app while we fetch the latest version.
    // We can use the local version hash as the initial data.
    // and refetch in the background to check for updates.
    ...(cachedTosHash != null && {
      initialData: { hash: cachedTosHash },
    }),
    select: (data) => data.hash,
  })
  const cachedPrivacyPolicyHash = localStorage.get('privacyPolicy')?.versionHash
  const { data: privacyPolicyHash } = useSuspenseQuery({
    ...latestPrivacyPolicyQueryOptions,
    ...(cachedPrivacyPolicyHash != null && {
      initialData: { hash: cachedPrivacyPolicyHash },
    }),
    select: (data) => data.hash,
  })

  const isLatest = tosHash === cachedTosHash && privacyPolicyHash === cachedPrivacyPolicyHash
  const isAccepted = cachedTosHash != null
  const shouldDisplay = !(isAccepted && isLatest)

  const formSchema = Form.useFormSchema((schema) =>
    schema.object({
      // The user must agree to the ToS to proceed.
      agreedToTos: schema
        .boolean()
        // The user must agree to the ToS to proceed.
        .refine((value) => value, getText('licenseAgreementCheckboxError')),
      agreedToPrivacyPolicy: schema
        .boolean()
        .refine((value) => value, getText('privacyPolicyCheckboxError')),
    }),
  )

  if (shouldDisplay) {
    // Note that this produces warnings about missing a `<Heading slot="title">`, even though
    // all `ariaComponents.Dialog`s contain one. This is likely caused by Suspense discarding
    // renders, and so it does not seem to be fixable.
    return (
      <Dialog
        title={getText('licenseAgreementTitle')}
        isKeyboardDismissDisabled
        isDismissable={false}
        hideCloseButton
        modalProps={{ defaultOpen: true }}
        testId="agreements-modal"
        id="agreements-modal"
      >
        <Form
          schema={formSchema}
          defaultValues={{
            agreedToTos: tosHash === cachedTosHash,
            agreedToPrivacyPolicy: privacyPolicyHash === cachedPrivacyPolicyHash,
          }}
          testId="agreements-form"
          method="dialog"
          onSubmit={() => {
            localStorage.set('termsOfService', { versionHash: tosHash })
            localStorage.set('privacyPolicy', { versionHash: privacyPolicyHash })
          }}
        >
          {({ register }) => (
            <>
              <Text>{getText('someAgreementsHaveBeenUpdated')}</Text>

              <Form.Field name="agreedToTos">
                {({ isInvalid }) => (
                  <>
                    <div className="flex w-full items-center gap-1">
                      <Input
                        type="checkbox"
                        className={twMerge(
                          'flex size-4 cursor-pointer overflow-clip rounded-lg border border-primary outline-primary focus-visible:outline focus-visible:outline-2',
                          isInvalid && 'border-red-700 text-red-500 outline-red-500',
                        )}
                        id={checkboxId}
                        data-testid="terms-of-service-checkbox"
                        {...omit(register('agreedToTos'), 'isInvalid')}
                      />

                      <label htmlFor={checkboxId}>
                        <Text>{getText('licenseAgreementCheckbox')}</Text>
                      </label>
                    </div>

                    <Button variant="link" target="_blank" href="https://ensoanalytics.com/eula">
                      {getText('viewLicenseAgreement')}
                    </Button>
                  </>
                )}
              </Form.Field>

              <Form.Field name="agreedToPrivacyPolicy">
                {({ isInvalid }) => (
                  <>
                    <label className="flex w-full items-center gap-1">
                      <Input
                        type="checkbox"
                        className={twMerge(
                          'flex size-4 cursor-pointer overflow-clip rounded-lg border border-primary outline-primary focus-visible:outline focus-visible:outline-2',
                          isInvalid && 'border-red-700 text-red-500 outline-red-500',
                        )}
                        data-testid="privacy-policy-checkbox"
                        {...omit(register('agreedToPrivacyPolicy'), 'isInvalid')}
                      />

                      <Text>{getText('privacyPolicyCheckbox')}</Text>
                    </label>

                    <Button variant="link" target="_blank" href="https://ensoanalytics.com/privacy">
                      {getText('viewPrivacyPolicy')}
                    </Button>
                  </>
                )}
              </Form.Field>

              <Form.FormError />

              <Form.Submit fullWidth>{getText('accept')}</Form.Submit>
            </>
          )}
        </Form>
      </Dialog>
    )
  } else {
    return <Outlet context={session} />
  }
}