# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Install dependencies**: `bun install`
- **Run client in watch mode**: `bun run client` (builds and watches src/client.ts → public/client.js)
- **Run server with hot reload**: `bun run server` (runs src/server.ts with hot reload)
- **Run both client and server**: `bun run dev` (runs both client and server in parallel)

## Project Architecture

This is a **Blessed-over-WebSocket** terminal UI application built with Bun. The architecture consists of:

### Server Side (`src/server.ts`)
- **Bun.serve()** HTTP server on port 3000 with WebSocket support
- **Blessed terminal interface** that runs server-side and streams ANSI output over WebSocket
- **WebSocket handlers** at `/term` endpoint manage terminal sessions
- **Static file serving** for client assets from `public/` directory
- **Fake TTY streams** using Node.js Readable/PassThrough streams to interface with Blessed
- **Batched output** to optimize WebSocket text frame transmission

### Client Side (`src/client.ts`)
- **xterm.js terminal emulator** running in browser
- **WebSocket connection** to `/term` endpoint for bidirectional communication
- **Resize handling** with special binary protocol (0xff prefix) for terminal dimensions
- **Chunked data processing** (1KB chunks) for large terminal output

### Key Components
- **Terminal Interface**: Blessed screen with log widget and prompt
- **WebSocket Protocol**: Text frames for terminal data, binary frames for resize commands
- **Build System**: Bun bundler for client-side TypeScript → JavaScript with watch mode

## Architecture Notes

- **No PTY/shell integration** - this is a pure Blessed UI demo, not a full terminal
- **Client-server communication** uses WebSocket text frames for terminal data and binary frames (0xff prefix) for resize events
- **Terminal dimensions** are synced from client to server via resize protocol
- **ANSI output batching** on server prevents excessive WebSocket frame transmission

## Technology Stack

- **Runtime**: Bun (replaces Node.js, npm, webpack, etc.)
- **Server**: Bun.serve() with WebSocket support
- **Terminal UI**: Blessed (server-side) + xterm.js (client-side)
- **Build**: Bun bundler with watch mode, minification, and sourcemaps
- **TypeScript**: Strict mode with modern ESNext target

## Important Cursor Rules

This project uses Bun exclusively instead of Node.js tooling:
- Use `bun <file>` instead of `node <file>` 
- Use `bun test` instead of jest/vitest
- Use `bun build` instead of webpack/esbuild
- Use `bun install` instead of npm/yarn/pnpm
- Use `Bun.serve()` instead of Express
- Built-in WebSocket support (no need for `ws` package)