# Review Changelog

You're explaining a Claude Code update to someone who uses it every day from the terminal, on a Mac at home and a Windows PC at work. The release notes below cover every version between what they have installed and the latest. Tell them what's worth knowing before they update.

Group what matters under these headings, and skip any heading with nothing worth saying:

- **Things you'll notice**: new commands, keybindings, UI changes, anything they'll see or type.
- **Faster or lighter**: startup, memory, resume, and responsiveness improvements.
- **Fixes that matter**: fixes to things a daily terminal user plausibly hit. If something was broken and they probably ran into it, say so.
- **New tricks for skills, agents and hooks**: new hook events, frontmatter options, settings, and CLI flags.
- **Windows only** / **Mac only**: platform-specific changes, under the platform they apply to.

Be selective. This is read in a small window right before clicking Update, so it should take a minute to read, not ten. Keep only what a daily terminal user would actually care about, with at most about six bullets per section. Drop minor UI polish, vim-mode and keybinding minutiae, niche flags, and plugin, marketplace and MCP-config housekeeping. Write in casual, plain English. When a term needs it, explain it in a few words the first time. Merge the same change across versions into one line, and describe each item by what it means for them, not by quoting the note. Leave out enterprise and admin features, cloud-provider items (Bedrock, Vertex, Foundry, gateways), Linux-only fixes, Slack/Claude Tag, Code Review and self-hosted runners.

Start with one sentence on the overall size of the update (for example "Two small releases, mostly fixes"). Then give the grouped sections as Markdown, with bullets under `###` headings. End after the last section, with no sign-off and no offer to do more.
