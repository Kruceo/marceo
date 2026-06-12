import Plugin from "./lib/Plugin"
import { anchor } from "./plugins/anchor"
import { bold } from "./plugins/bold"
import { codeBlock } from "./plugins/codeBlock"
import { dotlist } from "./plugins/dotlist"
import { header5, header4, header3, header2, header1 } from "./plugins/header"
import { image } from "./plugins/image"
import { inlineCode } from "./plugins/inlineCode"
import { italic, unItalic } from "./plugins/italic"
import { line, hyphenLine } from "./plugins/line"
import { quote } from "./plugins/quote"
import { scratched } from "./plugins/scratched"
import { task } from "./plugins/task"
import { markdownTable } from "./plugins/table"
import { closedHtml, html } from "./plugins/html"
import Parser from "./lib/Parser"

const defaultPlugins:Plugin[] = [
    codeBlock,
    closedHtml,
    header5,
    header4,
    header3,
    header2,
    header1,
    dotlist,
    anchor,
    bold,
    italic,
    line,
    hyphenLine,
    unItalic,
    markdownTable,
    image,
    quote,
    inlineCode,
    task,
    scratched,
]

const defaultParser = new Parser(defaultPlugins) 

export {Plugin,Parser,defaultPlugins,defaultParser}
