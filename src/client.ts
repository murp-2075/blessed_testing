// src/client.ts
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { AttachAddon } from "@xterm/addon-attach";
import "@xterm/xterm/css/xterm.css";          // Bun’s CSS bundler understands this

const ws = new WebSocket(`ws://${location.host}/term`);

const term = new Terminal({ convertEol: true, fontSize: 15 });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.loadAddon(new AttachAddon(ws));

const termElement = document.getElementById('term')!;
term.open(termElement);
term.focus();
fitAddon.fit();

term.onResize(({ cols, rows }) => {
  const text = `${cols},${rows}`;
  const bytes = new TextEncoder().encode(text);
  const pkt = new Uint8Array(1 + bytes.length);
  pkt[0] = 0xff;
  pkt.set(bytes, 1);
  ws.send(pkt);
});

// Add event resize handler
window.addEventListener("resize", () => {
  // Send resize packet to server
  fitAddon.fit();
});
