# claude-statusline

A compact, colorful status line for [Claude Code](https://docs.claude.com/en/docs/claude-code/statusline) that shows your context usage, how many times the conversation was compacted, your 5-hour and 7-day rate-limit usage with reset times, and the current model with its effort level.

```
📁 ~/my-project 🌿 main   📖 ██████░░░░ 55% 📦2   5h ██████░░ 78% ↻05:20  7d ████████ 95% ↻Thu 02:00   🤖 Opus 4.8 ⚡High
```

Single file, zero dependencies, Node.js only.

## Features

- **Location**: current folder (home shortened to `~`) and git branch when inside a repo.
- **Context window**: 📖 usage bar and percentage.
- **Compaction counter**: 📦 shows how many times the current conversation was compacted. Hidden while it is 0.
- **Rate limits**: `5h` and `7d` usage bars with the time each window resets (`↻`).
- **Gradient bars**: cells go green, yellow, orange then red as a bar fills up.
- **Model and effort**: model name in blue, version in white, the `(1M context)` suffix stripped, followed by the effort level (`⚡High`, `⚡Medium`, `⚡Low`).

## Install

1. Copy `statusline.mjs` to `~/.claude/statusline.mjs`.
2. Add this to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/statusline.mjs",
    "padding": 0
  }
}
```

3. Restart Claude Code or send a message, and the line appears at the bottom.

## Reset time format

Reset times follow your locale. French gives `05h20` and `jeu 02h00`, every other locale gives `05:20` and `Thu 02:00`.

The locale is resolved in this order:

1. `--locale=xx` argument, for example `node ~/.claude/statusline.mjs --locale=fr`
2. `STATUSLINE_LOCALE` environment variable
3. `LC_ALL` / `LANG`
4. Node's default (`Intl`)

On Windows, Node often reports `en-US` even on a French system, so pass `--locale=fr` explicitly if you want the French format.

## Try it without Claude Code

```bash
node statusline.mjs < examples/sample-input.json
node statusline.mjs --locale=fr < examples/sample-input.json
```

## How it works

Claude Code pipes a JSON payload to the command on stdin each time the status line refreshes. The script reads:

| Field | Used for |
| --- | --- |
| `workspace.current_dir` | folder and git branch |
| `context_window.used_percentage` | 📖 bar |
| `transcript_path` | compaction counter |
| `rate_limits.five_hour` / `rate_limits.seven_day` | usage bars and reset times (`used_percentage`, `resets_at`) |
| `model.display_name` | model name and version |
| `effort.level` | effort badge |

Claude Code does not expose a compaction count, so the script counts the lines containing `"isCompactSummary": true` in the session transcript. Each compaction writes exactly one.

Every segment is optional: when a field is missing (older Claude Code versions, API key users without rate limits), that segment is simply not shown.

### Note on rate-limit numbers

The `rate_limits` values are the last ones Claude Code received from the API. They refresh when Claude Code makes a request, so they can lag behind what Claude Desktop or claude.ai show if you were using those in the meantime. They catch up on your next message.

## License

MIT
