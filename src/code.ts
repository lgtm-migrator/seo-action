import fs from "fs";
import path from "path";
import os from "os";
import * as core from "@actions/core";
import * as artifact from "@actions/artifact"
import {Ci, RestCiArgs} from "qiyu-seo"
import {cliRun} from "./cli";
import {debugMode} from "./debug";


async function uploadFile(name: string, file: string) {
    const client = artifact.create()
    await client.uploadArtifact(name, [file], path.dirname(file), {continueOnError: true})
}

/**
 * 运行 custom 代码
 */
export async function runCode() {
    const url: string = core.getInput("url")
    const code_file: string = core.getInput("code")
    const snapshot = core.getBooleanInput("snapshot")
    const pdf = core.getBooleanInput("pdf")
    const video = core.getBooleanInput("video")
    const rrweb = core.getBooleanInput("rrweb")
    const timeout = Number(core.getInput("timeout"))

    const code = fs.readFileSync(`${process.env['GITHUB_WORKSPACE']}/${code_file}`, {encoding: 'utf-8'})

    core.info(`try to visit url: ${url}`)
    core.info(`js code:\n${code}\n\n`)

    const args: RestCiArgs = {
        url: url,
        fn_code: code,
        timeout: timeout,
        auto_close: true,
        snapshot: snapshot,
        pdf: pdf,
        video: video,
        rrweb: rrweb,
    }

    const bearer = process.env['SEO_REST_API_BEARER'] || 'seo'

    if (debugMode() && os.platform() === 'linux') {
        cliRun("sudo", ["netstat", "-plnt"])
    }

    let success = true;
    const resp = await Ci.do_post({body: args, security: {bearer}},
        async (resp) => {
            return await resp.json()
        },
        async (resp) => {
            const txt = await resp.text()
            success = false
            core.setFailed(`失败:
http code: ${resp.status} 
result: ${txt}
`)
        })


    if (success) {
        const run_id = process.env["GITHUB_RUN_ID"] || ""
        const repo = process.env['GITHUB_REPOSITORY'] || ""

        const url = new URL("https://ci.2cc.net")
        url.searchParams.set("run_id", run_id)
        url.searchParams.set("repo", repo)

        if (snapshot && resp.data?.snapshot_file) {
            await uploadFile("snapshot", resp.data.snapshot_file)
            url.searchParams.set("type", "snapshot")
            core.notice(`you can view snapshot by: ${url.toString()}`)
        }
        if (pdf && resp.data?.pdf_file) {
            url.searchParams.set("type", "pdf")
            await uploadFile("pdf", resp.data.pdf_file)
        }
        if (rrweb && resp.data?.rrweb_file) {
            url.searchParams.set("type", "rrweb")
            await uploadFile("rrweb", resp.data.rrweb_file)
        }
        const data = JSON.stringify(resp, null, 2)
        const out_file = `${os.tmpdir()}/seo.json`
        fs.writeFileSync(out_file, data)
        await uploadFile("result", out_file)
        core.info(`success:\n${data}`)
        core.setOutput("SEO_RESULT_FILE", out_file)
    }
}
