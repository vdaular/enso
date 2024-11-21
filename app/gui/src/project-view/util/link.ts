/**
 * Heuristic that matches strings suitable to be automatically interpreted as links. Recognizes absolute URLs with
 * `http` and `https` protocols, and some protocol-less strings that are likely to be URLs.
 */
export const LINKABLE_URL_REGEX =
  /(?:https?:\/\/(?:www\.)?|www\.)[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/g

/** Heuristic that matches strings suitable to be automatically interpreted as email addresses. */
export const LINKABLE_EMAIL_REGEX =
  /(?:[^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*|(".+"))@(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}]|(?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,})/g
