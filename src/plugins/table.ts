import Plugin from "../lib/Plugin"

const SEPARATOR_CELL = /^ *:?-+:? *$/

function alignmentOf(cell: string) {
    const trimmed = cell.trim()
    const left = trimmed.startsWith(":")
    const right = trimmed.endsWith(":")
    if (left && right) return "align-center"
    if (right) return "align-right"
    if (left) return "align-left"
    return null
}

function splitRow(row: string) {
    const cells = row.split("|")
    // drop the chunks outside the outer pipes, keep internal empty cells
    return cells.slice(1, cells.length - 1)
}

function tableElement(first: string, content: string, last: string) {
    const total = first + content + last
    const rawRows = total.split("\n").filter(line => line.trim() != "").map(splitRow)

    const separatorIndex = rawRows.findIndex(row => row.length > 0 && row.every(cell => SEPARATOR_CELL.test(cell)))
    const alignments = separatorIndex >= 0 ? rawRows[separatorIndex].map(alignmentOf) : []

    // Without a separator row (e.g. partial streaming input) every row is body.
    const headerRows = separatorIndex >= 0 ? rawRows.slice(0, separatorIndex) : []
    const bodyRows = separatorIndex >= 0 ? rawRows.slice(separatorIndex + 1) : rawRows
    const rowCount = headerRows.length + bodyRows.length

    function cellHtml(value: string, columnIndex: number, rowIndex: number, row: string[], isHeader: boolean, bodyIndex: number) {
        const attributes = []
        if (columnIndex == 0) attributes.push("left")
        if (columnIndex == row.length - 1) attributes.push("right")
        if (rowIndex == 0) attributes.push("top")
        if (rowIndex == rowCount - 1) attributes.push("bottom")
        if (!isHeader && bodyIndex % 2 == 1) attributes.push("pair")
        if (isHeader) attributes.push("header")
        const alignment = alignments[columnIndex]
        if (alignment) attributes.push(alignment)
        const tag = isHeader ? "th" : "td"
        return `<${tag} class="markdown cel ${attributes.join(" ")}">${value}</${tag}>`
    }

    let head = ""
    headerRows.forEach((row, rowIndex) => {
        const cells = row.map((cell, columnIndex) => cellHtml(cell, columnIndex, rowIndex, row, true, -1)).join("")
        head += `<tr class="markdown row header">${cells}</tr>`
    })

    let body = ""
    bodyRows.forEach((row, bodyIndex) => {
        const cells = row.map((cell, columnIndex) => cellHtml(cell, columnIndex, headerRows.length + bodyIndex, row, false, bodyIndex)).join("")
        body += `<tr class="markdown row">${cells}</tr>`
    })

    const headHtml = head ? `<thead>${head}</thead>` : ""
    const bodyHtml = body ? `<tbody>${body}</tbody>` : ""
    return `<table class="markdown table">${headHtml}${bodyHtml}</table>`
}

// The content regex is linear on purpose: "rest of the first row ending in |,
// next line starting with |, then lazily up to the closing |". The previous
// form ((.+\|\n\|.+)+?) had a nested quantifier that backtracked
// catastrophically on partial (streaming) tables.
export const markdownTable = new Plugin(/(?<!\|)\n\|/, /[^\n]*\|\n\|[\s\S]*?/, /\|\n(?!\|)/, 'table', tableElement)
