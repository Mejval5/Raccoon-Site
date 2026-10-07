// The ragdoll body (V2-PLAN 14, Spelunky style). A limp octopus (octopus.js enterRagdoll; death is limp for good) is a
// physics prop (props.js PK_BODY): it sinks, bounces off the traced rock, rolls down slopes, sleeps when still and collides
// with the other props. Everything that hits or shoves the octopus (enemies, hazards, blasts, jets) keeps writing the
// octopus record's velocity; sync() hands those changes to the body and copies the body back, so both sides see one body.
// When the octopus recovers (exitRagdoll) the prop is removed and it swims on from where the body lies.
//
// main.js order per step: stepOctopus, update (adds / removes the prop), ..., sync, props.step, sync(dt), ..., sync.
import { PK_BODY, PS_FREE } from './props.js';

const RAD2DEG = 180 / Math.PI;
const KEEL_SPIN = 2.5;   // rad/s: it keels over as it goes limp
const ROLL_GRIP = 10;    // 1/s: how fast the spin matches rolling along a floor
const SPIN_DRAG = 0.9;   // 1/s: the spin dies down in open water

export function createRagdoll() {
  const st = { vx: 0, vy: 0, failed: false }; // the octopus velocity at the last sync; no room for the prop this time

  /** Merge the velocity changes made to the octopus record since the last sync into the body, then copy the body back.
   * With `dt` (right after the props step) it also turns the body: rolling along a floor, a slow tumble in open water. */
  function sync(octo, props, dt = 0) {
    const i = octo.bodyIdx;
    if (i < 0) return;
    const d = props.data;
    if (!d.alive[i] || d.kind[i] !== PK_BODY) { octo.bodyIdx = -1; return; }
    const dvx = octo.vx - st.vx, dvy = octo.vy - st.vy;
    if (dvx * dvx + dvy * dvy > 1e-8) { d.vx[i] += dvx; d.vy[i] += dvy; props.wake(i); }
    octo.x = d.x[i]; octo.y = d.y[i]; octo.vx = d.vx[i]; octo.vy = d.vy[i];
    st.vx = octo.vx; st.vy = octo.vy;
    if (dt > 0) {
      if (d.state[i] !== PS_FREE) octo.spin = 0; // asleep
      else if (d.grounded[i]) octo.spin += (d.vx[i] / octo.radius - octo.spin) * Math.min(1, dt * ROLL_GRIP); // rolls with the floor
      else octo.spin *= Math.exp(-SPIN_DRAG * dt);
      octo.angle = (octo.angle + octo.spin * dt * RAD2DEG) % 360;
    }
  }

  return {
    state: st,
    sync,
    /** After the octopus moved: a limp one gets its body prop, one that recovered loses it. Returns true while there is a body. */
    update(octo, props) {
      // a pinned death (Damage model: impaled, splat, ...: `octo.deathStyle`) holds the body where it is: no ragdoll
      if (octo.limp && !octo.deathStyle) {
        if (octo.bodyIdx < 0 && !st.failed) {
          const i = props.add(PK_BODY, octo.x, octo.y, octo.vx, octo.vy, { radius: octo.radius });
          if (i < 0) st.failed = true; // no room: the plain limp drift (octopus.js) takes over
          else {
            octo.bodyIdx = i;
            st.vx = octo.vx; st.vy = octo.vy;
            octo.spin = (octo.vx >= 0 ? 1 : -1) * KEEL_SPIN;
          }
        }
      } else if (octo.bodyIdx >= 0) {
        if (!octo.limp) sync(octo, props);
        props.remove(octo.bodyIdx);
        octo.bodyIdx = -1;
      } else st.failed = false;
      return octo.bodyIdx >= 0;
    },
    /** Move the body (test / debug teleport). */
    place(octo, props, x, y) {
      const i = octo.bodyIdx;
      if (i < 0) return;
      const d = props.data;
      d.x[i] = x; d.y[i] = y; d.vx[i] = d.vy[i] = 0; st.vx = st.vy = 0; props.wake(i);
    },
  };
}
