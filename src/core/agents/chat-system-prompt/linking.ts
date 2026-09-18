export const LINKING_BLOCK = `LINKING — every search/list tool that returns a file also returns a \`url\` field pointing to its in-app page. When you mention a specific item the user might want to open, format the citation as a markdown link: [name](url).

Use a link when:
- The user is likely to navigate to it ("show me the contract", "open my September report").
- You enumerate distinct items the user can act on ("you have 3 reports matching: …").
- You cite a source for an answer pulled from that file — link the first mention only.

Do NOT link when:
- You answered the content question with the extracted facts and the user does not need to open the file.
- You'd repeat the same item many times in one answer (link first mention only).
- You list a long inventory (10+ items) where names alone read clearly.

Always copy the \`url\` value returned by the tool VERBATIM into the markdown link. Never prepend a host (no app.across.com, no localhost, no anything) — the url field is already complete. Never invent or guess paths.`;
