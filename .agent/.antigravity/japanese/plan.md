You are given a translation map in the attached file translation-map.txt . Each line follows the format:
  original text = japanese translation

  check the original text in {/documentation/ui-string.md} for the location of the texts in the project.

Go through the codebase and replace every matching UI string with its Japanese equivalent from the map. Rules:
- Match strings exactly (case-sensitive)
- Only replace strings that exist in the map — do not translate anything else
- Preserve surrounding code, JSX attributes, quoting style, and whitespace
- Do not modify logic, variable names, comments, or non-UI strings
- After all replacements, list every change made: file path, line number, original → replaced


