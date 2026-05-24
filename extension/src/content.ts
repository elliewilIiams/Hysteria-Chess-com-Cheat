// эндпоинт бекенда для анализа
const API_URL = "http://127.0.0.1:5267/analyze";

// типы ответа от сервера
interface MoveInfo {
  from: string;
  to: string;
  uci: string;
  san: string;
  score: number | null;
  mate: number | null;
}

interface AnalysisResponse {
  fen: string;
  moves: MoveInfo[];
}

// проверяет перевёрнута ли доска (играем за чёрных)
function isFlipped(): boolean {
  const board = document.querySelector("chess-board, wc-chess-board") as HTMLElement | null;
  if (!board) return false;
  return board.classList.contains("flipped") || board.getAttribute("flipped") !== null;
}

// ищет элемент доски в DOM chess.com (несколько вариантов селекторов т.к. у них разная вёрстка)
function getBoard(): HTMLElement | null {
  return (
    document.querySelector("wc-chess-board .board") ||
    document.querySelector("chess-board .board") ||
    document.querySelector(".board-layout-main .board") ||
    document.querySelector("wc-chess-board") ||
    document.querySelector("chess-board")
  ) as HTMLElement | null;
}

// парсит FEN позицию прямо из DOM chess.com
function getCurrentFen(): string | null {
  // сначала пробуем взять готовый fen из атрибута элемента
  const boardEl = document.querySelector("chess-board, wc-chess-board") as HTMLElement | null;
  if (boardEl) {
    const fenAttr = boardEl.getAttribute("fen");
    if (fenAttr && fenAttr.includes("/")) return fenAttr;
  }

  // если атрибута нет — собираем позицию из классов фигур вручную
  const pieces = document.querySelectorAll(".piece");
  if (pieces.length < 2) return null;

  const grid: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));

  // каждая фигура имеет класс типа "wp square-45" (белая пешка на e4)
  pieces.forEach((el) => {
    const cls = el.className;
    const pieceMatch = cls.match(/\b([wb])([pnbrqk])\b/);
    if (!pieceMatch) return;
    const color = pieceMatch[1];
    const type = pieceMatch[2];

    const sqMatch = cls.match(/\bsquare-(\d)(\d)\b/);
    if (!sqMatch) return;
    const file = parseInt(sqMatch[1]) - 1;
    const rank = parseInt(sqMatch[2]) - 1;

    const r = 7 - rank;
    const f = file;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      grid[r][f] = color === "w" ? type.toUpperCase() : type;
    }
  });

  // собираем строку FEN из сетки
  let fen = "";
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      if (grid[r][f]) {
        if (empty) { fen += empty; empty = 0; }
        fen += grid[r][f];
      } else {
        empty++;
      }
    }
    if (empty) fen += empty;
    if (r < 7) fen += "/";
  }

  // определяем чей ход по подсветке последнего хода (highlight клетки)
  const highlights = document.querySelectorAll(".highlight");
  let turn = "w";
  if (highlights.length >= 2) {
    for (const hl of highlights) {
      const hlSqMatch = hl.className.match(/\bsquare-(\d)(\d)\b/);
      if (!hlSqMatch) continue;
      const hFile = parseInt(hlSqMatch[1]) - 1;
      const hRank = parseInt(hlSqMatch[2]) - 1;
      const hR = 7 - hRank;
      if (hFile >= 0 && hFile < 8 && hR >= 0 && hR < 8 && grid[hR][hFile]) {
        const p = grid[hR][hFile]!;
        // если на подсвеченной клетке белая фигура — значит белые уже сходили, ход чёрных
        turn = p === p.toUpperCase() ? "b" : "w";
        break;
      }
    }
  }

  return fen + " " + turn + " KQkq - 0 1";
}

// отправка FEN на бекенд для анализа стокфишем
async function requestAnalysis(fen: string): Promise<AnalysisResponse | null> {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fen }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// конвертация шахматной клетки (e2) в координаты на доске с учётом переворота
function squareToCoords(sq: string, flipped: boolean): [number, number] {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1]) - 1;
  return [
    flipped ? 7 - file : file,
    flipped ? rank : 7 - rank,
  ];
}

// цвета стрелок: зелёный (лучший), синий, оранжевый, фиолетовый
const ARROW_COLORS = ["rgba(0,200,83,0.85)", "rgba(0,150,255,0.7)", "rgba(255,170,0,0.6)", "rgba(180,80,255,0.5)"];

// рисует SVG стрелки поверх доски
function drawArrows(moves: MoveInfo[]) {
  // убираем старые стрелки
  document.getElementById("hysteria-arrows")?.remove();
  if (!moves.length) return;

  const board = getBoard();
  if (!board) return;

  const rect = board.getBoundingClientRect();
  if (rect.width === 0) return;
  const size = rect.width;
  const cellSize = size / 8;
  const flipped = isFlipped();

  // создаём SVG оверлей поверх доски с position:fixed
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "hysteria-arrows";
  svg.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${size}px;height:${size}px;pointer-events:none;z-index:99999;`;
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

  // маркеры-наконечники для стрелок
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  moves.forEach((_, i) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", `hh-${i}`);
    marker.setAttribute("markerWidth", "3");
    marker.setAttribute("markerHeight", "3");
    marker.setAttribute("refX", "1.5");
    marker.setAttribute("refY", "1.5");
    marker.setAttribute("orient", "auto");
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    poly.setAttribute("points", "0,0 3,1.5 0,3");
    poly.setAttribute("fill", ARROW_COLORS[i] || ARROW_COLORS[0]);
    marker.appendChild(poly);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  // рисуем линию для каждого хода от клетки к клетке
  moves.forEach((move, i) => {
    const [x1, y1] = squareToCoords(move.from, flipped);
    const [x2, y2] = squareToCoords(move.to, flipped);
    const cx1 = x1 * cellSize + cellSize / 2;
    const cy1 = y1 * cellSize + cellSize / 2;
    const cx2 = x2 * cellSize + cellSize / 2;
    const cy2 = y2 * cellSize + cellSize / 2;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(cx1));
    line.setAttribute("y1", String(cy1));
    line.setAttribute("x2", String(cx2));
    line.setAttribute("y2", String(cy2));
    line.setAttribute("stroke", ARROW_COLORS[i] || ARROW_COLORS[0]);
    line.setAttribute("stroke-width", String(i === 0 ? 10 : 6));
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("marker-end", `url(#hh-${i})`);
    line.setAttribute("opacity", String(i === 0 ? 0.9 : 0.6));
    svg.appendChild(line);
  });

  document.body.appendChild(svg);
}

// панель оценки позиции в правом верхнем углу
function renderPanel(moves: MoveInfo[]) {
  let panel = document.getElementById("hysteria-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "hysteria-panel";
    document.body.appendChild(panel);
  }
  if (!moves.length) {
    panel.innerHTML = `<div class="hp-title">Hysteria</div><div class="hp-empty">Waiting...</div>`;
    return;
  }
  // для каждого хода показываем оценку в пешках или мат
  const rows = moves.map((m, i) => {
    const scoreText = m.mate !== null ? `M${m.mate}` : ((m.score ?? 0) / 100).toFixed(2);
    const color = ARROW_COLORS[i] || "#fff";
    return `<div class="hp-row${i === 0 ? " hp-best" : ""}"><span class="hp-dot" style="background:${color}"></span><span class="hp-score">${scoreText}</span></div>`;
  }).join("");
  panel.innerHTML = `<div class="hp-title">Hysteria</div>${rows}`;
}

// состояние основного цикла
let lastFen = "";
let lastMoves: MoveInfo[] = [];
let running = true;
let delay = 300;
let intervalId = setInterval(tick, delay);

// подтягиваем сохранённую задержку из chrome storage
chrome.storage?.local?.get("delay", (data: any) => {
  if (data?.delay) {
    delay = data.delay;
    clearInterval(intervalId);
    intervalId = setInterval(tick, delay);
  }
});

// основной тик — проверяет позицию и запрашивает анализ если она изменилась
async function tick() {
  if (!running) return;

  const fen = getCurrentFen();
  if (!fen) return;

  // позиция не изменилась — перерисовываем только если стрелки пропали (DOM chess.com их сносит)
  if (fen === lastFen) {
    if (lastMoves.length && !document.getElementById("hysteria-arrows")) {
      drawArrows(lastMoves);
      renderPanel(lastMoves);
    }
    return;
  }

  // новая позиция — запрашиваем анализ
  lastFen = fen;
  const data = await requestAnalysis(fen);
  if (!data?.moves?.length) {
    lastMoves = [];
    return;
  }
  lastMoves = data.moves;
  drawArrows(data.moves);
  renderPanel(data.moves);
}

// при скролле/ресайзе двигаем SVG вместе с доской
function updateArrowPos() {
  const svg = document.getElementById("hysteria-arrows");
  const board = getBoard();
  if (svg && board) {
    const rect = board.getBoundingClientRect();
    svg.style.top = rect.top + "px";
    svg.style.left = rect.left + "px";
  }
}
window.addEventListener("scroll", updateArrowPos, { passive: true });
window.addEventListener("resize", updateArrowPos, { passive: true });

// обработка сообщений из popup (вкл/выкл, смена задержки)
chrome.runtime?.onMessage?.addListener((msg: any) => {
  if (msg.type === "toggle") {
    running = !running;
    if (!running) {
      document.getElementById("hysteria-arrows")?.remove();
      document.getElementById("hysteria-panel")?.remove();
      lastMoves = [];
    }
  }
  if (msg.type === "setDelay") {
    delay = msg.delay || 500;
    clearInterval(intervalId);
    intervalId = setInterval(tick, delay);
  }
});
