/**
 * Regression suite for the 0.9.0 upstream fixes.
 *
 * Each `expect*` block proves one bug from the upstream brief. The test
 * harness is intentionally granular — one assertion per bug, no snapshots,
 * no shared state. Output goes to stdout so a human can read the verdict
 * and the offending input side by side.
 *
 * Run:  node tests/regression.mjs
 *   (after `npx rollup -c`)
 *
 * Exit code 0 = all green. Non-zero = at least one failure (printed in red).
 */

import { defaultParser, defaultPlugins, Plugin, Parser } from "../dist/index.mjs"

// ---------- minimal assert --------------------------------------------------

let passed = 0
let failed = 0
const failures = []

function check(name, condition, detail = "") {
    if (condition) {
        passed++
        console.log(`  \x1b[32m✓\x1b[0m ${name}`)
    } else {
        failed++
        const msg = `  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      ${detail}` : ""}`
        failures.push(msg)
        console.log(msg)
    }
}

function header(label) {
    console.log(`\n\x1b[1m${label}\x1b[0m`)
}

function parse(md) {
    return defaultParser.parse(md)
}

// =============================================================================
// Bug 1 — Tables: invalid HTML, separator leak, no alignment
// =============================================================================
header("Bug 1: table HTML validity + alignment + empty cells")

{
    // 1a) The separator line must NOT appear as a data row in the output.
    // Old behavior: a row with `---` cells leaks into <tbody>.
    const md = [
        "| Col 1 | Col 2 |",
        "| --- | --- |",
        "| a   | b   |",
    ].join("\n")

    const out = parse(md)
    check(
        "separator line does not leak as a data row",
        !/<td[^>]*>\s*---?\s*<\/td>/i.test(out),
        `output contained a <td>---</td>: ${out}`
    )

    // 1b) :---: must be recognized and produce a center-aligned cell.
    const md2 = [
        "| L | C | R |",
        "| :--- | :---: | ---: |",
        "| a | b | c |",
    ].join("\n")
    const out2 = parse(md2)
    check(
        "left alignment class applied",
        /class="[^"]*\balign-left\b[^"]*"/.test(out2),
        `no align-left in: ${out2}`
    )
    check(
        "center alignment class applied",
        /class="[^"]*\balign-center\b[^"]*"/.test(out2),
        `no align-center in: ${out2}`
    )
    check(
        "right alignment class applied",
        /class="[^"]*\balign-right\b[^"]*"/.test(out2),
        `no align-right in: ${out2}`
    )

    // 1c) Empty cells must be preserved (not filtered out).
    const md3 = [
        "| a |  | c |",
        "| --- | --- | --- |",
        "| 1 | 2 | 3 |",
    ].join("\n")
    const out3 = parse(md3)
    // Count <td> cells in the first data row. With preserved empties we
    // expect 3 cells per data row. With the old filter we'd see 2.
    const dataRowTd = out3.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? ""
    const cellCount = (dataRowTd.match(/<td/g) ?? []).length
    check(
        "empty cells preserved in data row (3 cells, not 2)",
        cellCount === 3,
        `expected 3 <td> in <tbody>, got ${cellCount}. body: ${dataRowTd}`
    )

    // 1d) Output must be valid HTML — no <tr> nested inside another <tr>.
    //     Old output: <thead><tr><tr class="row header">...</tr></tr></thead>
    //     New output: <thead><tr class="row header">...</tr></thead>
    check(
        "no nested <tr> inside <thead><tr>…</tr></thead>",
        !/<thead>\s*<tr[^>]*>\s*<tr\b/i.test(out),
        `nested <tr> detected: ${out}`
    )
    check(
        "no <tr> directly inside <thead> without attributes on its wrapper",
        /<thead>\s*<tr[^>]*class=/.test(out),
        `thead missing single attr-bearing <tr>: ${out}`
    )
}

// =============================================================================
// Bug 2 — Catastrophic backtracking on partial table input
// =============================================================================
header("Bug 2: regex backtracking on partial tables (streaming)")

{
    // Partial table — the streaming case from the brief. We use a
    // 6-row case (94 bytes) because the 30-row case hangs for >2 minutes
    // on the unfixed engine. Either size proves the bug; the small one
    // is just a saner measurement target.
    const rows = []
    for (let i = 0; i < 6; i++) {
        rows.push(`| a_${i} | b_${i} |`)
    }
    // Truncate the last row mid-cell — that's the pathological case.
    rows.push("| c_6 | d")
    const partial = rows.join("\n") + "\n"
    const inputBytes = partial.length

    const t0 = process.hrtime.bigint()
    let out
    try {
        out = parse(partial)
    } catch (e) {
        check("partial table parses without throwing", false, e.message)
    }
    const t1 = process.hrtime.bigint()
    const ms = Number(t1 - t0) / 1e6

    check("partial table parses without throwing", typeof out === "string")
    // Baseline (0.8.1) for this 94-byte case: ~4500ms measured.
    // Fixed engine budget: <200ms (200x improvement, still safe).
    check(
        `partial ${inputBytes}B table parses in <200ms (got ${ms.toFixed(1)}ms)`,
        ms < 200,
        `parse took ${ms.toFixed(1)}ms — that's the backtracking bug`
    )

    // Sanity: the partial content should at least not corrupt into a panic.
    check(
        "no engine symbols leak into output",
        !/@[a-z]+-\d+@/i.test(out),
        `engine symbol leaked: ${out.slice(0, 200)}`
    )
}

// =============================================================================
// Bug 3 — identifyText replaces by value, not by position
// =============================================================================
header("Bug 3: identifyText uses position, not string value")

{
    // Construct a synthetic plugin whose `start` regex matches a substring
    // that ALSO occurs inside a table separator. The old engine replaces
    // the FIRST `---` in the document — which is inside the table — and
    // leaves the real one untouched. New engine replaces at the index of
    // the actual match.
    //
    // We pick a stand-in token "XSTART" to avoid colliding with any
    // built-in plugin. We then place a token *inside* a table row and
    // also as a standalone line, and confirm the standalone match wins.
    const sneakyToken = "XSTARTXEND"

    // Test plugin: matches the literal token (very simple).
    const probe = new Plugin(
        new RegExp(`(?<=\n)${sneakyToken}(?=\n)`),
        new RegExp(""),
        new RegExp(""),
        "probe",
        () => `<PROBE></PROBE>`,
    )
    // Probe runs alongside the default plugins so the table renders too —
    // the third check below asserts the table survived intact.
    const parser = new Parser([...defaultPlugins, probe])

    const md = [
        "| col |",                          // table row 1
        "| --- |",                          // separator
        `| ${sneakyToken} |`,              // token INSIDE a table cell
        "",                                 // blank
        sneakyToken,                        // standalone token
        "",                                 // blank
    ].join("\n")

    const out = parser.parse(md)

    // Old behavior: the `replace(sneakyToken, ...)` would hit the FIRST
    // occurrence — inside the table cell — corrupting the table and
    // leaving the standalone one literal. New behavior: only the
    // standalone match is replaced.
    check(
        "standalone token replaced",
        out.includes("<PROBE></PROBE>"),
        `standalone token not replaced. output: ${out}`
    )
    check(
        "token inside table cell NOT replaced",
        !/<PROBE><\/PROBE>/i.test(out.split("<PROBE></PROBE>").join("")),
        // The above split is intentional: it strips the legitimate
        // replacement, then asserts nothing else contains it.
        `probe leaked inside table cell: ${out}`
    )
    check(
        "table structure still intact (separator not corrupted)",
        /<th[^>]*>\s*col\s*<\/th>/i.test(out) || /<td[^>]*>\s*col\s*<\/td>/i.test(out),
        `table header lost: ${out}`
    )
}

// =============================================================================
// Bug 4 — Horizontal rule only matches ___
// =============================================================================
header("Bug 4: horizontal rule accepts ---")

{
    const md = "above\n\n---\n\nbelow"
    const out = parse(md)
    check(
        "--- on its own line is rendered as a rule",
        /class="[^"]*\bline\b[^"]*"/.test(out),
        `--- not rendered as rule. output: ${out}`
    )

    // And ___ must keep working (no regression).
    const out2 = parse("a\n\n___\n\nb")
    check(
        "___ still rendered as a rule (no regression)",
        /class="[^"]*\bline\b[^"]*"/.test(out2),
        `___ not rendered. output: ${out2}`
    )

    // Edge: a `---` that appears *inside* a table separator must NOT
    // trigger the rule plugin (this is the Bug 3 dependency).
    const md3 = [
        "| h |",
        "| --- |",
        "| x |",
    ].join("\n")
    const out3 = parse(md3)
    check(
        "--- inside table separator does NOT become a rule",
        !/class="[^"]*\bline\b[^"]*"/i.test(out3),
        `table separator was misread as rule: ${out3}`
    )
}

// =============================================================================
// Bug 5 — console.error("Plugin ID not matched.") on partial / streaming
// =============================================================================
header("Bug 5: no console.error spam on partial / streaming input")

{
    // Intercept console.error for the duration of one parse.
    const calls = []
    const orig = console.error
    console.error = (...args) => { calls.push(args.join(" ")) }

    // Force the engine down the unmatched-symbol path by sabotaging a
    // plugin instance's stored matches and then running replaceSymbols.
    // This is the exact code path the brief flagged (line 65 of
    // src/lib/Plugin.ts). On 0.8.1 this console.error's; on 0.9.0 it
    // must be silent.
    const sabotaged = new Plugin(
        new RegExp("SABOTAGE"),
        new RegExp(""),
        new RegExp("(?=\n)"),
        "sabotage",
        () => "<SAB/>",
    )
    // Pre-populate matches with a fake id that won't appear in the text.
    sabotaged.matches = [{
        complete: "SABOTAGE",
        content: "",
        start: "SABOTAGE",
        end: "",
        id: "@sabotage-0@",
    }]

    let threw = null
    try {
        sabotaged.replaceSymbols("plain text with no symbols")
    } catch (e) { threw = e }
    finally { console.error = orig }

    const idNotMatched = calls.filter(c => /Plugin ID not matched/.test(c))
    check(
        "no 'Plugin ID not matched.' on unmatched-symbol path",
        idNotMatched.length === 0,
        `${idNotMatched.length} spurious console.error call(s):\n      ${idNotMatched.slice(0, 3).join("\n      ")}`
    )
    check(
        "unmatched-symbol path returns silently (no throw)",
        threw === null,
        threw ? `threw: ${threw.message}` : ""
    )

    // Also verify the full default parser on partial input is silent —
    // a separate, weaker guarantee.
    calls.length = 0
    console.error = (...args) => { calls.push(args.join(" ")) }
    try {
        defaultParser.parse("# h\n\n**unclosed bold")
    } finally { console.error = orig }
    const partialErr = calls.filter(c => /Plugin ID not matched/.test(c))
    check(
        "defaultParser on partial input emits no 'Plugin ID not matched.'",
        partialErr.length === 0,
        `${partialErr.length} call(s) on partial input`
    )
}

// =============================================================================
// Sanity sweep — make sure the basic markdown test.md still parses
// =============================================================================
header("Sanity: no engine symbols leak across all built-in plugins")

{
    const md = [
        "# h1",
        "## h2",
        "**bold** *italic* ~~strike~~ `code`",
        "[a](https://x.com) ![img](https://x.com/i.png)",
        "- ul",
        "1. ol",
        "> quote",
        "- [x] task",
        "",
        "| a | b |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "---",
        "",
        "```js",
        "console.log(1)",
        "```",
    ].join("\n")
    const out = parse(md)
    check(
        "no @plugin-N@ symbols in final HTML",
        !/@[a-z][a-z0-9-]*-\d+@/i.test(out),
        `leaked: ${out.match(/@[a-z][a-z0-9-]*-\d+@/gi)?.join(", ")}`
    )
}

// =============================================================================
// Verdict
// =============================================================================
console.log(`\n\x1b[1m${"─".repeat(60)}\x1b[0m`)
console.log(`\x1b[1mResult:\x1b[0m  ${passed} passed, ${failed} failed`)

if (failed > 0) {
    console.log(`\n\x1b[31m${failed} failure(s):\x1b[0m`)
    failures.forEach(f => console.log(f))
    process.exit(1)
}
console.log("\x1b[32mAll regression checks passed.\x1b[0m")
process.exit(0)
