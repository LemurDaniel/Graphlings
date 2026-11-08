// NOTE:
//   The monsters of Graphlings: one cute vector creature per graphling type and the mascot.
//   Plain markup strings, the engine puts them into the avatar of a card (see engine.cards.js).
//   The monsters sit on the top left corner of their card and look over its edge, so they
//   are drawn larger than the card head (64x64) and placed by CSS (style.css, "Monsters").
//
//   import { MONSTERS, MASCOT } from './monsters.graph.js'
//   DEFINITIONS.push({ ..., node: { avatar: MONSTERS.workshop, ... } })
//
//   Every monster has its own colour, a furry body with a soft gradient and a gloss, big glossy
//   eyes, a mouth with teeth, two feet, two arms and one accessory that says what the graphling
//   does. Hidden parts appear on cue (style.css and monsters.live.js):
//       m-think    three dots while the node runs
//       m-stars    sparkles when the node is done
//       m-tongue   a trick when the monster is clicked
//   Moving parts carry classes that style.css animates: m-blink, m-gaze, m-limb, m-wave,
//   m-look, m-spin, m-wiggle, m-squeeze, m-pencil.
//

//
//   Chapters:
//     HELPERS     Shared parts: frame, fur, eyes, limbs, feet, mouths, cues.
//     MONSTERS    The creatures: agent, summarizer, workshop, switch, helper agent.
//     MASCOT      The big monster in the page header.
//

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   svg       Opens a 64x64 drawing with the colour class and the body gradient of the monster.
//   fur       Tufts all around an ellipse, drawn behind the body.
//   gloss     A soft highlight on the upper left of the body.
//   eye       A glossy eye: white, pupil and shine. The pupil follows the pointer (m-gaze).
//   limb      An arm with a hand, rotates at the shoulder.
//   feet      Two stubby feet and the shadow under them.
//   grin      A wide open mouth with teeth.
//   smile     A small closed smile.
//   cues      The hidden parts: thinking dots, stars and the tongue.
//

function svg(name, inner) {
    return `<svg viewBox="0 0 64 64" class="m m-${name}" aria-hidden="true">`
        + `<defs><radialGradient id="m-grad-${name}" cx="38%" cy="30%" r="75%">`
        + '<stop offset="0" class="m-stop-light"/><stop offset="0.55" class="m-stop-base"/><stop offset="1" class="m-stop-dark"/>'
        + '</radialGradient></defs>'
        + inner
        + '</svg>'
}

// Tufts around an ellipse: small triangles whose base sits on the outline and whose tip points out.
//   fur(32, 33, 21, 21, 14)  => 14 tufts around a circle of radius 21
function fur(cx, cy, rx, ry, count, length = 4) {
    const tufts = []
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2 + 0.17
        const spread = 0.11
        const base1 = [cx + Math.cos(angle - spread) * rx, cy + Math.sin(angle - spread) * ry]
        const base2 = [cx + Math.cos(angle + spread) * rx, cy + Math.sin(angle + spread) * ry]
        const tip = [cx + Math.cos(angle) * (rx + length), cy + Math.sin(angle) * (ry + length)]
        tufts.push(`M${base1.map(round)}L${tip.map(round)}L${base2.map(round)}z`)
    }
    return `<path class="m-fur" d="${tufts.join('')}"/>`
}

const round = value => Number(value.toFixed(1))

function gloss(cx, cy, rx = 6, ry = 3.4) {
    return `<ellipse class="m-gloss" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(-28 ${cx} ${cy})"/>`
}

function eye(cx, cy, r) {
    return `<g class="m-eye m-blink" style="transform-origin:${cx}px ${cy}px">`
        + `<circle class="m-white" cx="${cx}" cy="${cy}" r="${r}"/>`
        + '<g class="m-gaze">'
        + `<circle class="m-pupil" cx="${cx}" cy="${cy}" r="${round(r * 0.5)}"/>`
        + `<circle class="m-shine" cx="${round(cx - r * 0.3)}" cy="${round(cy - r * 0.35)}" r="${round(r * 0.2)}"/>`
        + '</g></g>'
}

function limb(side, x1, y1, x2, y2, extraClass = '') {
    return `<g class="m-limb m-limb-${side} ${extraClass}" style="transform-origin:${x1}px ${y1}px">`
        + `<path class="m-arm" d="M${x1} ${y1}L${x2} ${y2}"/><circle class="m-hand" cx="${x2}" cy="${y2}" r="3.4"/>`
        + '</g>'
}

function feet(cy, spread = 8) {
    return `<ellipse class="m-shadow" cx="32" cy="${cy + 3}" rx="${spread + 9}" ry="2.4"/>`
        + `<ellipse class="m-foot" cx="${32 - spread}" cy="${cy}" rx="5.5" ry="3.2"/>`
        + `<ellipse class="m-foot" cx="${32 + spread}" cy="${cy}" rx="5.5" ry="3.2"/>`
}

function grin(cy, width, teeth = 2) {
    const half = width / 2
    const toothWidth = 3.4
    const gap = (width - teeth * toothWidth) / (teeth + 1)
    const teethMarkup = Array.from({ length: teeth }, (_, index) => {
        const x = 32 - half + gap * (index + 1) + toothWidth * index
        return `<rect class="m-tooth" x="${x.toFixed(1)}" y="${cy + 0.4}" width="${toothWidth}" height="3.4" rx="0.8"/>`
    }).join('')
    return `<path class="m-mouth" d="M${32 - half} ${cy}q${half} ${width * 0.42} ${width} 0z"/>${teethMarkup}`
        + `<path class="m-tongue" d="M${32 - half * 0.45} ${cy + 2}q${half * 0.45} ${width * 0.28} ${half * 0.9} 0z"/>`
}

function smile(cy, width) {
    const half = width / 2
    return `<path class="m-smile" d="M${32 - half} ${cy}q${half} ${width * 0.45} ${width} 0"/>`
        + `<path class="m-tongue" d="M${32 - half * 0.5} ${cy + 1.5}q${half * 0.5} ${width * 0.45} ${half} 0z"/>`
}

// Thinking dots over the head and stars around it, both hidden until style.css shows them.
function cues(headTop) {
    const y = headTop - 4
    return `<g class="m-think"><circle cx="46" cy="${y + 4}" r="1.6"/><circle cx="51" cy="${y}" r="2.1"/><circle cx="57" cy="${y - 5}" r="2.7"/></g>`
        + '<g class="m-stars">'
        + star(10, headTop + 2, 3.2) + star(54, headTop - 2, 4) + star(30, headTop - 9, 2.6)
        + '</g>'
}

function star(cx, cy, r) {
    const points = []
    for (let index = 0; index < 10; index++) {
        const radius = index % 2 === 0 ? r : r * 0.45
        const angle = (index / 10) * Math.PI * 2 - Math.PI / 2
        points.push(`${round(cx + Math.cos(angle) * radius)},${round(cy + Math.sin(angle) * radius)}`)
    }
    return `<polygon class="m-star" points="${points.join(' ')}"/>`
}

// ===========================================================================
// ===============================   MONSTERS   ==============================
// ===========================================================================
//
//   agent       Sky blue cyclops with an antenna, waves: it talks to the model.
//   summarize   Tall purple one with glasses, squeezes a stack of papers.
//   workshop    Wide orange one with a hard hat, wiggles a wrench.
//   router      Pink one with three eyes that look around, and arrow horns.
//   helper      Small lime one with a propeller cap and a pencil: its own notepad.
//

export const MONSTERS = {
    agent: svg('agent',
        feet(55)
        + '<path class="m-line" d="M32 13V5"/><circle class="m-bulb" cx="32" cy="4.5" r="3.2"/>'
        + fur(32, 33, 20.5, 20.5, 13)
        + limb('left', 14, 40, 7, 47)
        + limb('right', 50, 38, 59, 27, 'm-wave')
        + '<path class="m-body" d="M32 12c-13 0-21 9-21 21 0 9 5 16 13 20h16c8-4 13-11 13-20 0-12-8-21-21-21z"/>'
        + gloss(22, 20)
        + eye(32, 31, 9.5)
        + grin(42, 18, 2)
        + cues(12)),

    summarize: svg('summarize',
        feet(56, 7)
        + '<path class="m-horn" d="M23 13l-4-9 9 5zM41 13l4-9-9 5z"/>'
        + fur(32, 33, 16.5, 24.5, 15)
        + limb('left', 15, 44, 8, 52)
        + '<path class="m-body" d="M32 8c-11 0-17 10-17 24s6 25 17 25 17-11 17-25S43 8 32 8z"/>'
        + gloss(24, 17, 5, 3)
        + eye(25, 27, 6) + eye(39, 27, 6)
        + '<circle class="m-glass" cx="25" cy="27" r="8"/><circle class="m-glass" cx="39" cy="27" r="8"/><path class="m-glass" d="M33 26.5h-2"/>'
        + smile(39, 10)
        + '<g class="m-squeeze" style="transform-origin:46px 58px">'
        + '<rect class="m-paper" x="39" y="42" width="14" height="16" rx="1.6"/><path class="m-paper-lines" d="M42 46.5h8M42 50h8M42 53.5h5"/>'
        + limb('right', 46, 42, 46, 46) + '</g>'
        + cues(8)),

    workshop: svg('workshop',
        feet(57, 10)
        + fur(32, 37, 23.5, 20.5, 15)
        + limb('left', 12, 46, 5, 52)
        + '<path class="m-body" d="M32 16c-15 0-24 8-24 20 0 10 6 17 14 21h20c8-4 14-11 14-21 0-12-9-20-24-20z"/>'
        + gloss(20, 27, 5.5, 3)
        + '<path class="m-hat" d="M14 23c0-9 8-14 18-14s18 5 18 14z"/><rect class="m-hat" x="9" y="22" width="46" height="4.5" rx="2"/>'
        + eye(24, 34, 6.2) + eye(40, 34, 6.2)
        + grin(45, 22, 3)
        + '<g class="m-wiggle" style="transform-origin:51px 50px">'
        + '<path class="m-tool" d="M51 50l9-10"/><path class="m-tool" d="M63 35.5a5.2 5.2 0 1 0-5.2 8.4"/>'
        + limb('right', 51, 50, 51, 50) + '</g>'
        + cues(9)),

    router: svg('router',
        feet(55)
        + '<path class="m-horn" d="M21 20c-7-3-10-9-8-15 3 4 7 6 10 9zM43 20c7-3 10-9 8-15-3 4-7 6-10 9z"/>'
        + fur(32, 35, 19.5, 20.5, 13)
        + '<g class="m-limb m-limb-left m-point-left" style="transform-origin:12px 40px"><path class="m-arm" d="M12 40H3"/><path class="m-arrow" d="M6 36.5L2 40l4 3.5"/></g>'
        + '<g class="m-limb m-limb-right m-point-right" style="transform-origin:52px 40px"><path class="m-arm" d="M52 40h9"/><path class="m-arrow" d="M58 36.5L62 40l-4 3.5"/></g>'
        + '<path class="m-body" d="M32 14c-12 0-20 9-20 21 0 9 5 15 12 19h16c7-4 12-10 12-19 0-12-8-21-20-21z"/>'
        + gloss(22, 23, 5.5, 3)
        + '<g class="m-look">' + eye(21, 32, 5) + eye(32, 28, 6.5) + eye(43, 32, 5) + '</g>'
        + '<circle class="m-mouth" cx="32" cy="44" r="3.2"/>'
        + '<path class="m-tongue" d="M30 45q2 4 4 0z"/>'
        + cues(14)),

    helper: svg('helper',
        feet(56, 7)
        + '<g class="m-spin" style="transform-origin:32px 8px"><path class="m-line" d="M32 16V9"/><ellipse class="m-blade" cx="32" cy="8" rx="8.5" ry="2.2"/></g>'
        + fur(32, 39, 15.5, 16.5, 11, 3.5)
        + limb('left', 16, 46, 9, 51)
        + '<path class="m-body" d="M32 22c-10 0-16 7-16 16 0 7 4 12 10 16h12c6-4 10-9 10-16 0-9-6-16-16-16z"/>'
        + gloss(24, 31, 4.5, 2.6)
        + '<path class="m-cap" d="M20 29c0-7 5-12 12-12s12 5 12 12z"/><path class="m-cap-line" d="M32 17v12"/>'
        + eye(26, 37, 5) + eye(38, 37, 5)
        + smile(46, 9)
        + '<g class="m-pencil" style="transform-origin:48px 54px"><path class="m-wood" d="M48 56l10-12"/><path class="m-tip" d="M58 44l2.5-3"/>'
        + limb('right', 47, 48, 49, 54) + '</g>'
        + cues(18)),
}

// ===========================================================================
// ================================   MASCOT   ===============================
// ===========================================================================
//
//   MASCOT   The orange monster of the header: horns, fur, a toothy grin and a waving arm.
//

export const MASCOT = svg('mascot',
    feet(56, 9)
    + '<path class="m-horn" d="M20 16l-6-11 11 6zM44 16l6-11-11 6z"/>'
    + fur(32, 33, 21.5, 22.5, 15)
    + limb('left', 12, 40, 5, 46)
    + limb('right', 52, 36, 61, 24, 'm-wave')
    + '<path class="m-body" d="M32 10c-14 0-22 10-22 23 0 10 6 17 14 21h16c8-4 14-11 14-21 0-13-8-23-22-23z"/>'
    + '<ellipse class="m-belly" cx="32" cy="44" rx="10" ry="6"/>'
    + gloss(21, 20)
    + eye(24, 29, 7) + eye(40, 29, 7)
    + grin(40, 20, 3)
    + cues(10))
