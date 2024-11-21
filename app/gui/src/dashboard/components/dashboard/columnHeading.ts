/** @file A lookup containing a component for the corresponding heading for each column type. */
import type * as column from '#/components/dashboard/column'
import * as columnUtils from '#/components/dashboard/column/columnUtils'
import AccessedByProjectsColumnHeading from '#/components/dashboard/columnHeading/AccessedByProjectsColumnHeading'
import AccessedDataColumnHeading from '#/components/dashboard/columnHeading/AccessedDataColumnHeading'
import DocsColumnHeading from '#/components/dashboard/columnHeading/DocsColumnHeading'
import LabelsColumnHeading from '#/components/dashboard/columnHeading/LabelsColumnHeading'
import ModifiedColumnHeading from '#/components/dashboard/columnHeading/ModifiedColumnHeading'
import NameColumnHeading from '#/components/dashboard/columnHeading/NameColumnHeading'
import SharedWithColumnHeading from '#/components/dashboard/columnHeading/SharedWithColumnHeading'
import { memo } from 'react'

export const COLUMN_HEADING: Readonly<
  Record<
    columnUtils.Column,
    React.MemoExoticComponent<(props: column.AssetColumnHeadingProps) => React.JSX.Element>
  >
> = {
  [columnUtils.Column.name]: memo(NameColumnHeading),
  [columnUtils.Column.modified]: memo(ModifiedColumnHeading),
  [columnUtils.Column.sharedWith]: memo(SharedWithColumnHeading),
  [columnUtils.Column.labels]: memo(LabelsColumnHeading),
  [columnUtils.Column.accessedByProjects]: memo(AccessedByProjectsColumnHeading),
  [columnUtils.Column.accessedData]: memo(AccessedDataColumnHeading),
  [columnUtils.Column.docs]: memo(DocsColumnHeading),
}
