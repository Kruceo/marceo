import Plugin from "../lib/Plugin";

function codeBlockElement(start:string,content:string,end:string){
    return `<div class="markdown code-block"><div class="language">${start.slice(3)}</div><div class="code">${content}</div></div>`
}

export const codeBlock = new Plugin(/```\w+/, /.+?/s, /```/, 'codeblock', codeBlockElement, { hideContent: true })