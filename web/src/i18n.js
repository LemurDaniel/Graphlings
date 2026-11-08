// NOTE:
//   The language of the page: German or English, picked once when the page loads.
//   Every text the user sees comes from texts.js through t(); switching the language
//   saves the choice and reloads the page, because the cards are plain data built at load.
//
//   import { LANGUAGE, t } from './i18n.js'
//   t('card.agent.kind')                       // 'Agent · fragt das Modell' or 'Agent · asks the model'
//   t('card.summarize.chip.keep', { count: 6 })  // '{count}' in the text is filled in
//
//   Order of precedence for the language:
//   - GRAPHLINGS_LANGUAGE in the environment (Node, for the tests)
//   - localStorage 'graphlings.language' (the switch in the header)
//   - the browser language, German when it starts with 'de'
//   - English
//

import { TEXTS } from './texts.js'

export const LANGUAGE_KEY = 'graphlings.language'
export const LANGUAGES = ['de', 'en']

// The texts are plain data, so a missing key is a bug and not a user error: fail loudly.
export const LANGUAGE = detectLanguage()

function detectLanguage() {
    const candidates = [
        globalThis.process?.env?.GRAPHLINGS_LANGUAGE,          // environment
        readStoredLanguage(),                                   // localStorage
        globalThis.navigator?.language?.startsWith('de') ? 'de' : null,   // browser language
        'en',                                                   // default
    ]
    return candidates.find(candidate => LANGUAGES.includes(candidate))
}

function readStoredLanguage() {
    // Only in a browser: Node has an experimental localStorage that warns when touched.
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage.getItem(LANGUAGE_KEY)
    } catch {
        return null
    }
}

/**
 * The text of a key in the current language, with '{name}' placeholders filled in.
 *
 * @param {string} key              (Required) A key of texts.js, e.g. 'card.agent.kind'.
 * @param {object} [values={}]      (Optional) Values for the placeholders, e.g. { count: 6 }.
 * @returns {string} The text.
 *
 * @example
 * t('card.summarize.chip.keep', { count: 6 })   // '📦 behält 6'
 */
export function t(key, values = {}) {
    const entry = TEXTS[key]
    if (null == entry) throw new Error(`Missing text '${key}' in texts.js`)
    const template = entry[LANGUAGE] ?? entry.en
    return template.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match))
}
