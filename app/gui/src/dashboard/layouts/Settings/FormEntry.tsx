/** @file Rendering for an {@link SettingsFormEntryData}. */
import { ButtonGroup, Form } from '#/components/AriaComponents'
import { useText } from '#/providers/TextProvider'
import { useEffect, useMemo, useRef, useState } from 'react'
import SettingsInput from './Input'
import type { SettingsContext, SettingsFormEntryData } from './data'

// =========================
// === SettingsFormEntry ===
// =========================

/** Props for a {@link SettingsFormEntry}. */
export interface SettingsFormEntryProps<T extends Record<keyof T, string>> {
  readonly context: SettingsContext
  readonly data: SettingsFormEntryData<T>
}

/** Rendering for an {@link SettingsFormEntryData}. */
export function SettingsFormEntry<T extends Record<keyof T, string>>(
  props: SettingsFormEntryProps<T>,
) {
  const { context, data } = props
  const { schema: schemaRaw, getValue, inputs, onSubmit, getVisible } = data
  const { getText } = useText()
  const visible = getVisible?.(context) ?? true
  const value = getValue(context)
  const [initialValueString] = useState(() => JSON.stringify(value))
  const valueStringRef = useRef(initialValueString)
  const schema = useMemo(
    () => (typeof schemaRaw === 'function' ? schemaRaw(context) : schemaRaw),
    [context, schemaRaw],
  )

  const form = Form.useForm({
    // @ts-expect-error This is SAFE, as the type `T` is statically known.
    schema,
    defaultValues: value,
    onSubmit: async (newValue) => {
      // @ts-expect-error This is SAFE, as the type `T` is statically known.
      await onSubmit(context, newValue)
      form.reset(newValue)
      // The form should not be reset on error.
    },
  })

  useEffect(() => {
    const newValueString = JSON.stringify(value)
    if (newValueString !== valueStringRef.current) {
      form.reset(value)
      valueStringRef.current = newValueString
    }
  }, [form, value])

  return !visible ? null : (
      <Form form={form} gap="none">
        {inputs.map((input) => (
          <SettingsInput key={input.name} context={context} data={input} />
        ))}
        <ButtonGroup>
          <Form.Submit isDisabled={!form.formState.isDirty}>{getText('save')}</Form.Submit>
          <Form.Reset>{getText('cancel')}</Form.Reset>
        </ButtonGroup>
        <Form.FormError />
      </Form>
    )
}
