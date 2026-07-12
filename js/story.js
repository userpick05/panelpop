// PANEL POP — Story mode cast: 8 original rivals, escalating AI tiers.
'use strict';

(function () {

var STAGES = [
  {
    name: 'POPPY', tier: 1, color: 0,
    intro: 'HI! I JUST LEARNED TO SWAP. BE GENTLE, OK?',
    win: 'WOW! YOU MADE THE PANELS DANCE!',
    lose: 'TEEHEE! BEGINNERS LUCK!'
  },
  {
    name: 'BOBBLE', tier: 2, color: 1,
    intro: 'BOING! I NEVER STOP BOUNCING OR SWAPPING!',
    win: 'AW, POPPED MY BUBBLE...',
    lose: 'BOING BOING! TOO BOUNCY FOR YA!'
  },
  {
    name: 'TRIG', tier: 3, color: 2,
    intro: 'EVERY ANGLE CALCULATED. YOU CANNOT WIN.',
    win: 'IMPOSSIBLE! MY MATH WAS PERFECT!',
    lose: 'AS CALCULATED. GO STUDY.'
  },
  {
    name: 'STELLA', tier: 4, color: 3,
    intro: 'A STAR IS BORN! TRY TO KEEP UP, DARLING.',
    win: 'MY SPOTLIGHT! YOU STOLE IT!',
    lose: 'SPARKLE SPARKLE! ANOTHER ENCORE!'
  },
  {
    name: 'FACET', tier: 5, color: 4,
    intro: 'PRESSURE MAKES DIAMONDS. LET ME SHOW YOU PRESSURE.',
    win: 'HMPH. FLAWLESS TECHNIQUE... ALMOST.',
    lose: 'YOU CRACKED. DIAMONDS DO NOT.'
  },
  {
    name: 'HEXA', tier: 6, color: 5,
    intro: 'SIX SIDES. SIX COLORS. ZERO MERCY.',
    win: 'A SEVENTH SIDE... DEFEAT. FASCINATING.',
    lose: 'GEOMETRY ALWAYS WINS.'
  },
  {
    name: 'NIMBUS', tier: 7, color: 2,
    intro: 'I AM THE STORM BEFORE THE THRONE. TURN BACK.',
    win: 'THE SKY... CLEARS FOR YOU.',
    lose: 'SWEPT AWAY LIKE A LEAF!'
  },
  {
    name: 'LORD PRISM', tier: 8, color: 4,
    intro: 'ALL COLORS BEND TO ME. YOUR CHAINS ARE NOTHING.',
    win: 'MY SPECTRUM... SHATTERED! THE PANELS ARE FREE!',
    lose: 'KNEEL BEFORE THE PRISM.'
  }
];

// 26x26 procedural portrait: tinted face + shape motif + eyes
function drawPortrait(stageIdx) {
  var st = STAGES[stageIdx];
  var cv = document.createElement('canvas');
  cv.width = 26; cv.height = 26;
  var ctx = cv.getContext('2d');
  var pal = Sprites.palettes[st.color];
  var boss = stageIdx === 7;

  ctx.fillStyle = '#14142a';
  ctx.fillRect(0, 0, 26, 26);
  // head
  ctx.fillStyle = pal.f;
  ctx.fillRect(4, 5, 18, 16);
  ctx.fillStyle = pal.h;
  ctx.fillRect(4, 5, 18, 3);
  ctx.fillStyle = pal.d;
  ctx.fillRect(4, 18, 18, 3);
  // crown for the boss, antenna for nimbus, etc — small silhouette variety
  if (boss) {
    ctx.fillStyle = '#f2ca4e';
    ctx.fillRect(5, 1, 3, 4); ctx.fillRect(11, 0, 4, 5); ctx.fillRect(18, 1, 3, 4);
  } else if (stageIdx === 6) {
    ctx.fillStyle = pal.h;
    ctx.fillRect(12, 1, 2, 4); ctx.fillRect(10, 2, 2, 2); ctx.fillRect(14, 2, 2, 2);
  } else if (stageIdx % 2 === 0) {
    ctx.fillStyle = pal.d;
    ctx.fillRect(8, 2, 10, 3);
  }
  // eyes
  ctx.fillStyle = '#101020';
  var ey = boss ? 11 : 12;
  ctx.fillRect(8, ey, 3, boss ? 2 : 3);
  ctx.fillRect(15, ey, 3, boss ? 2 : 3);
  if (boss) { // angry brows
    ctx.fillRect(7, 9, 4, 1); ctx.fillRect(15, 9, 4, 1);
  }
  // mouth
  ctx.fillRect(11, 17, 4, 1);
  return cv;
}

window.Story = { STAGES: STAGES, drawPortrait: drawPortrait };

})();
