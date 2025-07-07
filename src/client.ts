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


// Add event resize handler
window.addEventListener("resize", () => {
  // Send resize packet to server
  fitAddon.fit();
  const cols = term.cols;
  const rows = term.rows;
  const text = `${cols},${rows}`;
  const bytes = new TextEncoder().encode(text);  // UTF-8 bytes for "80,24"
  const packet = new Uint8Array(1 + bytes.length);
  packet[0] = 0xff;           // message type
  packet.set(bytes, 1);
  // const packet = new Uint8Array([0xff, cols, rows]);
  ws.send(packet);
});
