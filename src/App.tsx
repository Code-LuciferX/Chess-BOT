import { Chess, type Color, type Piece, type PieceSymbol, type Square } from "chess.js";
import {
  ArrowDownUp,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./styles.css";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const PIECE_GLYPHS: Record<Color, Record<PieceSymbol, string>> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
const PIECE_LABELS: Record<PieceSymbol, string> = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};
const UCI_ENGINE = "stockfish-19-lite-single.js";
const BOT_DIFFICULTIES = {
  easy: { skill: 3, depth: 8 },
  medium: { skill: 10, depth: 12 },
  hard: { skill: 20, depth: 16 },
} as const;

type PieceChoice = Piece | "empty";
type BotDifficulty = keyof typeof BOT_DIFFICULTIES;
type MoveRecord = { san: string; color: Color; beforeFen: string };
type Search = { fen: string; score: string; depth: number; purpose: "analysis" | "bot" };
type BestMove = { from: Square; to: Square; san: string; score: string; depth: number };
type EngineState = "loading" | "ready" | "thinking" | "error";
type PendingPromotion = { from: Square; to: Square; color: Color };

function formatScore(kind: string, value: number, turn: string) {
  const whiteValue = turn === "b" ? -value : value;
  if (kind === "mate") {
    const sign = whiteValue > 0 ? "+" : "−";
    return `M${sign}${Math.abs(whiteValue)}`;
  }
  const pawns = whiteValue / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function App() {
  const [positionFen, setPositionFen] = useState(() => new Chess().fen());
  const [fenDraft, setFenDraft] = useState(() => new Chess().fen());
  const [fenError, setFenError] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [pieceChoice, setPieceChoice] = useState<PieceChoice>({ type: "p", color: "w" });
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalSquares, setLegalSquares] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [botColor, setBotColor] = useState<Color | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("medium");
  const [moveLog, setMoveLog] = useState<MoveRecord[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [engineState, setEngineState] = useState<EngineState>("loading");
  const [engineMessage, setEngineMessage] = useState("Loading Stockfish");
  const [evaluation, setEvaluation] = useState("--");
  const [bestMove, setBestMove] = useState<BestMove | null>(null);
  const [copied, setCopied] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const readyResolveRef = useRef<(() => void) | null>(null);
  const readyPromiseRef = useRef<Promise<void> | null>(null);
  const searchRef = useRef<Search | null>(null);
  const positionFenRef = useRef(positionFen);

  positionFenRef.current = positionFen;
  const game = new Chess(positionFen);
  const turn = game.turn();
  const status = game.isCheckmate()
    ? "Checkmate"
    : game.isDraw()
      ? "Drawn position"
      : game.isCheck()
        ? `${turn === "w" ? "White" : "Black"} in check`
        : `${turn === "w" ? "White" : "Black"} to move`;

  useEffect(() => {
    const worker = new Worker(`${import.meta.env.BASE_URL}engine/${UCI_ENGINE}`);
    workerRef.current = worker;
    readyPromiseRef.current = new Promise<void>((resolve) => {
      readyResolveRef.current = resolve;
    });

    worker.onmessage = (event: MessageEvent<string>) => {
      const line = String(event.data).trim();
      if (line === "uciok") {
        worker.postMessage("isready");
        return;
      }
      if (line === "readyok") {
        setEngineState("ready");
        setEngineMessage("Stockfish ready");
        readyResolveRef.current?.();
        return;
      }

      const activeSearch = searchRef.current;
      const scoreMatch = line.match(/\bdepth\s+(\d+)\b.*?\bscore\s+(cp|mate)\s+(-?\d+)/);
      if (activeSearch && scoreMatch) {
        activeSearch.depth = Number(scoreMatch[1]);
        activeSearch.score = formatScore(scoreMatch[2], Number(scoreMatch[3]), activeSearch.fen.split(" ")[1]);
        setEvaluation(activeSearch.score);
      }

      const bestMatch = line.match(/\bbestmove\s+(\S+)/);
      if (!bestMatch || !activeSearch) return;
      const completedSearch = activeSearch;
      searchRef.current = null;
      if (completedSearch.fen !== positionFenRef.current) {
        setEngineState("ready");
        setEngineMessage("Position changed. Analyze again.");
        return;
      }

      const uci = bestMatch[1];
      if (uci === "(none)" || uci === "0000") {
        setBestMove(null);
        setEngineState("ready");
        setEngineMessage("No legal move in this position");
        return;
      }

      try {
        const from = uci.slice(0, 2) as Square;
        const to = uci.slice(2, 4) as Square;
        const candidate = new Chess(completedSearch.fen);
        const move = candidate.move({ from, to, promotion: (uci[4] as PieceSymbol | undefined) ?? "q" });
        if (completedSearch.purpose === "bot") {
          const nextFen = candidate.fen();
          setPositionFen(nextFen);
          setFenDraft(nextFen);
          setSelectedSquare(null);
          setLegalSquares([]);
          setMoveLog((records) => [...records, { san: move.san, color: move.color, beforeFen: completedSearch.fen }]);
          setEngineMessage(candidate.isGameOver() ? "Game over" : "Your move");
          setEngineState("ready");
          return;
        }
        setBestMove({ from, to, san: move.san, score: completedSearch.score, depth: completedSearch.depth });
        setEngineMessage(`Best line found at depth ${completedSearch.depth}`);
      } catch {
        setBestMove(null);
        setEngineMessage("Stockfish returned an invalid move");
      }
      setEngineState("ready");
    };

    worker.onerror = () => {
      setEngineState("error");
      setEngineMessage("Could not load Stockfish. Check the engine files and reload.");
      searchRef.current = null;
    };
    worker.postMessage("uci");

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!botColor || setupMode || turn === botColor || game.isGameOver() || engineState !== "ready") return;
    const worker = workerRef.current;
    if (!worker) return;

    setBestMove(null);
    setEvaluation("...");
    setEngineState("thinking");
    setEngineMessage("Stockfish is thinking");
    searchRef.current = { fen: positionFen, score: "--", depth: 0, purpose: "bot" };
    worker.postMessage(`setoption name Skill Level value ${BOT_DIFFICULTIES[botDifficulty].skill}`);
    worker.postMessage(`position fen ${positionFen}`);
    worker.postMessage(`go depth ${BOT_DIFFICULTIES[botDifficulty].depth}`);
  }, [botColor, botDifficulty, engineState, positionFen, setupMode, turn]);

  function commitPosition(next: Chess, clearMoves = true) {
    if (searchRef.current) workerRef.current?.postMessage("stop");
    const fen = next.fen();
    setPositionFen(fen);
    setFenDraft(fen);
    setFenError("");
    setSelectedSquare(null);
    setLegalSquares([]);
    setPendingPromotion(null);
    setBestMove(null);
    setEvaluation("--");
    searchRef.current = null;
    setEngineState((current) => current === "thinking" ? "ready" : current);
    setEngineMessage(engineState === "error" ? "Could not load Stockfish" : "Ready when you are");
    if (clearMoves) setMoveLog([]);
  }

  function setGameMode(color: Color | null) {
    if (searchRef.current) workerRef.current?.postMessage("stop");
    searchRef.current = null;
    setBotColor(color);
    setBestMove(null);
    setEngineState((current) => current === "thinking" ? "ready" : current);
    setEngineMessage(color ? "Bot game ready" : "Ready when you are");
  }

  function applyMove(from: Square, to: Square, promotion?: PieceSymbol) {
    const current = new Chess(positionFen);
    const move = current.move({ from, to, promotion });
    if (searchRef.current) workerRef.current?.postMessage("stop");
    searchRef.current = null;
    const nextFen = current.fen();
    setPositionFen(nextFen);
    setFenDraft(nextFen);
    setSelectedSquare(null);
    setLegalSquares([]);
    setPendingPromotion(null);
    setBestMove(null);
    setEvaluation("--");
    setEngineState((currentState) => currentState === "thinking" ? "ready" : currentState);
    setEngineMessage(botColor ? "Your move" : "Ready when you are");
    setMoveLog((records) => [...records, { san: move.san, color: move.color, beforeFen: positionFen }]);
  }

  function handleSquareClick(square: Square) {
    if (pendingPromotion || (botColor && turn !== botColor)) return;
    const current = new Chess(positionFen);
    if (setupMode) {
      const existing = current.get(square);
      if (existing?.type === "k" && (pieceChoice === "empty" || pieceChoice.type !== "k" || existing.color !== pieceChoice.color)) return;
      if (pieceChoice !== "empty" && pieceChoice.type === "k") {
        for (const file of FILES) {
          for (let rank = 1; rank <= 8; rank += 1) {
            const candidate = `${file}${rank}` as Square;
            const occupant = current.get(candidate);
            if (candidate !== square && occupant?.type === "k" && occupant.color === pieceChoice.color) current.remove(candidate);
          }
        }
      }
      current.remove(square);
      if (pieceChoice !== "empty") current.put(pieceChoice, square);
      commitPosition(current);
      return;
    }

    if (!selectedSquare) {
      const piece = current.get(square);
      if (!piece || piece.color !== current.turn()) return;
      setSelectedSquare(square);
      setLegalSquares(current.moves({ square, verbose: true }).map((move) => move.to));
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }

    try {
      const promotionMoves = current.moves({ square: selectedSquare, verbose: true })
        .filter((move) => move.to === square && move.promotion);
      if (promotionMoves.length) {
        setPendingPromotion({ from: selectedSquare, to: square, color: current.turn() });
        return;
      }
      current.move({ from: selectedSquare, to: square });
      applyMove(selectedSquare, square);
    } catch {
      const piece = current.get(square);
      if (piece?.color === current.turn()) {
        setSelectedSquare(square);
        setLegalSquares(current.moves({ square, verbose: true }).map((move) => move.to));
      } else {
        setSelectedSquare(null);
        setLegalSquares([]);
      }
    }
  }

  function applyFen() {
    try {
      const next = new Chess(fenDraft.trim());
      commitPosition(next);
    } catch {
      setFenError("That FEN is not a valid chess position.");
    }
  }

  function clearBoard() {
    const next = new Chess("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    commitPosition(next);
    setSetupMode(true);
  }

  function setSideToMove(color: Color) {
    const fields = positionFen.split(" ");
    fields[1] = color;
    fields[2] = "-";
    fields[3] = "-";
    fields[4] = "0";
    fields[5] = "1";
    try {
      commitPosition(new Chess(fields.join(" ")));
    } catch {
      setFenError("This position needs one king of each color to change the turn.");
    }
  }

  function undoMove() {
    let undoIndex = moveLog.length - 1;
    if (botColor) {
      undoIndex = -1;
      for (let index = moveLog.length - 1; index >= 0; index -= 1) {
        if (moveLog[index].color !== botColor) {
          undoIndex = index;
          break;
        }
      }
      if (undoIndex < 0) undoIndex = moveLog.findIndex((move) => move.color === botColor);
    }
    if (undoIndex < 0) return;
    const previous = moveLog[undoIndex];
    setMoveLog((records) => records.slice(0, undoIndex));
    commitPosition(new Chess(previous.beforeFen), false);
  }

  async function copyFen() {
    try {
      await navigator.clipboard.writeText(positionFen);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setFenError("Clipboard access is unavailable in this browser.");
    }
  }

  function exportPgn() {
    if (moveLog.length === 0) return;

    try {
      const pgnGame = new Chess(moveLog[0].beforeFen);
      for (const move of moveLog) pgnGame.move(move.san);
      pgnGame.setHeader("White", botColor === "w" ? `Stockfish (${botDifficulty})` : "Player");
      pgnGame.setHeader("Black", botColor === "b" ? `Stockfish (${botDifficulty})` : "Player");

      const file = new Blob([`${pgnGame.pgn()}\n`], { type: "application/x-chess-pgn" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "boardwise-game.pgn";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFenError("Could not export this move list as PGN.");
    }
  }

  async function analyzePosition() {
    const worker = workerRef.current;
    if (!worker || engineState === "loading" || engineState === "error" || game.isGameOver()) return;
    setBestMove(null);
    setEvaluation("...");
    setEngineState("thinking");
    setEngineMessage("Searching position");

    try {
      await readyPromiseRef.current;
      searchRef.current = { fen: positionFen, score: "--", depth: 0, purpose: "analysis" };
      worker.postMessage(`position fen ${positionFen}`);
      worker.postMessage("go depth 16");
    } catch {
      setEngineState("error");
      setEngineMessage("Stockfish did not become ready");
    }
  }

  function renderSquare(row: number, column: number) {
    const rank = flipped ? row + 1 : 8 - row;
    const file = flipped ? FILES[7 - column] : FILES[column];
    const square = `${file}${rank}` as Square;
    const piece = game.get(square);
    const isLight = (FILES.indexOf(file) + rank) % 2 === 0;
    const isLegal = legalSquares.includes(square);
    const isBest = bestMove?.from === square || bestMove?.to === square;
    const classes = [
      "square",
      isLight ? "square-light" : "square-dark",
      selectedSquare === square ? "square-selected" : "",
      isLegal ? "square-legal" : "",
      isBest ? "square-best" : "",
    ].filter(Boolean).join(" ");
    const fileLabel = row === 7 ? file : "";
    const rankLabel = column === 0 ? String(rank) : "";

    return (
      <button
        aria-label={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${PIECE_LABELS[piece.type]}` : ""}`}
        className={classes}
        key={square}
        onClick={() => handleSquareClick(square)}
        role="gridcell"
        type="button"
      >
        {rankLabel && <span className="coordinate coordinate-rank">{rankLabel}</span>}
        {fileLabel && <span className="coordinate coordinate-file">{fileLabel}</span>}
        {piece && <span className={`chess-piece piece-${piece.color}`}>{PIECE_GLYPHS[piece.color][piece.type]}</span>}
        {isLegal && <span className={piece ? "legal-ring" : "legal-dot"} />}
      </button>
    );
  }

  const movePairs: { number: number; white?: string; black?: string }[] = [];
  moveLog.forEach((move, index) => {
    const number = Math.ceil((index + 1) / 2);
    let pair = movePairs[movePairs.length - 1];
    if (!pair || pair.number !== number) {
      pair = { number };
      movePairs.push(pair);
    }
    if (move.color === "w") pair.white = move.san;
    else pair.black = move.san;
  });

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Boardwise home">
          <span className="brand-mark">B<span>.</span></span>
          <span className="brand-name">boardwise</span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> POSITION LAB</div>
        <button className="help-button" title="Boardwise analyzes positions you enter; it does not connect to chess sites." type="button">
          <CircleHelp size={17} /> <span>About</span>
        </button>
      </header>

      <main className="workspace">
        <section className="board-area" aria-label="Chess board workspace">
          <div className="board-heading">
            <div>
              <p className="eyebrow">ANALYSIS BOARD</p>
              <h1>{setupMode ? "Build a position" : status}</h1>
            </div>
            <div className="turn-indicator"><span className={`turn-piece turn-${turn}`} />{turn === "w" ? "White" : "Black"}</div>
          </div>

          <div className="game-mode-controls">
            <div className="mode-switch" role="group" aria-label="Game mode">
              <button className={!botColor ? "mode-active" : ""} onClick={() => setGameMode(null)} type="button">Analysis</button>
              <button className={botColor ? "mode-active" : ""} onClick={() => setGameMode("w")} type="button">Vs bot</button>
            </div>
            {botColor && <>
              <label className="bot-setting">
                Play as
                <select aria-label="Play as" onChange={(event) => setGameMode(event.target.value as Color)} value={botColor}>
                  <option value="w">White</option>
                  <option value="b">Black</option>
                </select>
              </label>
              <label className="bot-setting">
                Strength
                <select aria-label="Bot strength" onChange={(event) => setBotDifficulty(event.target.value as BotDifficulty)} value={botDifficulty}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </>}
          </div>

          {setupMode && (
            <div className="setup-toolbar">
              <div className="piece-palette" aria-label="Choose a piece to place">
                {(["w", "b"] as const).flatMap((color) => (["k", "q", "r", "b", "n", "p"] as PieceSymbol[]).map((type) => {
                  const choice: Piece = { color, type };
                  const active = pieceChoice !== "empty" && pieceChoice.color === color && pieceChoice.type === type;
                  return (
                    <button
                      aria-label={`Place ${color === "w" ? "white" : "black"} ${PIECE_LABELS[type]}`}
                      className={`palette-piece ${active ? "palette-active" : ""}`}
                      key={`${color}${type}`}
                      onClick={() => setPieceChoice(choice)}
                      type="button"
                    >{PIECE_GLYPHS[color][type]}</button>
                  );
                }))}
                <button
                  aria-label="Erase piece"
                  className={`palette-eraser ${pieceChoice === "empty" ? "palette-active" : ""}`}
                  onClick={() => setPieceChoice("empty")}
                  type="button"
                >Erase</button>
              </div>
              <div className="turn-switch" role="group" aria-label="Side to move">
                <button className={turn === "w" ? "turn-active" : ""} onClick={() => setSideToMove("w")} type="button">White</button>
                <button className={turn === "b" ? "turn-active" : ""} onClick={() => setSideToMove("b")} type="button">Black</button>
              </div>
            </div>
          )}

          <div className="board-frame">
            <div className="chessboard" role="grid" aria-label="Chess position">
              {Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, column) => renderSquare(row, column)))}
            </div>
            {pendingPromotion && (
              <div className="promotion-backdrop">
                <div aria-labelledby="promotion-title" aria-modal="true" className="promotion-dialog" role="dialog">
                  <h2 id="promotion-title">Promote pawn</h2>
                  <div className="promotion-options">
                    {(["q", "r", "b", "n"] as const).map((type) => (
                      <button
                        aria-label={`Promote to ${PIECE_LABELS[type]}`}
                        className="promotion-option"
                        key={type}
                        onClick={() => applyMove(pendingPromotion.from, pendingPromotion.to, type)}
                        type="button"
                      >
                        <span className={`chess-piece piece-${pendingPromotion.color}`}>{PIECE_GLYPHS[pendingPromotion.color][type]}</span>
                        <span>{PIECE_LABELS[type]}</span>
                      </button>
                    ))}
                  </div>
                  <button className="promotion-cancel" onClick={() => {
                    setPendingPromotion(null);
                    setSelectedSquare(null);
                    setLegalSquares([]);
                  }} type="button">Cancel</button>
                </div>
              </div>
            )}
          </div>

          <div className="board-controls">
            <button className="control-button" onClick={undoMove} disabled={botColor ? !moveLog.some((move) => move.color === botColor) : moveLog.length === 0} title="Undo last move" type="button">
              <Undo2 size={17} /><span>Undo</span>
            </button>
            <button className="control-button" onClick={() => setFlipped((value) => !value)} title="Flip board" type="button">
              <ArrowDownUp size={17} /><span>Flip</span>
            </button>
            <span className="board-hint">{setupMode ? "Choose a piece, then a square" : botColor && turn !== botColor ? "Stockfish is thinking..." : "Select a piece, then its destination"}</span>
            <button
              className={`setup-button ${setupMode ? "setup-done" : ""}`}
              onClick={() => setSetupMode((value) => !value)}
              type="button"
            >{setupMode ? <><Check size={16} /> Done</> : <><Sparkles size={16} /> Set up</>}</button>
          </div>
        </section>

        <aside className="analysis-panel" aria-label="Position analysis">
          <div className="panel-title-row">
            <div><p className="eyebrow">ENGINE</p><h2>Position review</h2></div>
            <span className={`engine-light engine-${engineState}`} title={engineMessage} />
          </div>

          <div className="evaluation-strip">
            <div className="evaluation-number">{evaluation}</div>
            <div className="evaluation-copy"><span>WHITE ADVANTAGE</span><strong>{bestMove ? `Depth ${bestMove.depth}` : engineState === "thinking" ? "Calculating" : "Engine score"}</strong></div>
          </div>

          <button
            className="analyze-button"
            disabled={engineState === "loading" || engineState === "error" || engineState === "thinking" || game.isGameOver() || setupMode}
            onClick={analyzePosition}
            type="button"
          >
            {engineState === "thinking" ? <span className="button-spinner" /> : <Sparkles size={18} />}
            {engineState === "thinking" ? "Analyzing" : "Find best move"}
            {engineState !== "thinking" && <ChevronRight size={17} />}
          </button>
          <div className={`engine-note ${engineState === "error" ? "engine-note-error" : ""}`}>{engineMessage}</div>

          <div className="best-move-block">
            <div className="subsection-heading"><span>RECOMMENDED</span><span className="depth-tag">{bestMove ? `D${bestMove.depth}` : "LOCAL"}</span></div>
            {bestMove ? (
              <div className="best-move-result">
                <span className="move-san">{bestMove.san}</span>
                <span className="move-coordinates">{bestMove.from} <span>→</span> {bestMove.to}</span>
                <span className="move-result-score">{bestMove.score}</span>
              </div>
            ) : (
              <div className="empty-result"><span className="empty-result-icon">↗</span><span>Your top move will appear here</span></div>
            )}
          </div>

          <div className="fen-section">
            <div className="subsection-heading"><span>POSITION FEN</span><button className="copy-button" onClick={copyFen} title="Copy FEN" type="button">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy"}</button></div>
            <textarea
              aria-label="FEN position"
              className="fen-input"
              onChange={(event) => setFenDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) applyFen(); }}
              spellCheck={false}
              value={fenDraft}
            />
            <div className="fen-actions"><span>Paste or edit a position</span><button onClick={applyFen} type="button">Load FEN</button></div>
            {fenError && <p className="fen-error" role="alert">{fenError}</p>}
          </div>

          <div className="moves-section">
            <div className="subsection-heading">
              <span>MOVE LIST</span>
              <div className="move-actions">
                <button className="copy-button" disabled={moveLog.length === 0} onClick={exportPgn} title="Download game as PGN" type="button"><Download size={15} />PGN</button>
                <button className="text-button" onClick={clearBoard} type="button">Clear board</button>
              </div>
            </div>
            {movePairs.length ? (
              <div className="move-list" aria-label="Moves played">
                {movePairs.map((pair) => <div className="move-row" key={pair.number}><span className="move-number">{pair.number}.</span><span>{pair.white ?? "—"}</span><span>{pair.black ?? ""}</span></div>)}
              </div>
            ) : <p className="move-empty">Moves made on the board appear here.</p>}
          </div>

          <div className="privacy-note"><span className="privacy-mark">●</span> Analysis runs in your browser. No account or site connection.</div>
        </aside>
      </main>

      <footer className="footer"><span>BOARDWISE <span className="footer-dot">/</span> CHESS POSITION ANALYSIS</span><span>BUILT FOR THE BOARD IN FRONT OF YOU</span></footer>
    </div>
  );
}

export default App;
