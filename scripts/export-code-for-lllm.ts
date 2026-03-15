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
        case ".css":
            return "css";
        case ".sql":
            return "sql";
        default:
            return "";
    }
}

function buildTree(paths: string[]) {
    const root = new Map<string, Map<string, any>>();

    for (const p of paths) {
        const parts = p.split("/");
        let node = root;
        for (const part of parts) {
            if (!node.has(part)) node.set(part, new Map());
            node = node.get(part);
        }
    }

    const lines: string[] = [];

    function walk(map: Map<string, any>, prefix: string, isLast: boolean) {
        const entries = Array.from(map.keys()).sort();
        entries.forEach((key, index) => {
            const last = index === entries.length - 1;
            const connector = last ? "└─ " : "├─ ";
            lines.push(`${prefix}${connector}${key}`);

            const child = map.get(key);
            if (child && child.size > 0) {
                const nextPrefix = prefix + (last ? "   " : "│  ");
                walk(child, nextPrefix, last);
            }
        });
    }

    walk(root, "", false);
    return lines;
}

async function main() {
    const outFile = process.argv[2] || "export.md";
    const root = process.cwd();

    const patterns = [
        "apps/client/src/**/*.{ts,tsx,js,jsx,json}",
        "apps/merchant/src/**/*.{ts,tsx,js,jsx,json}",
        "apps/merchant/migrations/*.sql",
    ];
    const ignore = [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/*.d.ts",
        "apps/merchant/admin/**",
        "apps/merchant/example/**",
    ];

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
    console.log(`Found ${files.length} files (${codeFiles.length} code files, ${configFiles.length} config files)`);
    console.log(`. Code files: ${codeFiles.map(f => f.rel).join(", ")}`);
    console.log(`. Config files: ${configFiles.map(f => f.rel).join(", ")}`);

    codeFiles.sort((a, b) => a.rel.localeCompare(b.rel));
    configFiles.sort((a, b) => a.rel.localeCompare(b.rel));

    const allFiles = [...codeFiles.map((f) => f.rel), ...configFiles.map((f) => f.rel)];
    const treeLines = buildTree(allFiles);

    let md = "# Fufuni code details\n\n";

    if (treeLines.length > 0) {
        md += "## Project structure\n\n";
        md += "```\n";
        md += treeLines.join("\n") + "\n";
        md += "```\n\n";
    }

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
