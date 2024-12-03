/**
 * @file
 * Component that passes the value of a field to its children.
 */
import { useDeferredValue, type ReactNode } from 'react'
import { useWatch } from 'react-hook-form'
import { useFormContext } from './FormProvider'
import type { FieldPath, FieldValues, FormInstanceValidated, TSchema } from './types'

/**
 * Props for the {@link FieldValue} component.
 */
export interface FieldValueProps<Schema extends TSchema, TFieldName extends FieldPath<Schema>> {
  readonly form?: FormInstanceValidated<Schema>
  readonly name: TFieldName
  readonly children: (value: FieldValues<Schema>[TFieldName]) => ReactNode
  readonly disabled?: boolean
}

/**
 * Component that subscribes to the value of a field.
 */
export function FieldValue<Schema extends TSchema, TFieldName extends FieldPath<Schema>>(
  props: FieldValueProps<Schema, TFieldName>,
) {
  const { form, name, children, disabled = false } = props

  const formInstance = useFormContext(form)
  const watchValue = useWatch({ control: formInstance.control, name, disabled })

  // We use deferred value here to rate limit the re-renders of the children.
  // This is useful when the children are expensive to render, such as a component tree.
  const deferredValue = useDeferredValue(watchValue)

  return children(deferredValue)
}
