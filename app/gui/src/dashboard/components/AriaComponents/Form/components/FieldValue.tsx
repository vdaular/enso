/**
 * @file
 *
 * Component that passes the value of a field to its children.
 */
import { useWatch } from 'react-hook-form'
import { useFormContext } from './FormProvider'
import type { FieldPath, FieldValues, FormInstanceValidated, TSchema } from './types'

/**
 *
 */
export interface FieldValueProps<Schema extends TSchema, TFieldName extends FieldPath<Schema>> {
  readonly form?: FormInstanceValidated<Schema>
  readonly name: TFieldName
  readonly children: (value: FieldValues<Schema>[TFieldName]) => React.ReactNode
}

/**
 * Component that passes the value of a field to its children.
 */
export function FieldValue<Schema extends TSchema, TFieldName extends FieldPath<Schema>>(
  props: FieldValueProps<Schema, TFieldName>,
) {
  const { form, name, children } = props

  const formInstance = useFormContext(form)
  const value = useWatch({ control: formInstance.control, name })

  return <>{children(value)}</>
}
