/** @file Rendering for a settings section. */
import { Text } from '#/components/AriaComponents'
import { useText } from '#/providers/TextProvider'
import { memo } from 'react'
import type { SettingsContext, SettingsSectionData } from './data'
import SettingsEntry from './Entry'

// =======================
// === SettingsSection ===
// =======================

/** Props for a {@link SettingsSection}. */
export interface SettingsSectionProps {
  readonly context: SettingsContext
  readonly data: SettingsSectionData
}

/** Rendering for a settings section. */
function SettingsSection(props: SettingsSectionProps) {
  const { context, data } = props
  const { nameId, heading = true, entries } = data
  const { getText } = useText()
  const isVisible = entries.some((entry) =>
    'getVisible' in entry ? entry.getVisible(context) : true,
  )

  if (!isVisible) {
    return null
  }

  return (
    <div className="flex w-full flex-col gap-2.5">
      {!heading ? null : (
        <Text.Heading level={2} weight="bold">
          {getText(nameId)}
        </Text.Heading>
      )}

      <div className="flex flex-col gap-2">
        {entries.map((entry, i) => (
          <SettingsEntry key={i} context={context} data={entry} />
        ))}
      </div>
    </div>
  )
}

export default memo(SettingsSection)
