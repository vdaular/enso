/** @file A heading for the "Labels" column. */
import TagIcon from '#/assets/tag.svg'
import { Button, Text } from '#/components/AriaComponents'
import type { AssetColumnHeadingProps } from '#/components/dashboard/column'
import { Column } from '#/components/dashboard/column/columnUtils'
import { useEventCallback } from '#/hooks/eventCallbackHooks'
import { useText } from '#/providers/TextProvider'

/** A heading for the "Labels" column. */
export default function LabelsColumnHeading(props: AssetColumnHeadingProps) {
  const { hideColumn } = props

  const { getText } = useText()

  const hideThisColumn = useEventCallback(() => {
    hideColumn(Column.labels)
  })

  return (
    <div className="flex h-table-row w-full items-center gap-icon-with-text">
      <Button
        variant="icon"
        icon={TagIcon}
        aria-label={getText('labelsColumnHide')}
        tooltip={false}
        onPress={hideThisColumn}
      />
      <Text className="fond-semibold text-sm">{getText('labelsColumnName')}</Text>
    </div>
  )
}
