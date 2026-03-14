/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

function languageForExtension(ext: string) {
    switch (ext) {
        case ".ts":
        case ".tsx":
            return "typescript";
        case ".js":
        case ".jsx":
            return "javascript";
        case ".json":
            return "json";
        default:
            return "";
    }
}

async function main() {
    const outFile = process.argv[2] || "export.md";
    const root = process.cwd();

    const patterns = [
        "apps/client/src/**/*.{ts,tsx,js,jsx,json}",
        "apps/merchant/src/**/*.{ts,tsx,js,jsx,json}",
    ];
    const ignore = ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/*.d.ts"];

    const files = await fg(patterns, { cwd: root, absolute: true, onlyFiles: true, ignore });

    const codeFiles: Array<{ rel: string; content: string; ext: string }> = [];
    const configFiles: Array<{ rel: string; content: string }> = [];

    for (const abs of files) {
        const rel = path.relative(root, abs);
        const ext = path.extname(rel).toLowerCase();
        const content = await fs.readFile(abs, "utf8");

        if (ext === ".json") {
            configFiles.push({ rel, content });
        } else {
            codeFiles.push({ rel, content, ext });
        }
    }

    codeFiles.sort((a, b) => a.rel.localeCompare(b.rel));
    configFiles.sort((a, b) => a.rel.localeCompare(b.rel));

    let md = "# Fufuni code details\n\n";

    if (codeFiles.length > 0) {
        md += "## Code\n\n";
        for (const file of codeFiles) {
            const lang = languageForExtension(file.ext) || "";
            md += `### File: ${file.rel}\n`;
            md += "```" + lang + "\n";
            md += file.content;
            if (!file.content.endsWith("\n")) md += "\n";
            md += "```\n\n";
        }
    }

    if (configFiles.length > 0) {
        md += "## Configuration\n\n";
        for (const file of configFiles) {
            md += `### File: ${file.rel}\n`;
            md += "```json\n";
            md += file.content;
            if (!file.content.endsWith("\n")) md += "\n";
            md += "```\n\n";
        }
    }

    await fs.writeFile(outFile, md, "utf8");
    console.log(`Exported ${files.length} files to ${outFile}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
