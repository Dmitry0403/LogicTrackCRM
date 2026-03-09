# Repository Rules

- Do not mass-rewrite files with Russian UI text through PowerShell commands such as `Set-Content`, `Out-File`, or global `-replace`.
- Edit files with Russian text only through the IDE, `apply_patch`, or another UTF-8-safe patch workflow.
- Before commit, run `npm run check:encoding`.
- If `npm run check:encoding` reports mojibake, fix the encoding first and only then continue with feature work.
