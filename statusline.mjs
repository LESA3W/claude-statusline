import fs from 'node:fs';
import { execSync } from 'node:child_process';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
// Theme: white + light blue.
const LIGHTBLUE = '\x1b[38;5;117m';
const WHITE = '\x1b[97m';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function displayCwd(p) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  let out = p.replace(/\\/g, '/');
  if (home) {
    const homeNorm = home.replace(/\\/g, '/');
    if (out.toLowerCase().startsWith(homeNorm.toLowerCase())) {
      out = '~' + out.slice(homeNorm.length);
    }
  }
  return out;
}

function gitBranch(dir) {
  try {
    return execSync(`git -C "${dir}" branch --show-current`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 500,
    }).trim();
  } catch {
    return '';
  }
}

function compactionCount(transcriptPath) {
  if (!transcriptPath) return 0;
  try {
    const data = fs.readFileSync(transcriptPath, 'utf8');
    const matches = data.match(/"isCompactSummary":\s*true/g);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

// Gradient by cell position: green -> yellow -> orange -> red as the bar fills.
function cellColor(frac) {
  if (frac >= 0.9) return '\x1b[38;5;196m';   // red
  if (frac >= 0.7) return '\x1b[38;5;208m';   // orange
  if (frac >= 0.45) return '\x1b[38;5;220m';  // yellow
  return '\x1b[38;5;40m';                      // green
}

function renderBar(pct, width = 10) {
  const clamped = Math.max(0, Math.min(pct, 1));
  const filled = Math.round(clamped * width);
  let out = '';
  for (let i = 0; i < filled; i++) {
    const frac = width > 1 ? i / (width - 1) : 0;
    out += `${cellColor(frac)}█`;
  }
  out += `${DIM}${'░'.repeat(width - filled)}${RESET}`;
  return out;
}

// Labeled usage bar: `<label> ████░░░░░░ NN%`. pctRaw is 0..100.
function usageSegment(label, pctRaw, width = 8) {
  if (pctRaw == null) return null;
  const pct = Number(pctRaw) / 100;
  const pctLabel = Math.round(pct * 100);
  return `${DIM}${label}${RESET} ${renderBar(pct, width)} ${WHITE}${pctLabel}%${RESET}`;
}

// Effort badge: `⚡High`, name capitalized.
function effortBadge(level) {
  if (!level) return null;
  const name = level.charAt(0).toUpperCase() + level.slice(1);
  return `${DIM}⚡${RESET}${LIGHTBLUE}${name}${RESET}`;
}

// Locale: --locale=xx arg, then STATUSLINE_LOCALE, then LC_ALL/LANG, then Intl default.
function resolveLocale() {
  const arg = process.argv.find((a) => a.startsWith('--locale='));
  if (arg) return arg.slice('--locale='.length);
  return (
    process.env.STATUSLINE_LOCALE ||
    process.env.LC_ALL ||
    process.env.LANG ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    'en'
  );
}
const IS_FR = /^fr/i.test(resolveLocale());

// Reset time formatting (Unix seconds -> local time).
// French: `05h20`, `jeu 02h00`. Other locales: `05:20`, `Thu 02:00`.
function fmtHour(ts) {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return IS_FR ? `${hh}h${mm}` : `${hh}:${mm}`;
}
function fmtDayHour(ts) {
  const d = new Date(ts * 1000);
  const days = IS_FR
    ? ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]} ${fmtHour(ts)}`;
}
// Dim reset tag: ` ↻05h20` (or ` ↻jeu 02h00`). Empty when no timestamp.
function resetTag(ts, dayToo) {
  if (ts == null) return '';
  return ` ${DIM}↻${dayToo ? fmtDayHour(ts) : fmtHour(ts)}${RESET}`;
}

function main() {
  const raw = readStdin();
  let ctx = {};
  try {
    ctx = raw ? JSON.parse(raw) : {};
  } catch {
    ctx = {};
  }

  const cwd = ctx?.workspace?.current_dir || ctx?.cwd || process.cwd();
  // Strip trailing parenthetical like " (1M context)" from the model name.
  const modelName = (ctx?.model?.display_name || 'Claude').replace(/\s*\([^)]*\)\s*$/, '');
  const pctRaw = ctx?.context_window?.used_percentage;
  const compactions = compactionCount(ctx?.transcript_path);
  const effort = ctx?.effort?.level;
  const fiveHour = ctx?.rate_limits?.five_hour?.used_percentage;
  const sevenDay = ctx?.rate_limits?.seven_day?.used_percentage;

  const WIDE = '   ';
  const TIGHT = '  ';
  const SNUG = ' ';

  // Location group: folder path + git branch kept snug together.
  const locParts = [`${DIM}📁${RESET} ${LIGHTBLUE}${displayCwd(cwd)}${RESET}`];
  const branch = gitBranch(cwd);
  if (branch) {
    locParts.push(`${DIM}🌿${RESET} ${WHITE}${branch}${RESET}`);
  }
  const locGroup = locParts.join(SNUG);

  // Context group: ctx bar + compaction box kept snug together.
  const ctxSeg = usageSegment('📖', pctRaw, 10);
  const compSeg = compactions > 0 ? `${DIM}📦${RESET}${WHITE}${compactions}${RESET}` : null;
  const ctxGroup = [ctxSeg, compSeg].filter(Boolean).join(SNUG);

  // Usage bars: 5h and 7d, each with its reset time appended.
  const usageParts = [];
  let fiveSeg = usageSegment('5h', fiveHour);
  if (fiveSeg) {
    fiveSeg += resetTag(ctx?.rate_limits?.five_hour?.resets_at, false);
    usageParts.push(fiveSeg);
  }
  let weekSeg = usageSegment('7d', sevenDay);
  if (weekSeg) {
    weekSeg += resetTag(ctx?.rate_limits?.seven_day?.resets_at, true);
    usageParts.push(weekSeg);
  }
  const usageBlock = usageParts.join(TIGHT);

  // Model name in blue, version (trailing number) left white.
  const mv = modelName.match(/^(.*?)\s+([\d.]+)$/);
  const modelText = mv
    ? `${BOLD}${LIGHTBLUE}${mv[1]}${RESET} ${BOLD}${WHITE}${mv[2]}${RESET}`
    : `${BOLD}${LIGHTBLUE}${modelName}${RESET}`;
  let modelSeg = `${DIM}🤖${RESET} ${modelText}`;
  const badge = effortBadge(effort);
  if (badge) modelSeg += ` ${badge}`;

  // Right cluster: usage bars, then a clear gap before the model.
  const cluster = usageBlock ? `${usageBlock}${WIDE}${modelSeg}` : modelSeg;

  // Assemble: loc [WIDE] ctx [WIDE] cluster.
  let line = locGroup;
  if (ctxGroup) {
    line += `${WIDE}${ctxGroup}${WIDE}${cluster}`;
  } else {
    line += `${WIDE}${cluster}`;
  }
  process.stdout.write(line);
}

main();
