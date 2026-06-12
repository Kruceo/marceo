import Plugin from "../lib/Plugin"

const lineElement = () => `<div class="markdown line"></div>`

export const line = new Plugin(/(?<=\n)_/, /(_)+/, /_(?=\n)/, 'line    ', lineElement)
// `---` is the horizontal-rule form most tools (and LLMs) emit. Trailing
// spaces are allowed, as in CommonMark. Table separator rows start with `|`,
// so they never reach this plugin.
export const hyphenLine = new Plugin(/(?<=\n)-/, /(-)+/, /- *(?=\n)/, 'hline', lineElement)
