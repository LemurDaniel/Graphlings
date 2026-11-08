# Web

| File | Content |
| --- | --- |
| `index.html` | The one page: graph workspace, foldable code panel, start button with the chat popup. |
| `style.css` | Look of the page, light and dark. |
| `src/app.js` | Wires editor, code panel, explanations and the Python bridge. |
| `src/blocks.graph.js` | The graph blocks as data, their explanations and the palette. |
| `src/i18n.js` | Picks the language (environment, localStorage, browser) and reads texts with `t()`. |
| `src/texts.js` | Every visible text in German and English, by key. |
| `src/monsters.graph.js` | The SVG monsters: one per graphling type and the mascot of the header. |
| `src/monsters.live.js` | Their behaviour: eyes follow the pointer, throw and catch, tricks on click, idle gestures. |
| `src/generator.python.js` | Workspace to plain Python (standard library only), with a line map per block. |
| `src/examples.graph.js` | The example graphs: chat, smart switch, tool agent, reflection. |
| `src/engine/` | The own block engine, see its README. |
