# Boardwise project guidance

- Keep the app a responsive, standalone chess analysis tool. Do not automate or interact with third-party chess sites.
- Use React, TypeScript, chess.js for legal chess positions, and the local browser Stockfish WASM worker for analysis.
- Preserve FEN import and manual board setup behavior when changing the board or analysis UI.
- Run `npm run build` after code changes when Node.js dependencies are available.
