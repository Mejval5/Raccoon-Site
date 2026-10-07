// V2-PLAN 16: currency shells by value. One table, read by pickups.js (what a placed or dropped shell is worth and how it
// looks), loot / chests (a sum of shells is paid out in the fewest natural pieces) and the giant clam's pearl.
//   cowrie   1  small, common
//   conch    5  spiral conch, uncommon
//   nautilus 15 big chambered shell, rare
//   pearl    30 only inside a giant clam (creatures.js), never placed loose
// (Owner: damage model. The drawing lives in shells-draw / render.js; the art is natural, no glossy gem look.)

export const SK_COWRIE = 1, SK_CONCH = 2, SK_NAUTILUS = 3, SK_PEARL = 4;
export const SHELL_NAMES = ['', 'cowrie', 'conch', 'nautilus', 'pearl'];
export const SHELL_VALUE = [0, 1, 5, 15, 30];
export const PEARL_VALUE = SHELL_VALUE[SK_PEARL];
