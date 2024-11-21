/** @file A column listing the users with which this asset is shared. */
import * as React from 'react'

import type * as column from '#/components/dashboard/column'

/** A column listing the users with which this asset is shared. */
export default function DocsColumn(props: column.AssetColumnProps) {
  const { item } = props

  return (
    <div className="flex max-w-drive-docs-column items-center gap-column-items overflow-hidden whitespace-nowrap contain-strict [contain-intrinsic-size:37px] [content-visibility:auto]">
      {item.description}
    </div>
  )
}
