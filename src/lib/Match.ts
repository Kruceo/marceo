import { removeLookahead } from "./util"

export default class Match {
    content: string
    start: string
    end: string
    /** Position of the raw match in the source text. */
    index: number
    /** Raw matched slice of the source text, before start/end newline normalization. */
    raw: string
    /** Start segment as matched, before the newline strip. */
    rawStart: string
    /** End segment as matched, before the newline strip. */
    rawEnd: string
    constructor(start: string, content: string, end: string, index: number = -1, raw?: string, rawStart?: string, rawEnd?: string) {
        this.content = content
        this.end = end
        this.start = start
        this.index = index
        this.raw = raw ?? `${start}${content}${end}`
        this.rawStart = rawStart ?? start
        this.rawEnd = rawEnd ?? end
    }

    get complete() {
        return `${this.start}${this.content}${this.end}`
    }
    /**
     * Gets a collection of matchs, normalized with start, content and end.
     */
    static getFromText(initRegExp: RegExp, contentRegExp: RegExp, endRegExp: RegExp, text: string) {
        let flags = "g"
        const allflags = [...initRegExp.flags.split(""), ...contentRegExp.flags.split(""), ...endRegExp.flags.split("")]
        allflags.forEach(each => { if (!flags.includes(each)) flags += each })

        const fullR = new RegExp(`(${initRegExp.source})(${contentRegExp.source})(${endRegExp.source})`, flags)
        const startR = new RegExp(`^(${initRegExp.source})`)
        const endR = new RegExp(`${endRegExp.source}$`)

        const convertedMatches: Match[] = []

        for (const matched of text.matchAll(fullR)) {
            const each = matched[0]
            const index = matched.index ?? -1
            const s = each.match(removeLookahead(startR, true))
            const e = each.match(removeLookahead(endR, true))
            if (!s || !e || typeof (s.index) != "number" || typeof (e.index) != "number") {
                //|_> Returns only content
                convertedMatches.push(new Match('', each, '', index, each))
                continue
            }

            const c = each.slice(s.index + s[0].length, e.index)
            convertedMatches.push(new Match(
                s[0].replace('\n', ''),
                c,
                e[0].replace('\n', ''),
                index,
                each,
                s[0],
                e[0]))
        }
        return convertedMatches
    }
}
