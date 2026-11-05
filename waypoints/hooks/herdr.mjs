// Herdr status (userConfig herdr: off|on). Herdr learns an agent's status only from the
// program's own OSC 7501 reports, and Claude Code's never count an open plan: a turn that
// ends with a task still open reads "done", then "idle", while the band says
// "paused, waiting on you". With this on, when such a turn ends Waypoints writes one
// report of its own, `blocked`, so Herdr shows "Needs you"; Claude's next report (the
// person types, or the work resumes) replaces it, so nothing has to clear it.
//
// The report has to reach the console Claude draws in, and a hook's process has its own:
// a PowerShell child attaches to Claude's console (FreeConsole, AttachConsole) and writes
// it there. Every assumption is checked before anything is written:
// - hostBlocker: the setting is on, the host is Windows, the session is Claude Code at a
//   terminal (not the Desktop app, an SDK host), and it runs in a Herdr terminal
//   (HC_TERMINAL_ID is set);
// - the probe (probeArgv / probeBlocker): Windows PowerShell 5 (powershell.exe) or, failing
//   that, PowerShell 7 (pwsh.exe) runs in FullLanguage mode (Add-Type is allowed) and finds
//   herdr-core's `hc`;
// - the mark script itself, at the moment it writes: the terminal is not a sub-agent (its
//   parent drives it with `hc send`, which a blocked terminal refuses), Claude reports its
//   status there, the terminal's program is the script's own ancestor (HC_TERMINAL_ID is
//   inherited, so an editor started from a Herdr terminal carries it), the report has settled (Claude sends its message a few seconds after
//   "done"), and it is still done or idle.
// No double quote is used in the scripts: they travel as one argv element, and the
// message goes in as char codes, so no text of the plan's is ever parsed as code.

import { isPaused } from './draw.mjs'
import { progress, live } from './plan.mjs'
import { clip } from './fmt.mjs'

export const SHELLS = ['powershell.exe', 'pwsh.exe']
export const MARK_DELAY_MS = 3000 // after turn.complete: the Stop hook's background list lands first
const FLAGS = ['-NoProfile', '-NonInteractive', '-Command']

// Why this session cannot mark Herdr, or '' when it can (the PowerShell probe still decides)
export function hostBlocker({ option, win, interactive, surface, terminalId }) {
  if (option !== 'on') return 'off'
  if (!win) return 'Herdr status works on Windows only'
  if (!interactive || surface !== 'terminal') return 'not a terminal session'
  if (!terminalId) return 'not running in a Herdr terminal'
  return ''
}

const PROBE = [
  '$o = @{ ps = $PSVersionTable.PSVersion.Major; lang = [string]$ExecutionContext.SessionState.LanguageMode; hc = $null }',
  '$c = Get-Command hc -ErrorAction SilentlyContinue',
  'if ($c) { $o.hc = [string]$c.Source }',
  '$o | ConvertTo-Json -Compress',
].join('; ')

export function probeArgv(exe) {
  return [exe, ...FLAGS, PROBE]
}

export function parseProbe(stdout) {
  const line = String(stdout || '').trim().split(/\r?\n/).pop() || ''
  try {
    const p = JSON.parse(line)
    return p && typeof p === 'object' ? p : null
  } catch {
    return null
  }
}

// Why a shell that answered the probe cannot mark Herdr, or ''
export function probeBlocker(p) {
  if (!p) return 'PowerShell did not answer'
  if (p.lang !== 'FullLanguage') return `PowerShell runs in ${p.lang || 'a restricted'} language mode`
  if (!p.hc) return "herdr-core's hc is not on PATH"
  return ''
}

// The turn ended on a plan that waits on the person: an open task of this chat's own
// (parked ones wait on someone else), not stopped with Esc, nothing left running
export function shouldMark(g, waiting) {
  if (!g || !isPaused(g) || g.interrupted) return false
  if (waiting && waiting.length) return false
  const p = progress(g)
  return p.doneN < p.n
}

export function markMessage(g, mask = (s) => s) {
  const next = live(g).find((t) => t.status !== 'done' && t.status !== 'parked')
  return next ? `Waypoints: waiting on you · next ${clip(mask(next.title), 48)}` : 'Waypoints: waiting on you'
}

function charCodes(s) {
  const codes = []
  for (let i = 0; i < s.length; i++) codes.push(s.charCodeAt(i))
  return codes.length ? codes.join(',') : '32'
}

export function markScript(msg) {
  return [
    '$ErrorActionPreference = ' + "'Stop'",
    'try {',
    // Windows PowerShell 5 decodes hc's output in the console's code page otherwise
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    "if ([string]$ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { 'skip language'; exit }",
    "$id = $env:HC_TERMINAL_ID; if (-not $id) { 'skip no-terminal'; exit }",
    'function T { (& hc get $id --json | Out-String) | ConvertFrom-Json }',
    '$t = T',
    "if ($t.parent) { 'skip sub-agent'; exit }",
    "if (-not $t.status -or $t.status.app -ne 'claude-code') { 'skip no-report'; exit }",
    // HC_TERMINAL_ID is inherited (an editor started from a Herdr terminal passes it on), so
    // the terminal's program must be this script's own ancestor: never another session's console
    '$want = @([int]$t.pid); if ($t.foreground -and $t.foreground.pid) { $want += [int]$t.foreground.pid }',
    '$target = 0; $p = $PID',
    'for ($i = 0; $i -lt 8 -and -not $target; $i++) { $w = Get-CimInstance Win32_Process -Filter (' + "'ProcessId=' + $p); if (-not $w) { break }; $p = [int]$w.ParentProcessId; if ($want -contains $p) { $target = $p } }",
    "if (-not $target) { 'skip not-this-terminal'; exit }",
    // Windows PowerShell 5 (.NET Framework) will not open a device such as CONOUT$ as a
    // FileStream, so the console is opened and written with CreateFileW / WriteFile
    "$d = '[DllImport(' + [char]34 + 'kernel32.dll' + [char]34",
    "$k = Add-Type -Name WpConsole -Namespace Waypoints -PassThru -MemberDefinition ($d + ')] public static extern bool FreeConsole(); ' + $d + ', SetLastError = true)] public static extern bool AttachConsole(uint p); ' + $d + ', CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr CreateFileW(string n, uint a, uint s, IntPtr sec, uint c, uint f, IntPtr t); ' + $d + ', SetLastError = true)] public static extern bool WriteFile(IntPtr h, byte[] b, uint n, out uint w, IntPtr o); ' + $d + ')] public static extern bool CloseHandle(IntPtr h);')",
    `$m = [string]::new([char[]](${charCodes(String(msg || ''))}))`,
    "$seq = [string][char]27 + ']7501;state=blocked:app=claude-code:kind=question:msg=' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($m)) + [char]7",
    '$bytes = [Text.Encoding]::UTF8.GetBytes($seq)',
    "$prev = ''; $same = 0",
    'for ($i = 0; $i -lt 15 -and $same -lt 3; $i++) { Start-Sleep -Milliseconds 1000; $t = T; $cur = $t.status | ConvertTo-Json -Compress; if ($cur -eq $prev) { $same++ } else { $same = 0; $prev = $cur } }',
    "if ($same -lt 3) { 'skip unsettled'; exit }",
    "$st = [string]$t.status.state; if ($st -ne 'done' -and $st -ne 'idle') { 'skip state ' + $st; exit }",
    '[void]$k::FreeConsole()',
    "if (-not $k::AttachConsole([uint32]$target)) { 'skip attach ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error(); exit }",
    // GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, OPEN_EXISTING
    "$h = $k::CreateFileW('CONOUT$', [uint32]3221225472, [uint32]3, [IntPtr]::Zero, [uint32]3, [uint32]0, [IntPtr]::Zero)",
    "if ($h.ToInt64() -eq -1) { 'skip open ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error(); exit }",
    '$w = [uint32]0; $ok = $k::WriteFile($h, $bytes, [uint32]$bytes.Length, [ref]$w, [IntPtr]::Zero); [void]$k::CloseHandle($h)',
    "if (-not $ok) { 'skip write ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error(); exit }",
    "'ok ' + $target",
    "} catch { 'error ' + $_.Exception.Message }",
  ].join('\n')
}

export function markArgv(exe, msg) {
  return [exe, ...FLAGS, markScript(msg)]
}
