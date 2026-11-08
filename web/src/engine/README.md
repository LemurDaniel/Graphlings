# Graph engine

The own graph editor of Graphlings, no third-party code. Cards and pieces are HTML, edges are SVG, the workspace is plain JSON.

| File | Content |
| --- | --- |
| `engine.model.js` | Workspace model: plan, nodes, edges; find, remove, insert, connect; undo history. No DOM, runs in Node. |
| `engine.parts.js` | Parts of a definition: labels, text, number, dropdown, checkbox, slot. |
| `engine.render.js` | Draws a puzzle piece with its rows, fields and slots as HTML. |
| `engine.cards.js` | Draws a node as a card with avatar, chips and puzzle ports, and the curve of an edge. |
| `engine.editor.js` | The editor: palette, canvas, cards, edges, inspector, drag and drop, zoom, keyboard, live status. |
| `engine.css` | Look: cards with puzzle noses and notches, curved edges, pieces, inspector. |

A card definition is data:

```js
{
    type: 'graphlings_router',
    colour: '#ff6f91',
    parts: ['🔀 Weiche', text('NAME', 'zu_lang'), slot('CONDITION', 'Bedingung', 'condition')],
    node: {
        kind: 'Weiche',
        title: ({ block }) => block.fields.NAME,
        hasInput: true,
        outputs: () => [{ port: 'then', label: 'ja' }, { port: 'else', label: 'nein' }],
    },
    explain: 'Text for the explain panel.',
}
```

A piece has `fits` instead of `node` and goes into every slot whose `accepts` has the same name.
