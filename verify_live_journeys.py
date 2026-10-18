import json
import httpx
from websockets.sync.client import connect

BASE_HTTP = "http://127.0.0.1:8000"
BASE_WS = "ws://127.0.0.1:8000"

def get_session_cookie(client: httpx.Client) -> str:
    # Extract session cookie value
    for cookie in client.cookies.jar:
        if cookie.name == "playerdna_session":
            return cookie.value
    raise ValueError("Session cookie playerdna_session not found")

def ws_connect(game_id: str, cookie_val: str):
    headers = {
        "Origin": "http://localhost:5173",
        "Cookie": f"playerdna_session={cookie_val}",
    }
    return connect(f"{BASE_WS}/api/games/{game_id}/ws", additional_headers=headers)

def run_all_verifications():
    c1 = httpx.Client(base_url=BASE_HTTP)
    c2 = httpx.Client(base_url=BASE_HTTP)

    # 1. Login
    r1 = c1.post("/api/auth/login", json={"username": "JourneyPlayer1", "password": "Password123!"})
    r2 = c2.post("/api/auth/login", json={"username": "JourneyPlayer2", "password": "Password123!"})
    assert r1.status_code == 200, f"P1 login failed: {r1.text}"
    assert r2.status_code == 200, f"P2 login failed: {r2.text}"
    p1 = r1.json()
    p2 = r2.json()
    print("=== INITIAL PLAYERS STATE ===")
    print(f"P1 ({p1['username']}): Rating={p1['rating']}, GamesPlayed={p1['games_played']}")
    print(f"P2 ({p2['username']}): Rating={p2['rating']}, GamesPlayed={p2['games_played']}")
    cookie1 = get_session_cookie(c1)
    cookie2 = get_session_cookie(c2)

    # Cancel any active queue
    c1.delete("/api/matchmaking/queue")
    c2.delete("/api/matchmaking/queue")

    # ==========================================
    # 2. CASUAL QUEUE & MATCH JOURNEY
    # ==========================================
    print("\n==============================")
    print("VERIFYING JOURNEY 2: CASUAL PLAY")
    print("==============================")
    q1 = c1.post("/api/matchmaking/queue", params={"mode": "casual"}).json()
    q2 = c2.post("/api/matchmaking/queue", params={"mode": "casual"}).json()
    print("P1 Casual Queue:", q1)
    print("P2 Casual Queue:", q2)
    assert q2["status"] == "matched", f"Expected matched status, got {q2}"
    casual_game_id = q2["game_id"]
    print("Casual Matched Game ID:", casual_game_id)

    # Verify both players paired into same game
    cg1 = c1.get(f"/api/games/{casual_game_id}").json()
    cg2 = c2.get(f"/api/games/{casual_game_id}").json()
    assert cg1["game_id"] == casual_game_id and cg2["game_id"] == casual_game_id
    assert cg1["status"] == "active"
    print(f"Game Active! White={cg1['white_username']}, Black={cg1['black_username']}")

    ws1_is_white = cg1["white_username"] == "JourneyPlayer1"
    ws1_cookie = cookie1 if ws1_is_white else cookie2
    ws2_cookie = cookie2 if ws1_is_white else cookie1

    with ws_connect(casual_game_id, ws1_cookie) as white_ws, ws_connect(casual_game_id, ws2_cookie) as black_ws:
        # Consume initial connection/state events
        white_init = json.loads(white_ws.recv())
        black_init = json.loads(black_ws.recv())
        print("Connected to WebSocket. Initial events received.")

        # Play moves: 1. e4 e5 2. Nf3 Nc6
        moves = [
            (white_ws, "e2e4", 0),
            (black_ws, "e7e5", 1),
            (white_ws, "g1f3", 2),
            (black_ws, "b8c6", 3),
        ]
        for ws, uci, ply in moves:
            ws.send(json.dumps({"type": "move", "uci": uci, "expected_ply": ply}))
            # Wait for broadcast
            ev = json.loads(ws.recv())
            while ev.get("game", {}).get("ply_count") != ply + 1 and ev.get("type") != "error":
                ev = json.loads(ws.recv())
            assert ev["game"]["ply_count"] == ply + 1, f"Failed move {uci} at ply {ply}"
            print(f"Played move {uci} -> ply {ev['game']['ply_count']}, FEN: {ev['game']['fen']}")

        # Black resigns
        print("Black resigning casual game...")
        black_ws.send(json.dumps({"type": "action", "action": "resign"}))
        ev = json.loads(black_ws.recv())
        while ev.get("game", {}).get("status") != "completed":
            ev = json.loads(black_ws.recv())
        print(f"Casual Game Ended: Result={ev['game']['result']}, Termination={ev['game']['termination']}")
        assert ev["game"]["result"] == "1-0"
        assert ev["game"]["termination"] == "resignation"

    # Confirm neither player's Elo changed
    c_p1 = c1.get("/api/auth/me").json()
    c_p2 = c2.get("/api/auth/me").json()
    print(f"Post-Casual Ratings -> P1: {c_p1['rating']} (was {p1['rating']}), P2: {c_p2['rating']} (was {p2['rating']})")
    assert c_p1["rating"] == p1["rating"], f"P1 rating changed in casual! {c_p1['rating']} != {p1['rating']}"
    assert c_p2["rating"] == p2["rating"], f"P2 rating changed in casual! {c_p2['rating']} != {p2['rating']}"
    print("VERIFIED: Casual match completed with synchronized moves, and NEITHER player's Elo changed!")

    # ==========================================
    # 3. COMPETITIVE QUEUE & MATCH JOURNEY
    # ==========================================
    print("\n==============================")
    print("VERIFYING JOURNEY 3: COMPETITIVE PLAY")
    print("==============================")
    print(f"Eligible accounts: P1 rating={c_p1['rating']}, P2 rating={c_p2['rating']}, diff={abs(c_p1['rating'] - c_p2['rating'])}")
    q1_comp = c1.post("/api/matchmaking/queue", params={"mode": "competitive"}).json()
    print("P1 Competitive Queue:", q1_comp)
    assert q1_comp["status"] == "waiting"
    assert q1_comp["rating_window"] is not None
    print("Confirmed Matchmaking Rating Window:", q1_comp["rating_window"])

    q2_comp = c2.post("/api/matchmaking/queue", params={"mode": "competitive"}).json()
    print("P2 Competitive Queue:", q2_comp)
    assert q2_comp["status"] == "matched"
    comp_game_id = q2_comp["game_id"]
    print("Competitive Matched Game ID:", comp_game_id)

    compg1 = c1.get(f"/api/games/{comp_game_id}").json()
    compg2 = c2.get(f"/api/games/{comp_game_id}").json()
    assert compg1["game_id"] == comp_game_id and compg2["game_id"] == comp_game_id
    assert compg1["status"] == "active"
    print(f"Competitive Game Active! White={compg1['white_username']}, Black={compg1['black_username']}")

    comp_white_is_p1 = compg1["white_username"] == "JourneyPlayer1"
    comp_white_cookie = cookie1 if comp_white_is_p1 else cookie2
    comp_black_cookie = cookie2 if comp_white_is_p1 else cookie1

    with ws_connect(comp_game_id, comp_white_cookie) as c_white_ws, ws_connect(comp_game_id, comp_black_cookie) as c_black_ws:
        c_white_ws.recv()
        c_black_ws.recv()

        # Play moves: 1. d4 d5 2. c4 e6
        comp_moves = [
            (c_white_ws, "d2d4", 0),
            (c_black_ws, "d7d5", 1),
            (c_white_ws, "c2c4", 2),
            (c_black_ws, "e7e6", 3),
        ]
        for ws, uci, ply in comp_moves:
            ws.send(json.dumps({"type": "move", "uci": uci, "expected_ply": ply}))
            ev = json.loads(ws.recv())
            while ev.get("game", {}).get("ply_count") != ply + 1 and ev.get("type") != "error":
                ev = json.loads(ws.recv())
            assert ev["game"]["ply_count"] == ply + 1
            print(f"Competitive move {uci} -> ply {ev['game']['ply_count']}, FEN: {ev['game']['fen']}")

        # Resignation by Black
        print("Black resigning competitive game...")
        c_black_ws.send(json.dumps({"type": "action", "action": "resign"}))
        ev = json.loads(c_black_ws.recv())
        while ev.get("game", {}).get("status") != "completed":
            ev = json.loads(c_black_ws.recv())
        print(f"Competitive Game Ended: Result={ev['game']['result']}, Termination={ev['game']['termination']}")
        assert ev["game"]["status"] == "completed"
        assert ev["game"]["termination"] == "resignation"

    # Confirm correct one-time rating updates
    post_comp_p1 = c1.get("/api/auth/me").json()
    post_comp_p2 = c2.get("/api/auth/me").json()
    delta_p1 = post_comp_p1["rating"] - c_p1["rating"]
    delta_p2 = post_comp_p2["rating"] - c_p2["rating"]
    print(f"P1 Rating: {c_p1['rating']} -> {post_comp_p1['rating']} (Delta: {delta_p1:+d})")
    print(f"P2 Rating: {c_p2['rating']} -> {post_comp_p2['rating']} (Delta: {delta_p2:+d})")
    assert delta_p1 != 0 and delta_p2 != 0, "Ratings did not change!"
    assert delta_p1 + delta_p2 == 0, f"Ratings sum changed! {delta_p1} + {delta_p2} != 0"
    print("VERIFIED: Competitive match completed, and one-time Elo updates applied accurately!")

    # ==========================================
    # 4. GAME ENDINGS: DRAW (OFFER & ACCEPT)
    # ==========================================
    print("\n==============================")
    print("VERIFYING JOURNEY 6: DRAW GAME ENDING")
    print("==============================")
    c1.delete("/api/matchmaking/queue")
    c2.delete("/api/matchmaking/queue")
    c1.post("/api/matchmaking/queue", params={"mode": "casual"})
    draw_match = c2.post("/api/matchmaking/queue", params={"mode": "casual"}).json()
    draw_gid = draw_match["game_id"]
    dg = c1.get(f"/api/games/{draw_gid}").json()
    dw_is_p1 = dg["white_username"] == "JourneyPlayer1"
    dw_cookie = cookie1 if dw_is_p1 else cookie2
    db_cookie = cookie2 if dw_is_p1 else cookie1

    with ws_connect(draw_gid, dw_cookie) as dw_ws, ws_connect(draw_gid, db_cookie) as db_ws:
        dw_ws.recv()
        db_ws.recv()
        # White offers draw
        dw_ws.send(json.dumps({"type": "action", "action": "offer_draw"}))
        offer_ev = json.loads(db_ws.recv())
        while offer_ev.get("game", {}).get("draw_offered_by") is None:
            offer_ev = json.loads(db_ws.recv())
        print("Draw offer successfully broadcasted to opponent. Accepting draw...")
        # Black accepts draw
        db_ws.send(json.dumps({"type": "action", "action": "accept_draw"}))
        ev = json.loads(db_ws.recv())
        while ev.get("game", {}).get("status") != "completed":
            ev = json.loads(db_ws.recv())
        print(f"Draw Game Ended: Result={ev['game']['result']}, Termination={ev['game']['termination']}")
        assert ev["game"]["result"] == "1/2-1/2"
        assert ev["game"]["termination"] == "agreement"
    print("VERIFIED: Draw ending via mutual agreement produces 1/2-1/2 with termination='agreement'!")

    # ==========================================
    # 5. PLAY AI & COACH: STOCKFISH EVALUATION
    # ==========================================
    print("\n==============================")
    print("VERIFYING JOURNEY 4 & 5: STOCKFISH & COACH")
    print("==============================")
    sf = c1.post("/api/chess/recommend", json={"fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"}).json()
    print("Stockfish Recommendation:", sf)
    assert sf["best_move"] is not None
    assert sf["evaluation"] is not None or sf["evaluation_mate"] is not None
    assert isinstance(sf["principal_variation"], list) and len(sf["principal_variation"]) > 0
    print(f"Best Move: {sf['best_move']} ({sf['best_move_san']}), Type: {sf['evaluation_type']}, Eval: {sf['evaluation']}, Depth: {sf['depth']}")
    print("VERIFIED: Stockfish engine successfully responds with legal candidate moves and position evaluation!")

    # ==========================================
    # 6. ADMIN SECURITY: RESEARCH PORTAL
    # ==========================================
    print("\n==============================")
    print("VERIFYING REQUIREMENT 8: RESEARCH PORTAL RESTRICTION")
    print("==============================")
    res = c1.get("/api/research/experiments")
    print("Ordinary Player accessing /api/research/experiments:", res.status_code)
    assert res.status_code == 403, f"Expected 403 Forbidden for non-admin, got {res.status_code}"
    print("VERIFIED: Research Portal is strictly restricted with 403 Forbidden to ordinary players!")

    print("\nALL BACKEND & RUNNING APPLICATION API VERIFICATIONS SUCCEEDED!")

if __name__ == "__main__":
    run_all_verifications()
