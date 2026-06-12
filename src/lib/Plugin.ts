import Match from "./Match"

interface HtmlHandler {
    (start: string, content: string, end: string): string;
}

interface identifiedMatch {
    complete: string,
    content: string,
    start: string,
    end: string,
    index: number,
    raw: string,
    rawStart: string,
    rawEnd: string,
    id: string,
    hiddenContent?: boolean
}

interface pluginOptions {
    hideContent: boolean
}

export default class Plugin {
    /**
     * Add's a new normalized function for the software;
     */
    matches: identifiedMatch[]
    start: RegExp
    content: RegExp
    end: RegExp
    name: string
    htmlHandle: HtmlHandler
    symbol: string
    options: pluginOptions;
    constructor(start: RegExp, content: RegExp, end: RegExp, name: string, htmlHandler: HtmlHandler, options?: pluginOptions) {
        this.options = { hideContent: false, ...options }
        this.matches = []
        this.start = start
        this.content = content
        this.end = end
        this.name = name
        this.htmlHandle = htmlHandler
        this.symbol = '@'
    }
    /**
     * Match the text and sinalize all to after replace then.
     */
    identifyText(text: string) {
        const matches = Match.getFromText(this.start, this.content, this.end, text)
        const identifiedMatches = matches.map((each, index): identifiedMatch => {
            const id = `${this.symbol}${this.name}-${index}${this.symbol}`
            return { complete: each.complete, content: each.content, start: each.start, end: each.end, index: each.index, raw: each.raw, rawStart: each.rawStart, rawEnd: each.rawEnd, id }
        })
        // Splice each match at the position it was found, back to front so
        // earlier indexes stay valid. Newlines stripped from start/end by the
        // match normalization are re-emitted outside the symbols — block
        // plugins rely on them to keep line boundaries intact.
        let newText = text
        for (let i = identifiedMatches.length - 1; i >= 0; i--) {
            const each = identifiedMatches[i]
            if (each.index < 0) continue
            const leading = each.rawStart.length > each.start.length ? "\n" : ""
            const trailing = each.rawEnd.length > each.end.length ? "\n" : ""
            const replacement = `${leading}${each.id}${this.options.hideContent ? "" : each.content}${each.id}${trailing}`
            newText = newText.slice(0, each.index) + replacement + newText.slice(each.index + each.raw.length)
        }
        this.matches = identifiedMatches
        return newText
    }
    /**
     * Replace pre-sinalized text with the plugin handler.
     */
    replaceSymbols(text: string) {
        let newText = text
        this.matches.forEach(each => {
            const regex = new RegExp(`${each.id}.*${each.id}`, 's')
            const match = newText.match(regex)
            // Unmatched symbols are an expected state with partial (streaming)
            // input — return silently instead of spamming the console.
            if (!match) return;

            const content = this.options.hideContent ? each.content : match[0].replaceAll(each.id, '')
            const htmlElement = this.htmlHandle(each.start,content,each.end)
            newText = newText.replace(regex, htmlElement)
        })
        return newText

    }
}