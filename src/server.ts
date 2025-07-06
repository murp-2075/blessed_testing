import * as blessed from "blessed";
import * as contrib from "blessed-contrib";
import { Readable, PassThrough } from "node:stream";
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
      const stdin = new Readable({ read() { } });
      const stdout = new PassThrough();

      // Pretend we are a colour TTY so Blessed will emit colour & mouse
      Object.assign(stdout, {
        isTTY: true,
        columns: 164,
        rows: 50,
        getColorDepth: () => 24,
        hasColors: () => true,
      });

      // Batch screen output → single WS frame per tick
      // let pending = "";
      // let scheduled = false;
      stdout.on("data", chunk => {
        ws.send(chunk);
        // pending += chunk.toString();
        // if (!scheduled) {
        //   scheduled = true;
        //   setTimeout(() => {
        //     ws.send(pending); // TEXT frame
        //     pending = "";
        //     scheduled = false;
        //   }, 0);
        // }
      });

      // ────────────────────────────────────────────────────── Blessed UI
      const screen = blessed.screen({
        smartCSR: true,
        mouse: true,           // <‑‑ ask Blessed to DECSET 1006h
        keys: true,
        input: stdin,
        output: stdout,
        terminal: "xterm-256color",
        fullUnicode: true,
        autoPadding: true,
        warnings: false,
        width: "110%",
        title: "My Blessed Window",
        height: "100%",
      });

      const log = blessed.log({
        parent: screen,
        top: 0,
        left: 0,
        draggable: true,
        transparent: true,
        
        resizeable: true,
        width: "50%",
        height: "100%-12",
        border: { bg: "blue", ch: "*" },
        tags: true,
      });

      const prompt = blessed.box({
        parent: screen,
        bottom: 0,
        scrollable: true,
        left: 0,
        resizeable: true,
        width: "100%",
        height: 10,
        border: { bg: "red", ch: "-" },
        content: "> ",
      });

      var pic = contrib.picture(
        {
          file: './flower.png',
          cols: 12,
          // type: 'overlay',
          draggable: true,
          rows: 25,
          height: "shrink",
          width: "shrink",
          onReady: ready

        })
      screen.append(pic)
      function ready() { screen.render() }

      screen.render();
      // const line = contrib.line(
      //   {
      //     style:
      //     {
      //       line: "yellow"
      //       , text: "green"
      //       , baseline: "black"
      //     }
      //     , xLabelPadding: 3
      //     , xPadding: 5
      //     , label: 'Title'
      //   })
      // const data = {
      //   x: ['t1', 't2', 't3', 't4'],
      //   y: [5, 1, 7, 5]
      // }
      // screen.append(line) //must append before setting data
      // line.setData([data])

      ws.data = { stdin, stdout, screen, log, prompt, buf: "", demoBox: null } as const;
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
        console.log(`Resize → ${cols}×${rows}`);

        state.stdout.columns = cols;
        state.stdout.rows = rows;
        state.screen.program.columns = cols;
        state.screen.program.rows = rows;
        state.screen.program.emit("resize");
        state.screen.render();
        return;
      }

      const data = typeof raw === "string" ? raw : dec.decode(raw);

      // Feed every byte to Blessed (keyboard, mouse, paste…)
      state.stdin.push(data);

      /* --------------------------------------------------------------
         Optional little REPL demo – keeps your prior behaviour alive
         while still letting Blessed see the input.
         -------------------------------------------------------------- */
      if (data === "\r") {
        const cmd = state.buf.trim();
        state.buf = "";
        // send a newline to the Blessed screen
        state.stdout.write("\r\n");

        if (!state.demoBox) {
          state.demoBox = blessed.box({
            parent: state.screen,
            mouse: true,
            scrollable: true,
            keys: true,
            top: 5,
            left: 10,
            width: 40,
            height: 8,
            border: "line",
            name: "demoBox",
            style: { fg: "white", bg: "blue" },
            content: "",
            // content: `Demo button\n\nYou typed: ${cmd || "(empty)"}`,
            tags: true,
          });
        }
        state.demoBox.insertBottom(cmd || "(empty)");
        state.screen.render();

        state.demoBox.on("click", () => {
          state.demoBox.setContent("{center}Some different {red-fg}content{/red-fg}.{/center}");
          state.icon = blessed.image({
            parent: state.screen,
            top: 0,
            left: 0,
            type: 'overlay',
            width: 'shrink',
            height: 'shrink',
            file: './beach.jpg',
            search: false
          });
          state.screen.render();
        });


        state.log.log(`→ {bold}${cmd || "(empty)"}{/}`);
        state.screen.render();
        return;
      }

      if (data === "\u007f") { // BACKSPACE
        if (state.buf.length > 0) {
          state.buf = state.buf.slice(0, -1);
          ws.send("\b \b"); // echo backspace visually
        }
      } else if (data >= " " && data <= "~") { // printable ASCII
        state.buf += data;
        ws.send(data); // echo char so xterm shows it
      }

      state.prompt.setContent(`> ${state.buf}`);
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
