/**
 * @file Storybook preview
 */
import type { Preview as ReactPreview } from '@storybook/react'
import type { Preview as VuePreview } from '@storybook/vue3'
import isChromatic from 'chromatic/isChromatic'
import { useLayoutEffect, useState } from 'react'

import invariant from 'tiny-invariant'
import UIProviders from '../src/dashboard/components/UIProviders'

import { MotionGlobalConfig } from 'framer-motion'
import z from 'zod'
import '../src/dashboard/tailwind.css'

if (isChromatic()) {
  MotionGlobalConfig.skipAnimations = true
  document.documentElement.classList.add('disable-animations')
}

const framework = z.enum(['vue', 'react']).parse(window.ENV.FRAMEWORK)

const vuePreview: VuePreview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}

const reactPreview: ReactPreview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  // Decorators for all stories
  // Decorators are applied in the reverse order they are defined
  decorators: [
    (Story, context) => {
      const [portalRoot, setPortalRoot] = useState<Element | null>(null)

      useLayoutEffect(() => {
        const portalRoot = document.querySelector('#enso-portal-root')
        invariant(portalRoot, 'PortalRoot element not found')

        setPortalRoot(portalRoot)
      }, [])

      if (!portalRoot) return <></>

      return (
        <UIProviders locale="en-US" portalRoot={portalRoot}>
          {Story(context)}
        </UIProviders>
      )
    },

    (Story, context) => (
      <>
        <div className="enso-dashboard">{Story(context)}</div>
        <div id="enso-portal-root" className="enso-portal-root" />
      </>
    ),
  ],
}

const preview = framework === 'vue' ? vuePreview : reactPreview

export default preview
