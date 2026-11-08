// NOTE:
//   Brings the monsters to life: their eyes follow the pointer, they throw and catch the
//   notepad when it travels, do a trick when clicked and yawn or scratch now and then.
//   Everything here only adds and removes CSS classes or moves pupils, style.css animates.
//   Requires: the monsters of monsters.graph.js on the cards (engine.cards.js) and the editor.
//
//   import { startMonsterLife } from './monsters.live.js'
//   startMonsterLife({ stage: document.body, editor })
//

//
//   Chapters:
//     HELPERS          Timed classes and card lookups.
//     START LIFE       Wires gaze, travel, clicks and idle gestures.
//

const GAZE_REACH_PX = 160           // from this distance on the pupil sits at its edge
const GAZE_SHIFT = 0.32             // of the eye radius: how far a pupil may move
const TRICK_MS = 1100
const THROW_MS = 700
const CATCH_MS = 900
const GESTURE_MS = 1500
const IDLE_EVERY_MS = 6500
const TRICKS = ['flip', 'tongue', 'wink']
const GESTURES = ['yawn', 'scratch']

// ===========================================================================
// ===============================   HELPERS   ===============================
// ===========================================================================
//
//   flashClass   Adds a class for a moment, so a one-shot CSS animation plays.
//   cardOf       The card element of a node id.
//   pick         A random entry of a list.
//

function flashClass(target, className, duration) {
    if (null == target) return
    target.classList.remove(className)
    // Force a reflow, so the same class restarts its animation when added again right away.
    void target.offsetWidth
    target.classList.add(className)
    setTimeout(() => target.classList.remove(className), duration)
}

function cardOf(stage, nodeId) {
    return stage.querySelector(`.gl-cards .gl-card[data-node-id="${CSS.escape(nodeId)}"]`)
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)]
}

// ===========================================================================
// =============================   START LIFE   ==============================
// ===========================================================================
//
//   1. Gaze       Every pupil turns toward the pointer, a running monster looks up and thinks.
//   2. Travel     The sending card throws, the receiving card catches.
//   3. Tricks     A click on a monster: flip, tongue or wink.
//   4. Idle       Every few seconds one monster on the canvas yawns or scratches its head.
//

/**
 * Starts the behaviour of all monsters inside a root element.
 *
 * @param {object}  options
 * @param {Element} options.stage    (Required) The element that holds cards, palette and mascot.
 * @param {object}  options.editor   (Required) The graph editor, for its 'travel' event.
 *
 * @example
 * startMonsterLife({ stage: document.body, editor })
 */
export function startMonsterLife({ stage, editor }) {

    // ---------------------------------------------------------------------------
    // Gaze
    //   Every pupil turns toward the pointer, a running monster looks up and thinks.
    // ---------------------------------------------------------------------------

    let pointer = null
    let isGazeScheduled = false

    function updateGaze() {
        isGazeScheduled = false
        for (const eye of stage.querySelectorAll('.m-eye')) {
            const gaze = eye.querySelector('.m-gaze')
            if (eye.closest('.gl-card-running')) {
                gaze.style.transform = 'translate(0.6px, -1.8px)'
                continue
            }
            if (null == pointer) {
                gaze.style.transform = ''
                continue
            }

            const white = eye.querySelector('.m-white')
            const rect = white.getBoundingClientRect()
            if (rect.width === 0) continue

            // Screen pixels per drawing unit, so the shift stays inside the eye at any zoom.
            const radius = Number(white.getAttribute('r'))
            const scale = rect.width / (radius * 2)
            const dx = pointer.x - (rect.left + rect.width / 2)
            const dy = pointer.y - (rect.top + rect.height / 2)
            const distance = Math.hypot(dx, dy) || 1
            const shift = radius * GAZE_SHIFT * Math.min(1, distance / (GAZE_REACH_PX * scale))
            gaze.style.transform = `translate(${(dx / distance * shift).toFixed(2)}px, ${(dy / distance * shift).toFixed(2)}px)`
        }
    }

    function scheduleGaze() {
        if (isGazeScheduled) return
        isGazeScheduled = true
        requestAnimationFrame(updateGaze)
    }

    document.addEventListener('pointermove', event => {
        pointer = { x: event.clientX, y: event.clientY }
        scheduleGaze()
    })
    document.addEventListener('pointerleave', () => {
        pointer = null
        scheduleGaze()
    })
    // Cards are re-rendered on every change, the new pupils need the pointer too.
    editor.on('change', scheduleGaze)
    editor.on('select', scheduleGaze)

    // ---------------------------------------------------------------------------
    // Travel
    //   The sending card throws, the receiving card catches.
    // ---------------------------------------------------------------------------

    editor.on('travel', ({ fromId, toId, phase }) => {
        if (phase === 'start') flashClass(cardOf(stage, fromId), 'gl-card-throw', THROW_MS)
        if (phase === 'end') flashClass(cardOf(stage, toId), 'gl-card-catch', CATCH_MS)
    })

    // ---------------------------------------------------------------------------
    // Tricks
    //   A click on a monster: flip, tongue or wink.
    // ---------------------------------------------------------------------------

    stage.addEventListener('click', event => {
        const monster = event.target.closest('.gl-avatar-monster .m, .mascot .m')
        if (null == monster) return
        flashClass(monster, `m-trick-${pick(TRICKS)}`, TRICK_MS)
    })

    // ---------------------------------------------------------------------------
    // Idle
    //   Every few seconds one monster on the canvas yawns or scratches its head.
    // ---------------------------------------------------------------------------

    setInterval(() => {
        if (document.hidden) return
        const monsters = [...stage.querySelectorAll('.gl-cards .gl-card:not(.gl-card-running) .m')]
        if (monsters.length === 0) return
        flashClass(pick(monsters), `m-gesture-${pick(GESTURES)}`, GESTURE_MS)
    }, IDLE_EVERY_MS)
}
