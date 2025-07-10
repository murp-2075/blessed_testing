import blessed from "blessed";
import contrib from "blessed-contrib";
import { PassThrough } from "node:stream";
import type { ServerWebSocket } from "bun";

/* ------------------------------------------------------------------
   Blessed‑over‑WebSocket demo for Bun
   – Static files from ./public
   – /term WebSocket streams ANSI
   – No PTY, no shell, just Blessed
   ------------------------------------------------------------------ */

const dec = new TextDecoder();


function makeWebSocketHandlers() {
  return {
    perMessageDeflate: false,

    /* ------------------------------------------------------------------
       Socket open – set up a fake TTY and a Blessed screen that speaks
       24‑bit xterm… and ask Blessed to enable mouse tracking.
       ------------------------------------------------------------------ */
    open(ws: ServerWebSocket) {
      // ────────────────────────────────────────────────────────────── TTY
      const stdin = new PassThrough();
      const stdout = new PassThrough();

      // Pretend we are a colour TTY so Blessed will emit colour & mouse
      Object.assign(stdout, {
        isTTY: true,
        columns: 200,
        rows: 50,
        getColorDepth: () => 24,
        hasColors: () => true,
      });

      stdout.on("data", (chunk: any) => {
        ws.send(chunk);
      });

      // ────────────────────────────────────────────────────── Blessed UI
      const screen = blessed.screen({
        smartCSR: true,
        mouse: true,           // <‑‑ ask Blessed to DECSET 1006h
        keys: true,
        sendFocus: true,
        input: stdin,
        output: stdout,
        terminal: "xterm-256color",
        fullUnicode: true,
        autoPadding: true,
        warnings: false,
        width: "100%",
        title: "My Blessed Window",
        height: "100%"
      });

      const grid = new contrib.grid({ rows: 12, cols: 12, screen });
      
      const pic = grid.set(6, 6, 6, 6, contrib.picture, 
        {
          file: './flower.png',
          cols: 22,
          // type: 'overlay',
          draggable: true,
          rows: 25,
          height: "shrink",
          width: "shrink",
          onReady: ready

        })
      function ready() { screen.render() }

      function series() {
        return Array.from({ length: 4 }, () => Math.floor(Math.random() * 10))
      }

      const series1 = function () {
        const y = series()
        return {
          title: 'pixels',
          x: ['t1', 't2', 't3', 't4'],
          y: y
        }
      }
      const series2 = function () {
        const y = series()
        return {
          title: 'hotness',
          x: ['t1', 't2', 't3', 't4'],
          y: y,
          style: { line: "red" }
        }
      }


      const char = grid.set(0, 6, 6, 6, contrib.line, {
        style:
          { line: "yellow", text: "green", baseline: "black" }
        , xLabelPadding: 3
        , xPadding: 5
        , showLegend: true
        , wholeNumbersOnly: false //true=do not show fraction in y axis
        , label: 'Title'
      })

      char.setData([series1(), series2()])
      setInterval(() => {
        char.setData([series1(), series2()])
        screen.render()
      }, 1000)



      const chatBox = grid.set(0, 0, 10, 6, blessed.box, {
        label: ' Chat ',
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: { ch: ' ', inverse: true },
        keys: true,
        mouse: true,
        border: 'line',
      });

      // 2/12 rows for the prompt
      const inputBox = grid.set(10, 0, 2, 6, blessed.textbox, {
        label: ' > ',
        inputOnFocus: true,
        height: 1,
        padding: { left: 2 },
        border: 'line',
      });
      inputBox.focus();
      inputBox.on('submit', async (line: string) => {
        if (!line.trim()) return reset();

        // 1. echo user line
        append(`{green-fg}You:{/} ${line}`);
        reset();

        // 2. 🚀 send to LLM (fake async here)
        const reply = `This is an llm response ${line}`// await fetchLLM(line);       // <- your websocket/Bun glue
        append(`{yellow-fg}Assistant:{/} ${reply}`);
        return false
      });


      let nextLineTop = 0;                 // tracks vertical position in chatBox

      function append(text: string, color: string = "white") {
        // create a 1-line widget
        const line = blessed.box({
          parent: chatBox,
          top: nextLineTop,
          height: 1,
          width: "100%-2",      // leave room for scrollbar
          tags: true,
          mouse: true,
          content: text,
          style: { fg: color },
        });

        // click handler – open an editor prompt
        line.on("click", () => {
          inputBox.cancel();
          setTimeout(() => editLine(line));
        })

        nextLineTop += Number(line.height);        // advance cursor
        chatBox.children.forEach((ch: any) => ch.width = "100%-2"); // keep widths after resize
        chatBox.setScrollPerc(100);
        screen.render();
      }

      function editLine(line: blessed.Widgets.BoxElement) {
        const prompt = blessed.prompt({
          parent: screen,
          border: "line",
          label: " Edit message ",
          height: 5,
          width: "80%",
          top: "center",
          left: "center",
          tags: true,
          keys: true,
          mouse: true,
          inputOnFocus: true,
        });

        prompt.input("New text:", line.content, (err: any, value: any) => {
          if (!err && value != null) {
            line.setContent(value);
          }
          prompt.destroy();
          screen.render();
          inputBox.focus();
        });
      }

      function reset() {
        inputBox.clearValue();
        inputBox.focus();
        screen.render();
      }

      const btn = blessed.button({
        parent: screen,
        mouse: true,
        keys: true,
        shrink: true,              // let the content decide size
        padding: { left: 2, right: 2 },
        border: 'line',
        left: 'left+2',
        top: 'center',
        content: ' Test button ',
      })
      btn.on('press', () => {
        append('Test button clicked');
      });


      (ws as any).data = { stdin, stdout, screen, buf: "", demoBox: null } as const;
    },

    /* ------------------------------------------------------------------
       Every message from the browser: handle resize packets first, then
       push the rest into stdin so Blessed can parse keys *and* mouse.
       ------------------------------------------------------------------ */
    message(ws: ServerWebSocket, raw: string | Buffer) {
      const state = ws.data as any;

      // ────────── 0xFF‑prefixed resize packet "\xFF<cols>,<rows>"
      if (raw instanceof Uint8Array && raw[0] === 0xff) {
        const [cols, rows] = dec.decode(raw.subarray(1)).split(",").map(Number);
        state.stdout.columns = cols;
        state.stdout.rows = rows;
        state.screen.program.cols = cols;
        state.screen.program.rows = rows;
        state.screen.program.emit("resize");
        state.screen.render();
        return;
      }

      const data = typeof raw === "string" ? raw : dec.decode(raw);
      // Feed every byte to Blessed (keyboard, mouse, paste…)
      state.stdin.push(data);

      state.screen.render();
    },

    /* ------------------------------------------------------------------
       Clean up.
       ------------------------------------------------------------------ */
    close(ws: ServerWebSocket) {
      const s = ws.data as any;
      try {
        s.screen.program.disableMouse?.();
        s.screen.destroy();
      } catch { }
    },
  } as const;
}

/* ------------------------------------------------------------------
   HTTP + WebSocket server
   ------------------------------------------------------------------ */
Bun.serve({
  port: 3000,
  websocket: makeWebSocketHandlers(),
  routes: {
    "/": () => new Response(Bun.file("./public/index.html")),
    "/client.js": () => new Response(Bun.file("./public/client.js")),
    "/client.css": () => new Response(Bun.file("./public/client.css")),
    "/term": (req, server) => {
      if (server.upgrade(req)) return;
      return new Response("Not Found", { status: 404 });
    },
  },
});

console.log("▶️  Blessed server running at http://localhost:3000");
