#!/usr/bin/env python3

import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
games_origin = os.environ.get("SCUMMVM_GAMES_ORIGIN", "https://scummvm-games.tsilva.eu").rstrip("/")
prefix = f"""function getScummvmAssetVersion() {{\n    const search = globalThis.location?.search || \"\";\n    return new URLSearchParams(search).get(\"v\") || \"\";\n}}\n\nfunction withCacheKey(url, cacheKey) {{\n    if (!cacheKey) {{\n        return url;\n    }}\n\n    const resolved = new URL(url, globalThis.location?.href || \"http://localhost\");\n    resolved.searchParams.set(\"v\", cacheKey);\n    return resolved.toString();\n}}\n\nfunction buildRemoteUrl(baseUrl, remotePath) {{\n    const resolved = new URL(baseUrl, globalThis.location?.href || \"http://localhost\");\n    const normalizedPath = remotePath.startsWith(\"/\") ? remotePath : `/${{remotePath}}`;\n    resolved.pathname = `${{resolved.pathname.replace(/\\/$/, \"\")}}${{normalizedPath}}`;\n    return withCacheKey(resolved.toString(), getScummvmAssetVersion());\n}}\n\nfunction isLoopbackHost(hostname) {{\n    return hostname === \"localhost\" || hostname === \"127.0.0.1\" || hostname === \"::1\";\n}}\n\nfunction getDefaultGamesOrigin() {{\n    return \"{games_origin}\";\n}}\n\nfunction getDefaultRemoteFilesystems() {{\n    const hostname = globalThis.location?.hostname || \"\";\n\n    return {{\n        games: isLoopbackHost(hostname) ? \"/games-proxy\" : getDefaultGamesOrigin()\n    }};\n}}\n\nfunction resolveFilesystemUrl(url) {{\n    if (/^[a-z]+:\\/\\//i.test(url)) {{\n        return url.replace(/\\/$/, \"\");\n    }}\n\n    const configured = globalThis.SCUMMVM_FILESYSTEM_BASES?.[url] || getDefaultRemoteFilesystems()[url];\n    if (configured) {{\n        return configured.replace(/\\/$/, \"\");\n    }}\n\n    return url;\n}}\n\nfunction getFilesystemBaseCandidates(url) {{\n    const candidates = [];\n    const configured = globalThis.SCUMMVM_FILESYSTEM_BASES?.[url];\n    const resolved = resolveFilesystemUrl(url);\n    const defaultConfigured = getDefaultRemoteFilesystems()[url];\n\n    for (const candidate of [configured, resolved, defaultConfigured]) {{\n        if (!candidate) {{\n            continue;\n        }}\n\n        const normalized = candidate.replace(/\\/$/, \"\");\n        if (!normalized || candidates.includes(normalized)) {{\n            continue;\n        }}\n\n        candidates.push(normalized);\n    }}\n\n    return candidates;\n}}\n\nfunction tryLoadFilesystemIndex(baseUrl) {{\n    const req = new XMLHttpRequest();\n    const requestUrl = buildRemoteUrl(baseUrl, \"/index.json\");\n\n    req.open(\"GET\", requestUrl, false);\n    req.send(null);\n\n    if (req.status < 200 || req.status >= 300) {{\n        return {{ ok: false, requestUrl, status: req.status, body: req.responseText }};\n    }}\n\n    try {{\n        return {{ ok: true, requestUrl, json: JSON.parse(req.responseText) }};\n    }} catch (error) {{\n        return {{ ok: false, requestUrl, status: req.status, body: req.responseText, error }};\n    }}\n}}\n\nfunction loadFilesystemIndex(url) {{\n    const failures = [];\n\n    for (const baseUrl of getFilesystemBaseCandidates(url)) {{\n        const result = tryLoadFilesystemIndex(baseUrl);\n        if (result.ok) {{\n            return {{ url: baseUrl, json: result.json }};\n        }}\n\n        failures.push(result);\n    }}\n\n    const failureSummary = failures.map((failure) => {{\n        const status = failure.status || 0;\n        const bodyPreview = (failure.body || \"\").trim().slice(0, 120).replace(/\\s+/g, \" \");\n        return `${{failure.requestUrl}} -> ${{status}}${{bodyPreview ? ` (${{bodyPreview}})` : \"\"}}`;\n    }}).join(\"; \");\n\n    throw new Error(`Unable to load ScummVM filesystem index for '${{url}}'. Tried: ${{failureSummary || \"no candidates\"}}`);\n}}\n\n"""
block_start = "function getScummvmAssetVersion() {"
block_end = "export class ScummvmFS {"

if block_start in text and block_end in text:
    start_index = text.index(block_start)
    end_index = text.index(block_end)
    text = text[:start_index] + prefix + text[end_index:]
else:
    needle = "const DEBUG = false\n\n\nexport class ScummvmFS {"
    replacement = "const DEBUG = false\n\n\n" + prefix + "export class ScummvmFS {"
    if needle in text:
        text = text.replace(needle, replacement, 1)

text = text.replace(
    "        this.url = _url\n        var req = new XMLHttpRequest(); // a new request\n        req.open(\"GET\", _url + \"/index.json\", false);\n        req.send(null);\n        var json_index = JSON.parse(req.responseText)\n",
    "        const filesystemIndex = loadFilesystemIndex(_url)\n        this.url = filesystemIndex.url\n        var json_index = filesystemIndex.json\n",
    1,
)
text = text.replace(
    "        this.url = resolveFilesystemUrl(_url)\n        var req = new XMLHttpRequest(); // a new request\n        req.open(\"GET\", buildRemoteUrl(this.url, \"/index.json\"), false);\n        req.send(null);\n        var json_index = JSON.parse(req.responseText)\n",
    "        const filesystemIndex = loadFilesystemIndex(_url)\n        this.url = filesystemIndex.url\n        var json_index = filesystemIndex.json\n",
    1,
)
text = text.replace("        this.url = _url\n", "        this.url = resolveFilesystemUrl(_url)\n", 1)
text = text.replace('        req.open("GET", _url + "/index.json", false);\n', '        req.open("GET", buildRemoteUrl(this.url, "/index.json"), false);\n', 1)
text = text.replace("        const url = _url + path;\n", "        const url = buildRemoteUrl(_url, path);\n", 1)

path.write_text(text)
