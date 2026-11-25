// Wandering (travelling / satellite) hour on an automatic base. The display is the show:
// three satellite discs with four numerals each ride a carrier turning once every three hours.
import base from './eta2824.js';

export default {
  ...base,
  id: 'wandering-hour',
  name: 'Wandering Hour',
  subtitle: 'Satellite hours sweeping a 120° minute arc',
  category: 'Displays',
  era: '1656 · 1991 · today',
  blurb: 'No hands. The current hour numeral travels along a third of the dial, and where it sits on the 0–60 arc is the minute. Under the dial, three satellites ride a carrier and click forward on a Geneva star — the display used by Campani\'s papal night clocks, AP\'s Star Wheel, Urwerk, and Xeric\'s wandering-hour watches.',
  swatch: ['#e9dcb8', '#151a24'],
  story: [
    'The idea is 17th-century: the Campani brothers built silent "night clocks" for Pope Alexander VII whose pierced numerals, lit by an oil lamp behind the dial, drifted across a semicircle so the time could be read in the dark.',
    'Modern versions put three discs, each with four hours, on a carrier that turns once every three hours. Each satellite crosses the 120° window in exactly sixty minutes. Out of sight, a fixed pin turns its four-armed star by a quarter — so the next time it appears it shows the hour three later.',
    'Turn the watch over to see the satellites; use the 60× or 1 h/s speed to watch them hand over at the top of each hour.',
  ],
  specs: { ...base.specs, jewels: 26, extra: { Display: 'Wandering hour, 3 satellites × 4 numerals', Carrier: '1 turn / 3 h' } },
  look: { ...base.look, rotor: { metal: 'titanium', finish: 'brushed', finishScale: 3 }, bridges: { metal: 'rhodiumDark', finish: 'cotes', finishScale: 2.2, finishAngle: 0.9 } },
  rotor: { ...base.rotor, text: 'WANDERING HOUR', rimMat: 'tungsten', cutouts: [[0, 6.5, 2.6], [-5.2, 4.2, 1.8], [5.2, 4.2, 1.8]] },
  dial: { ...base.dial, noHands: true, centerSeconds: null, story: 'Read the numeral in the window for the hour, its position on the arc for the minutes. The minute track covers exactly one third of the dial.' },
  complications: [
    ...base.complications,
    { type: 'wanderingHour', brand: 'HOROLOGIUM', subtitle: 'WANDERING HOUR', dialColor: '#151a24', carrierR: 7.0, satR: 3.0, discColor: 'rgba(58,70,90,0.98)', numColor: '#f6e6bd', backColor: '#0c1018' },
  ],
  chapters: {
    wandering: { title: 'The satellites', text: 'Three discs, four numerals each — 1·4·7·10, 2·5·8·11, 3·6·9·12 — on a carrier turning once every three hours. A fixed pin under six o\'clock indexes each disc a quarter turn through its star wheel while it is hidden.' },
  },
};
