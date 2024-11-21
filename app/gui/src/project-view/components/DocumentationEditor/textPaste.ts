import { LINKABLE_URL_REGEX } from '@/util/link'

function uriEscapeChar(char: string) {
  return `%${char.codePointAt(0)!.toString(16).toUpperCase().padStart(2, '0')}`
}

function toAutoLink(text: string) {
  return `<${addProtocolIfMissing(text).replaceAll(/[\][<>*`]/g, uriEscapeChar)}>`
}

function addProtocolIfMissing(url: string) {
  return (URL.canParse(url) ? '' : 'https://') + url
}

/**
 * Return whether the input is likely to be a URL, possibly with the protocol omitted. This matches more aggressively
 * than {@link LINKABLE_URL_REGEX}, but rejects some inputs that would technically make valid URLs but are more likely
 * to be other text.
 */
function isReasonableUrl(text: string) {
  const textWithProto = addProtocolIfMissing(text)
  let textAsUrl: URL | undefined
  try {
    textAsUrl = new URL(textWithProto)
  } catch {
    return false
  }
  return textAsUrl.protocol.match(/https?:/) && textAsUrl.hostname.match(/\.[a-z]/)
}

/** Convert the input to Markdown. This includes converting any likely URLs to <autolink>s. */
export function transformPastedText(text: string): string {
  return isReasonableUrl(text) ? toAutoLink(text) : text.replaceAll(LINKABLE_URL_REGEX, toAutoLink)
}
