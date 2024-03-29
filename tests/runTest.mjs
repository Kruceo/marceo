import cp from 'child_process'
import fs from 'fs'

fs.writeFileSync("./tests/test.mjs",'import {parse} from "../dist/index.mjs";import fs from "fs" ; console.log(parse(fs.readFileSync("./tests/test.md","utf8")));')

let result = cp.execSync("node --experimental-modules ./tests/test.mjs")

const compare = fs.readFileSync("./tests/compare.txt","utf-8")
fs.rmSync('./tests/test.mjs')
fs.writeFileSync("./tests/lastResult.html",result)

let verifiedResult = result.toString().split("\n").reduce((acum,next,index)=>{
    if(compare.split("\n")[index]!=next)return acum +"<div style='background-color:red;color:white;'>" + next +"</div>\n"
    else return acum +"\n" + next
},"")



if(result.toString() != compare ){
    try {
        fs.writeFileSync("./tests/index.html",`<div style="display:flex;"><d><h1 style="color:red;">BAD</h1>${verifiedResult}</d><d><h1 style="color:green;">OK</h1>${compare}</d></div>`)
        cp.exec("vite --port 8882")
        cp.execSync('xdg-open http://localhost:8882/tests/index.html')
    } catch (error) {
        console.log(error)
    }
    throw new Error("The comparation don't match.")
}

console.log("[PASS]")
