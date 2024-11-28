import type { Meta, StoryObj } from '@storybook/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useLayoutEffect, useRef } from 'react'
import { DialogTrigger } from 'react-aria-components'
import { Button } from '../Button'
import { Dialog, type DialogProps } from './Dialog'

type Story = StoryObj<DialogProps>

export default {
  title: 'AriaComponents/Dialog',
  component: Dialog,
  render: (args) => (
    <DialogTrigger defaultOpen>
      <Button>Open Dialog</Button>

      <Dialog {...args} />
    </DialogTrigger>
  ),
  args: {
    type: 'modal',
    title: 'Dialog Title',
    children: 'Dialog Content',
  },
} as Meta<DialogProps>

export const Default = {}

// Use a random query key to avoid caching
const QUERY_KEY = Math.random().toString()

function SuspenseContent({ delay = 10_000 }: { delay?: number }): React.ReactNode {
  useSuspenseQuery({
    queryKey: [QUERY_KEY],
    gcTime: 0,
    initialDataUpdatedAt: 0,
    queryFn: () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve('resolved')
        }, delay)
      }),
  })

  return (
    <div className="flex h-[250px] flex-col items-center justify-center text-center">
      Unsuspended content
    </div>
  )
}

export const Suspened = {
  args: {
    children: <SuspenseContent delay={10_000_000_000} />,
  },
}

function BrokenContent(): React.ReactNode {
  throw new Error('💣')
}

export const Broken = {
  args: {
    children: <BrokenContent />,
  },
}

function ResizableContent() {
  const divRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const getRandomHeight = () => Math.floor(Math.random() * 250 + 100)

    if (divRef.current) {
      divRef.current.style.height = `${getRandomHeight()}px`

      setInterval(() => {
        if (divRef.current) {
          divRef.current.style.height = `${getRandomHeight()}px`
        }
      }, 2_000)
    }
  }, [])

  return (
    <div ref={divRef} className="flex flex-none items-center justify-center text-center">
      This dialog should resize with animation
    </div>
  )
}

export const AnimateSize: Story = {
  args: {
    children: <ResizableContent />,
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
}

export const Fullscreen = {
  args: {
    type: 'fullscreen',
  },
}
