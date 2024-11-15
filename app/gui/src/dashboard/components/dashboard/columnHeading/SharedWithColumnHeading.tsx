/** @file A heading for the "Shared with" column. */
import PeopleIcon from '#/assets/people.svg'
import { Button, Text } from '#/components/AriaComponents'
import type { AssetColumnHeadingProps } from '#/components/dashboard/column'
import { Column } from '#/components/dashboard/column/columnUtils'
import { PaywallDialogButton } from '#/components/Paywall'
import { usePaywall } from '#/hooks/billing'
import { useEventCallback } from '#/hooks/eventCallbackHooks'
import { useFullUserSession } from '#/providers/AuthProvider'
import { useText } from '#/providers/TextProvider'

/** A heading for the "Shared with" column. */
export default function SharedWithColumnHeading(props: AssetColumnHeadingProps) {
  const { hideColumn, category } = props

  const { getText } = useText()
  const { user } = useFullUserSession()
  const { isFeatureUnderPaywall } = usePaywall({ plan: user.plan })

  const hideThisColumn = useEventCallback(() => {
    hideColumn(Column.sharedWith)
  })

  const isUnderPaywall = isFeatureUnderPaywall('share')

  return (
    <div className="flex h-table-row w-full items-center gap-icon-with-text">
      <Button
        variant="icon"
        icon={PeopleIcon}
        aria-label={getText('sharedWithColumnHide')}
        tooltip={false}
        onPress={hideThisColumn}
      />

      <div className="flex items-center gap-1">
        <Text className="text-sm font-semibold">
          {category.type === 'trash' ?
            getText('rootFolderColumnName')
          : getText('sharedWithColumnName')}
        </Text>

        {isUnderPaywall && (
          <PaywallDialogButton feature="share" variant="icon" children={false} size="medium" />
        )}
      </div>
    </div>
  )
}
