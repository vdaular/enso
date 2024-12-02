/**
 * @file Utility functions for testing.
 *
 * **IMPORTANT**: This file is supposed to be used instead of `@testing-library/react`
 * It is used to provide a portal root and locale to all tests.
 */

import { Form, type FormProps, type TSchema } from '#/components/AriaComponents'
import UIProviders from '#/components/UIProviders'
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react'
import { type PropsWithChildren, type ReactElement } from 'react'

/**
 * A wrapper that passes through its children.
 */
function PassThroughWrapper({ children }: PropsWithChildren) {
  return children
}

/**
 * A wrapper that provides the {@link UIProviders} context.
 */
function UIProvidersWrapper({ children }: PropsWithChildren) {
  return (
    <UIProviders portalRoot={document.body} locale="en">
      {children}
    </UIProviders>
  )
}

/**
 * A wrapper that provides the {@link Form} context.
 */
function FormWrapper<Schema extends TSchema, SubmitResult = void>(
  props: FormProps<Schema, SubmitResult>,
) {
  return <Form {...props} />
}

/**
 * Custom render function for tests.
 */
function renderWithRoot(ui: ReactElement, options?: Omit<RenderOptions, 'queries'>): RenderResult {
  const { wrapper: Wrapper = PassThroughWrapper, ...rest } = options ?? {}

  return render(ui, {
    wrapper: ({ children }) => (
      <UIProvidersWrapper>
        <Wrapper>{children}</Wrapper>
      </UIProvidersWrapper>
    ),
    ...rest,
  })
}

/**
 * Adds a form wrapper to the component.
 */
function renderWithForm<Schema extends TSchema, SubmitResult = void>(
  ui: ReactElement,
  options: Omit<RenderOptions, 'queries' | 'wrapper'> & {
    formProps: FormProps<Schema, SubmitResult>
  },
): RenderResult {
  const { formProps, ...rest } = options

  return renderWithRoot(ui, {
    wrapper: ({ children }) => <FormWrapper {...formProps}>{children}</FormWrapper>,
    ...rest,
  })
}

/**
 * A custom renderHook function for tests.
 */
function renderHookWithRoot<Result, Props>(
  hook: (props: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'queries'>,
): RenderHookResult<Result, Props> {
  return renderHook(hook, { wrapper: UIProvidersWrapper, ...options })
}

/**
 * A custom renderHook function for tests that provides the {@link Form} context.
 */
function renderHookWithForm<Result, Props, Schema extends TSchema, SubmitResult = void>(
  hook: (props: Props) => Result,
  options: Omit<RenderHookOptions<Props>, 'queries' | 'wrapper'> & {
    formProps: FormProps<Schema, SubmitResult>
  },
): RenderHookResult<Result, Props> {
  const { formProps, ...rest } = options

  return renderHookWithRoot(hook, {
    wrapper: ({ children }) => <FormWrapper {...formProps}>{children}</FormWrapper>,
    ...rest,
  })
}

export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
// override render method
export {
  renderWithRoot as render,
  renderHookWithRoot as renderHook,
  renderHookWithForm,
  renderWithForm,
}
