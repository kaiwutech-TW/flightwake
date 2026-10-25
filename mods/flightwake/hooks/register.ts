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
import { registerSpend } from './features/spend'
import { registerFleet, registerTripLog } from './features/fleet'
import { registerPanel } from './features/panel'

/** userConfig field → default, mirrored from .claude-plugin/plugin.json (F5 is opt-in). */
export const DEFAULTS = { stateInject: true, band: true, recorder: true, tripwire: true, roleGuard: false, spend: true, fleet: true, panel: true } as const

export const isEnabled = (options: PluginOptions, key: keyof typeof DEFAULTS): boolean =>
  typeof options[key] === 'boolean' ? options[key] === true : DEFAULTS[key]

/**
 * `trips` (F4's trip file) is the one field without a default in plugin.json, on purpose: unset, it follows `fleet`,
 * so a person who turned the session file off gets no trip file either until they say otherwise. It only acts while
 * `tripwire` is on (the hints need no file).
 */
export const isTripsEnabled = (options: PluginOptions): boolean =>
  isEnabled(options, 'tripwire') && (typeof options.trips === 'boolean' ? options.trips === true : isEnabled(options, 'fleet'))

// Each call is spelled out (not looped over a table): the engine's loader only accepts `on` passed to a function
// imported by name. Each is wrapped so a feature that throws while registering stays off alone.
export const register: Register = (on, options) => {
  if (isEnabled(options, 'stateInject')) try { registerStateInject(on) } catch {} // F1
  if (isEnabled(options, 'band')) try { registerBand(on) } catch {} // F2
  if (isEnabled(options, 'recorder')) try { registerRecorder(on) } catch {} // F3
  if (isEnabled(options, 'tripwire')) {
    const trips = isTripsEnabled(options)
    // the trip file's writer first, so it sits outside the tripwire and sees this call's new pair (first = outermost)
    if (trips) try { registerTripLog(on) } catch {}
    try { registerTripwire(on, { trips }) } catch {}
  } // F4 (hints; with `trips`, the trip file)
  if (isEnabled(options, 'roleGuard')) try { registerRoleGuard(on) } catch {} // F5
  if (isEnabled(options, 'spend')) try { registerSpend(on) } catch {} // F6
  if (isEnabled(options, 'fleet')) try { registerFleet(on) } catch {} // F7
  if (isEnabled(options, 'panel')) {
    try {
      registerPanel(on, {
        band: isEnabled(options, 'band'), recorder: isEnabled(options, 'recorder'), spend: isEnabled(options, 'spend'), fleet: isEnabled(options, 'fleet'),
      })
    } catch {}
  } // F8
  // /fw-mod: not a switch — it is how the switches are seen
  try {
    registerStatus(on, {
      stateInject: isEnabled(options, 'stateInject'), band: isEnabled(options, 'band'), recorder: isEnabled(options, 'recorder'),
      tripwire: isEnabled(options, 'tripwire'), roleGuard: isEnabled(options, 'roleGuard'), spend: isEnabled(options, 'spend'),
      fleet: isEnabled(options, 'fleet'), panel: isEnabled(options, 'panel'), trips: isTripsEnabled(options),
    })
  } catch {}
}
