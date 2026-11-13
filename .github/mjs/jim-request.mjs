import fs from "node:fs/promises";

// Satu endpoint POST, satu fetch, API key dibaca dari GitHub Secret.
// JSON pada Issue hanya berisi body request, bukan URL atau credentials.
var endpoint = "https://gateway.prod.bravo.bfi.co.id/sf/pbf/ro/dupcheck";
var apiKey = process.env.SF_BFI_PROD_APIKEY;
var issueBody = process.env.ISSUE_BODY || "";
var evidenceFile = (process.env.RUNNER_TEMP || "/tmp") + "/jim-request-comment.md";
var fence = String.fromCharCode(96, 96, 96);

function readRequest(text) {
    var lines = text.split(/\r?\n/);
    var headingCount = 0;
    var inSection = false;
    var section = [];

    for (var i = 0; i < lines.length; i++) {
        if (/^### Jim Request\s*$/.test(lines[i])) {
            headingCount++;
            inSection = true;
            continue;
        }
        if (inSection && /^#{1,3}\s+/.test(lines[i])) {
            inSection = false;
        }
        if (inSection) {
            section.push(lines[i]);
        }
    }
    if (headingCount !== 1) {
        throw new Error("Harus ada tepat satu heading ### Jim Request.");
    }

    var pattern = new RegExp("(?:^|\\n)" + fence + "json[ \\t]*\\n([\\s\\S]*?)\\n" + fence + "[ \\t]*(?=\\n|$)", "gi");
    var matches = [];
    var bodyText = section.join("\n");
    var match = pattern.exec(bodyText);
    while (match) {
        matches.push(match[1]);
        match = pattern.exec(bodyText);
    }
    if (matches.length !== 1 || Buffer.byteLength(matches[0], "utf8") > 10000) {
        throw new Error("Jim Request wajib berisi satu JSON code block maksimal 10 KB.");
    }

    var request;
    try {
        request = JSON.parse(matches[0]);
    } catch (error) {
        throw new Error("JSON Jim Request tidak valid.");
    }
    return validateRequest(request);
}

function validateRequest(request) {
    if (!request || Array.isArray(request) || typeof request !== "object") {
        throw new Error("Request harus berupa JSON object.");
    }
    var keys = Object.keys(request);
    if (keys.length !== 1 || keys[0] !== "content") {
        throw new Error("Request hanya boleh berisi property content.");
    }
    if (!Array.isArray(request.content) || request.content.length < 1 || request.content.length > 20) {
        throw new Error("content harus array berisi 1 sampai 20 item.");
    }
    for (var i = 0; i < request.content.length; i++) {
        var item = request.content[i];
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Setiap item content harus object.");
        }
        var fields = Object.keys(item).sort().join(",");
        if (fields !== "agreement_id,product_id,status") {
            throw new Error("Item hanya boleh memiliki agreement_id, product_id, status.");
        }
        if (typeof item.agreement_id !== "string" || !/^\d{1,30}$/.test(item.agreement_id)) {
            throw new Error("agreement_id harus teks numerik 1 sampai 30 digit.");
        }
        if (!Number.isInteger(item.product_id) || item.product_id < 1 || item.product_id > 99999) {
            throw new Error("product_id harus bilangan bulat positif.");
        }
        if (typeof item.status !== "string" || !/^[A-Z_]{1,20}$/.test(item.status)) {
            throw new Error("status harus teks uppercase maksimal 20 karakter.");
        }
    }
    return request;
}

function maskSensitive(value) {
    if (Array.isArray(value)) {
        var list = [];
        for (var i = 0; i < value.length; i++) {
            list.push(maskSensitive(value[i]));
        }
        return list;
    }
    if (value && typeof value === "object") {
        var output = {};
        var keys = Object.keys(value);
        for (var j = 0; j < keys.length; j++) {
            var key = keys[j];
            if (/^(x[-_])?api[-_]?key$/i.test(key)) {
                output[key] = "[HIDDEN]";
            } else {
                output[key] = maskSensitive(value[key]);
            }
        }
        return output;
    }
    if (typeof value === "string" && apiKey) {
        return value.split(apiKey).join("[HIDDEN]");
    }
    return value;
}

function shellQuote(value) {
    return "'" + String(value).split("'").join("'\\''") + "'";
}
async function main() {
    var request;
    var response;
    var result;
    var errorMessage = "";
    try {
        request = readRequest(issueBody);
        if (!apiKey) {
            throw new Error("GitHub Secret SF_BFI_PROD_APIKEY belum tersedia.");
        }

        // Satu-satunya fetch pada gateway ini.
        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Apikey": apiKey
            },
            body: JSON.stringify(request),
            redirect: "error",
            signal: AbortSignal.timeout(30000)
        });
        var text = await response.text();
        if (Buffer.byteLength(text, "utf8") > 50000) {
            result = {notice: "Response melebihi 50 KB; tidak ditampilkan."};
        } else {
            try {
                result = JSON.parse(text);
            } catch (error) {
                result = {text: text.slice(0, 2000)};
            }
        }
        if (!response.ok) {
            errorMessage = "Gateway HTTP " + response.status;
            process.exitCode = 1;
        }
    } catch (error) {
        errorMessage = error.message;
        process.exitCode = 1;
    }

    var status = response ? response.status : "N/A";
    var state = errorMessage ? "FAILED" : "SUCCESS";
    var lines = [
        "## Jim API — Dupcheck PROD — Issue #" + (process.env.ISSUE_NUMBER || "?"),
        "",
        "Status: **" + state + "** · HTTP " + status + " · POST",
        "",
        "<details>",
        "<summary>cURL (API key masked)</summary>",
        "",
        fence + "bash",
        "curl --location " + shellQuote(endpoint) + " \\",
        "  --header 'Content-Type: application/json' \\",
        "  --header 'Accept: application/json' \\",
        "  --header 'X-Apikey: [HIDDEN]' \\",
        "  --data " + shellQuote(JSON.stringify(maskSensitive(request || {}), null, 2)),
        fence,
        "",
        "</details>",
        "",
        "<details>",
        "<summary>Response JSON — HTTP " + status + "</summary>",
        ""
    ];
    if (errorMessage) {
        lines.push("Error: " + maskSensitive(errorMessage), "");
    }
    lines.push(fence + "json", JSON.stringify(maskSensitive(result || {}), null, 2), fence, "", "</details>");

    await fs.writeFile(evidenceFile, lines.join("\n"), {mode: 0o600});
    console.log("Jim API " + state + " HTTP " + status + " (detail di Issue).");
}

await main();
