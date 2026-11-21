// Shared helpers such as errorMessage() and form field errors run outside React hooks.
// The I18nBridge component registers the active translator here; without one (server
// code, unit tests) every message falls back to its English text.

type Translator = (key: string, values?: Record<string, string | number>) => string | undefined;

let translator: Translator | null = null;

export function setMessageTranslator(next: Translator | null) {
  translator = next;
}

export function localize(key: string, fallback: string, values?: Record<string, string | number>) {
  return translator?.(key, values) ?? fallback;
}

// Custom English messages from shared schemas and helpers, so a form shows them in the
// active language. Zod's built-in messages are switched with z.config() instead.
const KNOWN_MESSAGES: Record<string, string> = {
  "Password must be at least 12 characters": "known.passwordMin",
  "Password must be no more than 72 UTF-8 bytes": "known.passwordMax",
  "Pickup must be scheduled in the future": "known.pickupFuture",
  "From must be no later than To": "known.fromBeforeTo",
  "Enter your current password to change your email": "known.currentPassword",
  "Note must not exceed 1000 characters.": "known.noteMax",
  "Enter a valid local date and time": "known.invalidDateTime",
  "This local date/time does not exist. Choose another time.": "known.dateMissing",
  "Invalid date": "known.invalidDate",
  "Invalid filters": "known.invalidFilters",
  "Invalid date/time": "known.invalidDateTime",
  "Choose a JPG, PNG, or WebP image.": "known.photoType",
  "Choose an image smaller than 5 MB.": "known.photoSize",
  "This image could not be opened. Choose another photo.": "known.photoUnreadable",
  "Photo processing is unavailable. Please try another browser.": "known.photoUnsupported",
  "Choose a smaller photo.": "known.photoTooBig",
  "Could not load this photo.": "known.photoLoad",
  "The image could not be prepared": "known.imagePrepare",
  "This photo is too large. Take it again closer up.": "known.proofTooLarge",
  "The signature could not be prepared": "known.signaturePrepare",
  "Enter the recipient's name": "known.recipientName",
};

export function translateKnownMessage(message: string) {
  const key = KNOWN_MESSAGES[message];
  return key ? localize(key, message) : message;
}
