import fs from "node:fs/promises";
import childProcess from "node:child_process";

// Bash bebas hanya pada job terpisah, tanpa API key dan tanpa token GitHub tulis.
var bashName = process.env.BASH_HEADING === "Sf Bash" ? "Sf Bash" : "Jim Bash";
var bashPrefix = bashName === "Sf Bash" ? "sf" : "jim";
var issueBody = process.env.ISSUE_BODY || "";
var issueNumber = process.env.ISSUE_NUMBER || "?";
var tempDir = process.env.RUNNER_TEMP || "/tmp";
var evidenceFile = tempDir + "/" + bashPrefix + "-bash-comment.md";
var fence = String.fromCharCode(96, 96, 96);

function readBash(text) {
    var lines = text.split(/\r?\n/);
    var section = [];
    var headingCount = 0;
    var active = false;

    for (var i = 0; i < lines.length; i++) {
        if (lines[i].trim() === "### " + bashName) {
            headingCount++;
            active = true;
            continue;
        }
        if (active && /^#{1,3}\s+/.test(lines[i])) active = false;
        if (active) section.push(lines[i]);
    }
    if (headingCount !== 1) {
        throw new Error("Issue wajib memiliki tepat satu heading ### " + bashName + ".");
    }

    var expression = new RegExp("(?:^|\\n)" + fence + "bash[ \\t]*\\n([\\s\\S]*?)\\n" + fence + "[ \\t]*(?=\\n|$)", "gi");
    var source = section.join("\n");
    var first = expression.exec(source);
    var second = expression.exec(source);
    if (!first || second) {
        throw new Error("" + bashName + " harus memiliki tepat satu code fence bash.");
    }
    if (!first[1].trim() || Buffer.byteLength(first[1], "utf8") > 4000) {
        throw new Error("Script Bash harus berisi 1 sampai 4000 byte.");
    }
    return first[1];
}

async function main() {
    var script = "";
    var output = "";
    var error = "";
    try {
        script = readBash(issueBody);
        var scriptPath = tempDir + "/" + bashPrefix + "-bash-request.sh";
        await fs.writeFile(scriptPath, script, {mode: 0o600});

        // Shell bebas: pipe, redirect, variable, dan multiline didukung.
        // Lingkungan child tidak mewarisi Secret ataupun GITHUB_TOKEN.
        var result = childProcess.spawnSync("bash", ["--noprofile", "--norc", scriptPath], {
            encoding: "utf8",
            timeout: 15000,
            maxBuffer: 65536,
            cwd: process.cwd(),
            env: {
                PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                HOME: process.env.HOME || "/tmp",
                LANG: "C.UTF-8",
                TMPDIR: tempDir
            }
        });
        output = (result.stdout || "") + (result.stderr || "");
        if (result.error) {
            error = result.error.message;
        } else if (result.status !== 0) {
            error = "Exit code " + result.status;
        }
    } catch (caught) {
        error = caught.message || String(caught);
    }

    var status = error ? "FAILED" : "SUCCESS";
    var lines = [
        "## " + bashName + " — WDE — Issue #" + issueNumber,
        "",
        "Status: **" + status + "**",
        "",
        "### Bash Script",
        "",
        fence + "bash",
        script.split(fence).join("[BACKTICKS]"),
        fence,
        "",
        "<details>",
        "<summary>Terminal Output</summary>",
        "",
        fence + "text",
        (error ? "Error: " + error + "\n" : "") + output.slice(0, 16000).split(fence).join("[BACKTICKS]"),
        fence,
        "",
        "</details>",
        ""
    ];
    await fs.writeFile(evidenceFile, lines.join("\n"), {mode: 0o600});
    console.log(bashName + " " + status + " — output disimpan untuk komentar Issue.");
    if (error) process.exitCode = 1;
}

await main();
