/**
 * flightwake-mod — Claude Code's add-on layer over flightwake's Markdown records (docs/plans/mods.md).
 * register only assembles: each feature lives in its own module under features/ and is switched by its
 * userConfig field. A feature that throws while registering is dropped alone; at run time the engine skips a
 * failing hook and the chain goes on, so one feature's failure never reaches the others or the person's work.
 */
import type { PluginOptions, Register } from 'claude-code'

import { registerStateInject } from './features/state-inject'
import { registerBand } from './features/band'
import { registerRecorder } from './features/recorder'
import { registerTripwire } from './features/tripwire'
import { registerRoleGuard } from './features/role-guard'
import { registerStatus } from './features/status'

/** userConfig field → default, mirrored from .claude-plugin/plugin.json (F5 is opt-in). */
export const DEFAULTS = { stateInject: true, band: true, recorder: true, tripwire: true, roleGuard: false } as const

export const isEnabled = (options: PluginOptions, key: keyof typeof DEFAULTS): boolean =>
  typeof options[key] === 'boolean' ? options[key] === true : DEFAULTS[key]

// Each call is spelled out (not looped over a table): the engine's loader only accepts `on` passed to a function
// imported by name. Each is wrapped so a feature that throws while registering stays off alone.
export const register: Register = (on, options) => {
  if (isEnabled(options, 'stateInject')) try { registerStateInject(on) } catch {} // F1
  if (isEnabled(options, 'band')) try { registerBand(on) } catch {} // F2
  if (isEnabled(options, 'recorder')) try { registerRecorder(on) } catch {} // F3
  if (isEnabled(options, 'tripwire')) try { registerTripwire(on) } catch {} // F4
  if (isEnabled(options, 'roleGuard')) try { registerRoleGuard(on) } catch {} // F5
  // /fw-mod: not a switch — it is how the switches are seen
  try {
    registerStatus(on, {
      stateInject: isEnabled(options, 'stateInject'), band: isEnabled(options, 'band'), recorder: isEnabled(options, 'recorder'),
      tripwire: isEnabled(options, 'tripwire'), roleGuard: isEnabled(options, 'roleGuard'),
    })
  } catch {}
}
