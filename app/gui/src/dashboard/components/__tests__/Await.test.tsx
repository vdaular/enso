import { act, render, screen } from '@testing-library/react'
import { describe, vi } from 'vitest'
import { Await } from '../Await'

describe('<Await />', (it) => {
  it('should the suspense boundary before promise is resolved, then show the children once promise is resolved', async ({
    expect,
  }) => {
    const promise = Promise.resolve('Hello')
    render(<Await promise={promise}>{(value) => <div>{value}</div>}</Await>)

    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
    expect(screen.getByTestId('spinner')).toBeInTheDocument()

    await act(() => promise)

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument()
  })

  // This test is SUPPOSED to throw an error,
  // Because the only way to test the error boundary is to throw an error during the render phase.
  // But currently, vitest fails when promise is rejected with ⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯ output,
  // and it causes the test to fail on CI.
  // We do not want to catch the error before we render the component,
  // because in that case, the error boundary will not be triggered.
  // This can be avoided by setting `dangerouslyIgnoreUnhandledErrors` to true in the vitest config,
  // but it's unsafe to do for all tests, and there's no way to do it for a single test.
  // We skip this test for now on CI, until we find a way to fix it.
  it.skipIf(process.env.CI)(
    'should show the fallback if the promise is rejected',
    async ({ expect }) => {
      // Suppress the error message from the console caused by React Error Boundary
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const promise = Promise.reject(new Error('💣'))

      render(<Await promise={promise}>{() => <>Hello</>}</Await>)

      expect(screen.getByTestId('spinner')).toBeInTheDocument()

      await act(() => promise.catch(() => {}))

      expect(screen.queryByText('Hello')).not.toBeInTheDocument()
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument()
      expect(screen.getByTestId('error-display')).toBeInTheDocument()
      // eslint-disable-next-line no-restricted-properties
      expect(console.error).toHaveBeenCalled()
    },
  )

  it('should not display the Suspense boundary of the second Await if the first Await already resolved', async ({
    expect,
  }) => {
    const promise = Promise.resolve('Hello')
    const { unmount } = render(<Await promise={promise}>{(value) => <div>{value}</div>}</Await>)

    await act(() => promise)

    expect(screen.getByText('Hello')).toBeInTheDocument()

    unmount()

    render(<Await promise={promise}>{(value) => <div>{value}</div>}</Await>)

    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
