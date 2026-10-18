# Boardwise

Boardwise is a responsive chess position analysis tool that runs in your browser. Enter moves on the board, build or load a position, and ask a local Stockfish engine to recommend a move. It does not connect to chess websites or require an account.

## Features

- Play through legal moves with `chess.js`, with legal destination markers and a move list.
- Undo the last move or flip the board orientation.
- Build a custom position using the piece palette, erase pieces, and choose which side moves next.
- Load a position from FEN or copy the current FEN to the clipboard.
- Analyze the current position with Stockfish running locally in a browser worker. The search runs to depth 16 and displays the evaluation, recommended move, and highlighted origin and destination squares.
- View the wood-style board with equal-sized squares that stay aligned as the position changes.

## Requirements

- Node.js 20.19 or newer, or Node.js 22.12 or newer.
- npm.
- A modern browser with Web Workers and WebAssembly support.

## Run locally

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Open the local URL printed by Vite in your browser.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Run the TypeScript build and create the production app in `dist/`. |
| `npm run preview` | Serve the production build locally for a preview. |

The Vite configuration copies the Stockfish JavaScript and WebAssembly files from the installed `stockfish` package into the build's `engine/` directory. No separate engine download is needed. The production build can be deployed as a static site; ensure the generated `engine/` assets are served from the same base path as the app.

## Using the app

- Select a piece that belongs to the side to move, then select one of its legal destination squares.
- Use **Undo** to restore the previous position and **Flip** to change the board orientation.
- Select **Set up** to place or erase pieces, then select the side to move and choose **Done** when ready.
- Edit the FEN field and select **Load FEN** to load a position. Press Ctrl+Enter (or Cmd+Enter on macOS) from the field to load it as well.
- Select **Copy** beside the FEN field to copy the current position.
- Select **Find best move** to start Stockfish analysis. The button is unavailable while the engine is loading or searching, in setup mode, or when the game is over.

## Project structure

```text
src/
	App.tsx       Chessboard, position controls, and Stockfish worker integration
	main.tsx      React application entry point
	styles.css    Responsive app and chessboard styling
index.html      Vite HTML entry point
vite.config.ts  React plugin and Stockfish asset copying
```

## Technology

- React and TypeScript
- Vite
- `chess.js` for legal chess positions and moves
- Stockfish WebAssembly for local engine analysis
- Lucide icons