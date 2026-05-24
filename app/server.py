from flask import Flask, request, jsonify
from flask_cors import CORS
import chess
import chess.engine
import shutil
import threading
import atexit

# создание аппки и настройка CORS для разрешения запросов с других доменов
app = Flask(__name__)
CORS(app)

# путь к двиглу стокфиша
STOCKFISH_PATH = shutil.which("stockfish") or "D:/stockfish/stockfish-windows-x86-64.exe"
# лимит 300 мс на решение
LIMIT = chess.engine.Limit(time=0.3)
# 4 вариации хода
MULTIPV = 4

_engine = None
_lock = threading.Lock()

# запуск движка
def get_engine():
    global _engine
    if _engine is None:
        _engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
    return _engine

# если движок помер, перезапуск
def restart_engine():
    global _engine
    try:
        if _engine:
            _engine.quit()
    except Exception:
        pass
    _engine = None
    return get_engine()

# при выключении сервера завершение работы процесса stockfish-windows-x86-64.exe 
def safe_shutdown():
    global _engine
    with _lock:
        if _engine:
            try:
                _engine.quit()
            except Exception:
                pass
            _engine = None


atexit.register(safe_shutdown)

# валидация фена чтобы движок не дох
def validate_fen(fen: str) -> chess.Board | None:
    try:
        board = chess.Board(fen)
        if not board.is_valid():
            board.set_castling_fen("-")
            if not board.is_valid():
                return None
        return board
    except Exception:
        return None

# эндпоинт для анализа 
@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True) or {}
    fen = data.get("fen")
    if not fen:
        return jsonify({"error": "fen required"}), 400

    board = validate_fen(fen)
    if not board:
        return jsonify({"error": "invalid fen"}), 400

    if board.is_game_over():
        return jsonify({"fen": fen, "moves": []})

    moves = []
    with _lock:
        for attempt in range(2):
            try:
                # вызывает движок и пихает в него полученный фен
                eng = get_engine()
                results = eng.analyse(board, LIMIT, multipv=MULTIPV)
                for info in results:
                    pv = info.get("pv", [])
                    score = info.get("score")
                    if pv and board.is_legal(pv[0]):
                        # разбивает полученные данные на удобные для фронта поля и добавляет в массив ходов
                        moves.append({
                            "from": chess.square_name(pv[0].from_square),
                            "to": chess.square_name(pv[0].to_square),
                            "uci": pv[0].uci(),
                            "san": board.san(pv[0]),
                            "score": score.relative.score(mate_score=10000) if score else None,
                            "mate": score.relative.mate() if score and score.relative.is_mate() else None,
                        })
                break
            except chess.engine.EngineTerminatedError:
                restart_engine()
                if attempt == 1:
                    return jsonify({"error": "engine crashed"}), 500
            except Exception:
                if attempt == 1:
                    return jsonify({"error": "analysis failed"}), 500
                restart_engine()

    return jsonify({"fen": fen, "moves": moves})

# запуск аппки на нужном порту
if __name__ == "__main__":
    get_engine()
    print(f"Hysteria backend running on http://127.0.0.1:5267")
    app.run(host="127.0.0.1", port=5267, debug=False, threaded=False)
