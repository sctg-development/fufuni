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

async function main() {
    const outFile = process.argv[2] || "export.txt";
    const root = process.cwd();

    const patterns = ["apps/client/src/**/*.{ts,tsx,js,jsx}", "apps/merchant/src/**/*.{ts,tsx,js,jsx}"];
    const ignore = ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/*.d.ts"];

    const files = await fg(patterns, { cwd: root, absolute: true, onlyFiles: true, ignore });
    let combined = "";

    for (const abs of files) {
        const rel = path.relative(root, abs);
        const content = await fs.readFile(abs, "utf8");
        combined += `/**\n *\n * FILE: ${rel}\n *\n */\n\n`;
        combined += content + "\n\n";
    }

    await fs.writeFile(outFile, combined, "utf8");
    console.log(`Exported ${files.length} files to ${outFile}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
