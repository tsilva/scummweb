#!/usr/bin/env python3

from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
prefix = """function getScummvmAssetVersion() {\n    const search = globalThis.location?.search || \"\";\n    return new URLSearchParams(search).get(\"v\") || \"\";\n}\n\nfunction withCacheKey(url, cacheKey) {\n    if (!cacheKey) {\n        return url;\n    }\n\n    const resolved = new URL(url, globalThis.location?.href || \"http://localhost\");\n    resolved.searchParams.set(\"v\", cacheKey);\n    return resolved.toString();\n}\n\nfunction buildRemoteUrl(baseUrl, remotePath) {\n    const resolved = new URL(baseUrl, globalThis.location?.href || \"http://localhost\");\n    const normalizedPath = remotePath.startsWith(\"/\") ? remotePath : `/${remotePath}`;\n    resolved.pathname = `${resolved.pathname.replace(/\\/$/, \"\")}${normalizedPath}`;\n    return withCacheKey(resolved.toString(), getScummvmAssetVersion());\n}\n\nfunction getDefaultRemoteFilesystems() {\n    return {\n        games: \"/games-proxy\"\n    };\n}\n\nfunction resolveFilesystemUrl(url) {\n    if (/^[a-z]+:\\/\\//i.test(url)) {\n        return url.replace(/\\/$/, \"\");\n    }\n\n    const configured = globalThis.SCUMMVM_FILESYSTEM_BASES?.[url] || getDefaultRemoteFilesystems()[url];\n    if (configured) {\n        return configured.replace(/\\/$/, \"\");\n    }\n\n    return url;\n}\n\n"""
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

text = text.replace("        this.url = _url\n", "        this.url = resolveFilesystemUrl(_url)\n", 1)
text = text.replace('        req.open("GET", _url + "/index.json", false);\n', '        req.open("GET", buildRemoteUrl(this.url, "/index.json"), false);\n', 1)
text = text.replace("        const url = _url + path;\n", "        const url = buildRemoteUrl(_url, path);\n", 1)

path.write_text(text)
