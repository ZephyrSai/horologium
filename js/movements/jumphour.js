// Jumping hour and retrograde minutes on the 6497-type base. The hour disc snaps forward in
// milliseconds at the top of the hour; the minute hand sweeps a 180° fan and flies back.
import base from './unitas6497.js';

export default {
  ...base,
  id: 'jump-retro',
  name: 'Jump Hour · Retrograde',
  subtitle: 'Digital jumping hour and a 180° flyback minute hand',
  category: 'Displays',
  era: '1830s → today',
  blurb: 'Two of the most theatrical displays in watchmaking on one dial: an hour disc that jumps instantly under a window at twelve, and a minute hand that sweeps a half-circle and then flies back to zero.',
  swatch: ['#efe7d6', '#2c2418'],
  story: [
    'Both displays store energy and release it all at once. A snail cam on the cannon pinion slowly lifts a lever or rack through the hour; at sixty minutes it drops off the snail\'s step.',
    'For the hour, that drop lets a spring-loaded jumper advance a 12-point star by one tooth. For the minutes, a toothed rack follows the snail and turns the hand pinion; when it falls, a return spring flicks the hand back across 180° in a few hundredths of a second.',
    'Use the 60× speed and watch the top of the hour.',
  ],
  specs: { ...base.specs, jewels: 19, extra: { Display: 'Jumping hour + retrograde minutes' } },
  dial: { ...base.dial, noHands: true, subSeconds: 'fourth', story: 'Hour in the window, minutes on the fan. The small seconds keep running over the fourth wheel at nine o\'clock.' },
  complications: [{ type: 'jumpHourRetro', brand: 'HOROLOGIUM', dialColor: '#efe8d8', discColor: '#f6f1e4', handMat: 'blued' }],
};
