// NOTE:
//   Writes docs/teaser.svg, the picture at the top of the README: the mascot, the title,
//   the five graphlings on small cards and an "AI generated" badge. Built from the real
//   monster drawings and their styles, so it always matches the app. The CSS animations
//   survive in an <img>, so the monsters bob and blink in the README too.
//
//   node tools/make.teaser.mjs            # -> docs/teaser.svg
//

//
//   Chapters:
//     COLLECT    Monsters, their styles and the card colours from the sources.
//     DRAW       The picture, piece by piece.
//     WRITE      docs/teaser.svg.
//

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MASCOT, MONSTERS } from '../web/src/monsters.graph.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(ROOT, 'docs', 'teaser.svg')
const WIDTH = 1200
const HEIGHT = 420

// ===========================================================================
// ===============================   COLLECT   ===============================
// ===========================================================================
//
//   monsterStyles   The monster section of style.css, without the reduced-motion block.
//   CARDS           One card per graphling: colour, title and kind.
//

const style = fs.readFileSync(path.join(ROOT, 'web', 'style.css'), 'utf8')
const start = style.indexOf('.mascot-svg, .m {')
const end = style.indexOf('/* Fewer moving parts')
if (start < 0 || end < 0) throw new Error('style.css: the monster section was not found')
const monsterStyles = style.slice(start, end)

const CARDS = [
    { monster: 'agent', colour: '#58c25a', title: 'Agent', kind: 'fragt das Modell' },
    { monster: 'summarize', colour: '#3fb8af', title: 'Zusammenfasser', kind: 'fasst zusammen' },
    { monster: 'workshop', colour: '#e8a33d', title: 'Werkstatt', kind: 'Werkzeugkasten' },
    { monster: 'router', colour: '#ff6f91', title: 'Weiche', kind: 'entscheidet den Weg' },
    { monster: 'helper', colour: '#8fbc5a', title: 'Hilfsagent', kind: 'eigener Zettel' },
]

// ===========================================================================
// =================================   DRAW   ================================
// ===========================================================================
//
//   placed     A monster drawing at a position and size.
//   card       A small card with its monster on the top left corner.
//   badge      The "AI generated" pill, top right.
//   teaser     The whole picture.
//

// The monster is an <svg viewBox="0 0 64 64">: nested in the picture, it only needs x, y and a size.
function placed(markup, x, y, size) {
    return markup.replace('<svg viewBox="0 0 64 64"', `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64"`)
}

function card({ monster, colour, title, kind }, x, y) {
    const dark = `color-mix(in srgb, ${colour} 70%, black)`
    return `<g>
        <rect x="${x}" y="${y}" width="190" height="96" rx="18" fill="${colour}"/>
        <rect x="${x}" y="${y + 88}" width="190" height="8" rx="4" fill="${dark}" opacity="0.6"/>
        <text x="${x + 60}" y="${y + 36}" class="title">${title}</text>
        <text x="${x + 60}" y="${y + 56}" class="kind">${kind}</text>
        <rect x="${x + 18}" y="${y + 70}" width="70" height="16" rx="8" fill="rgba(0,0,0,0.22)"/>
        <rect x="${x + 96}" y="${y + 70}" width="52" height="16" rx="8" fill="rgba(0,0,0,0.22)"/>
        ${placed(MONSTERS[monster], x - 22, y - 46, 86)}
    </g>`
}

function badge(x, y) {
    return `<g>
        <rect x="${x}" y="${y}" width="150" height="34" rx="17" fill="#2b2440" opacity="0.85"/>
        <text x="${x + 75}" y="${y + 22}" class="badge">AI generated</text>
    </g>`
}

function teaser() {
    const cards = CARDS.map((entry, index) => card(entry, 70 + index * 215, 240)).join('\n')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Graphlings: Agents und Graphen zum Zusammenstecken">
    <style>
        .title { font: 700 15px "Segoe UI", system-ui, sans-serif; fill: #fff; }
        .kind { font: 500 12px "Segoe UI", system-ui, sans-serif; fill: #fff; opacity: 0.9; }
        .headline { font: 800 56px "Segoe UI", system-ui, sans-serif; fill: #2b2440; }
        .tagline { font: 500 22px "Segoe UI", system-ui, sans-serif; fill: #7a7290; }
        .badge { font: 600 14px "Segoe UI", system-ui, sans-serif; fill: #fff; text-anchor: middle; letter-spacing: 0.3px; }
        ${monsterStyles}
    </style>
    <defs>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="1.4" fill="#eadfce"/>
        </pattern>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" rx="28" fill="#fff8ee"/>
    <rect width="${WIDTH}" height="${HEIGHT}" rx="28" fill="url(#dots)"/>

    ${placed(MASCOT, 60, 36, 150)}
    <text x="230" y="110" class="headline">Graphlings</text>
    <text x="232" y="160" class="tagline">Agents und Graphen zum Zusammenstecken.</text>
    ${badge(WIDTH - 180, 28)}

    ${cards}
</svg>
`
}

// ===========================================================================
// =================================   WRITE   ===============================
// ===========================================================================

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
fs.writeFileSync(OUTPUT, teaser())
console.log(`${path.relative(ROOT, OUTPUT)} written`)
