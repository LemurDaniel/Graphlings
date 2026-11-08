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
    type: 'graphlings_node_tools',
    colour: '#e8a33d',
    parts: ['🔧 Werkstatt', text('NAME', 'werkstatt')],
    node: {
        kind: 'Graphling · Werkzeugkasten',                  // small line under the title
        title: ({ block }) => block.fields.NAME,
        hasInput: true,                                     // puzzle notch on the left: flow edges end here
        outputs: () => [{ port: 'out' }],                   // puzzle noses on the right: flow edges start here
        provides: 'workshop',                               // knob on top: use links of the same name end here
        uses: [{ port: 'tools', label: '🔧 Werkzeuge', accepts: 'tool', multiple: true }],  // sockets at the bottom
        chips: ({ block, workspace }) => ['🔧 3 Werkzeuge'], // small badges on the card
    },
    explain: 'Text for the code panel.',
}
```

Two kinds of edges, both in `workspace.edges`:

| Kind | Line | From → to |
| --- | --- | --- |
| `flow` | solid, with optional bend `points` | an `outputs` port → a card with `hasInput` |
| `use` | dotted | a `uses` socket → a card that `provides` what the socket `accepts` |

A resource card (model, notepad, tool) sets `shape: 'resource'` and `emoji` and has only `provides`.
A card can be both: the workshop is a step in the flow and a resource for agents.

A piece has `fits` instead of `node` and goes into every slot whose `accepts` has the same name.
