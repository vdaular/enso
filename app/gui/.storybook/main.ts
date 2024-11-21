/**
 * @file
 *
 * Main file for Storybook configuration.
 */
import type { StorybookConfig as ReactStorybookConfig } from '@storybook/react-vite'
import type { StorybookConfig as VueStorybookConfig } from '@storybook/vue3-vite'
import z from 'zod'

const framework = z.enum(['vue', 'react']).parse(process.env.FRAMEWORK)

const sharedConfig: Partial<ReactStorybookConfig> = {
  addons: [
    '@storybook/addon-onboarding',
    '@storybook/addon-essentials',
    '@chromatic-com/storybook',
    '@storybook/addon-interactions',
  ],
  features: {},
  core: { disableTelemetry: true },
  env: { FRAMEWORK: framework },

  previewHead: (head) => {
    return `
    <script>
      window.global = window;
      window.ENV = {
        FRAMEWORK: '${framework}',
      }
    </script>
    ${head}
    `
  },
}

const vueConfig: VueStorybookConfig = {
  ...sharedConfig,
  stories: [
    '../src/project-view/**/*.mdx',
    '../src/project-view/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  refs: {
    Dashboard: {
      title: 'Dashboard',
      url: 'http://localhost:6007',
    },
  },
}

const reactConfig: ReactStorybookConfig = {
  ...sharedConfig,
  stories: ['../src/dashboard/**/*.mdx', '../src/dashboard/**/*.stories.tsx'],
  framework: {
    name: '@storybook/react-vite',
    options: { strictMode: true },
  },
}

export default framework === 'vue' ? vueConfig : reactConfig
