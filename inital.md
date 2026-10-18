# PlayerDNA — Product Workflow, Visual Redesign and Implementation

You have already audited the existing PlayerDNA Chess Intelligence repository. Now use the audit findings to plan and implement the approved product workflow and UI redesign.

The goal is to turn the existing project into a cohesive, premium chess platform while preserving working backend functionality, database integrity, and existing useful features.

## 1. First define the implementation plan

Before editing files, present a short implementation plan based on the audit.

Identify:
- Existing components and APIs that can be reused.
- Pages that need redesign.
- Pages that need to be added.
- Missing backend functionality that prevents a workflow from working.
- Database changes, if any, that are genuinely necessary.
- Dependencies between tasks.

Do not rewrite the backend simply to support a frontend redesign.

Implement in small, reviewable stages. If the audit reveals a major architectural or security issue, explain it before undertaking a risky change.

## 2. Product information architecture

Organize the product into two distinct experiences.

### Public experience
- Landing page.
- Product features.
- How it works.
- Registration.
- Login.

### Signed-in player experience
- Dashboard.
- Play.
- Unrated.
- Competitive.
- AI Play.
- Coach.
- Friend.
- Game history.
- Game reports.
- User profile and settings.

### Administrator/research experience
- Research dashboard.
- Historical Player DNA.
- Historical cohort and datasets.
- Model training and evaluation.
- AI-vs-AI arena.
- Research reports.
- System health and administration.

The admin portal must be protected by backend authorization. Do not treat a hidden frontend link as security.

Historical cohort data must remain distinct from registered accounts and the competitive leaderboard.

## 3. Landing page

Create a polished public landing page that clearly communicates what PlayerDNA offers.

Suggested content:
- A strong hero headline describing chess intelligence and personalized improvement.
- A short explanation of PlayerDNA.
- Primary actions: Create Account and Log In.
- Product preview with a chessboard or gameplay visual.
- Feature sections for competitive chess, AI opponents, coach analysis, Player DNA, and performance reports.
- A short explanation of how users improve over time.
- A footer with relevant product navigation.

Avoid unsupported claims about AI capabilities or model performance.

The landing page should feel like a real product, not an admin dashboard or a generic SaaS template.

## 4. Registration and login flow

Inspect the existing implementation and reuse it where safe.

The intended flow is:

Public landing page → Register or Log In → Authenticated player dashboard.

Requirements:
- Validate inputs.
- Provide useful validation and server-error messages.
- Handle session expiration and logout.
- Protect private user data.
- Ensure authentication state persists appropriately.
- Avoid exposing credentials or session secrets.
- Add password recovery only if it can be implemented safely and supported by the chosen infrastructure; otherwise document it as future work.

Do not invent a working authentication flow if the backend does not support it.

## 5. Player dashboard

Redesign the existing Overview into a personal player dashboard.

At the top, show a competitive leaderboard preview with the top three eligible registered players ranked by rating.

Also show:
- Current user's rating and whether it is provisional.
- Wins and losses.
- Recent games.
- Game history.
- A clear Play button.
- Shortcuts to AI Play, Coach, and analysis.
- Useful progress indicators based on real data.

Requirements:
- Fetch real data from the backend.
- Show appropriate loading, empty, and error states.
- Never substitute historical cohort ratings for registered-user ratings.
- Never fabricate wins, losses, leaderboard entries, or game history.
- Clearly explain the empty state when no registered users have completed rated games.

## 6. Play experience

Provide a clear entry point to five modes.

### A. Unrated
A casual game mode that does not change competitive rating.

### B. Competitive
A rated game mode using the matchmaking system. It should eventually support:
- Queue joining and cancellation.
- Opponent pairing.
- Fair rating-based matchmaking.
- Match-found notifications.
- Game start and completion.
- Rating updates after eligible completed games.

### C. AI Play
Play against Stockfish-based opponents with distinct strength settings. Clearly label the strength or difficulty.

Do not imply that three Stockfish settings are three independent trained models.

### D. Coach
A chess experience that combines legal gameplay with contextual move feedback, engine analysis, and explanations supported by actual engine output.

### E. Friend
A way to invite another user and play a private game. Use real invite links or supported room identifiers, with proper access control.

For every mode, inspect the backend before deciding what is possible. If the full backend feature is missing, create a clear and honest interface for the existing functionality, document the missing implementation, and do not fake a successful game.

## 7. Chessboard and gameplay interface

Use the existing chess library and Stockfish integration where possible.

The game interface should include:
- A clear chessboard.
- Player identities and ratings where available.
- Clocks and time controls.
- Move history.
- Game status.
- Resign and draw actions where appropriate.
- Responsive layout.
- Analysis or coach panel when relevant.

Use the existing project's board component if suitable. Do not replace a working board library unnecessarily.

Legal moves and game completion must be determined by the game engine/backend, not merely by frontend UI state.

If multiplayer is not fully implemented, identify the missing WebSocket or game-room functionality rather than simulating another player.

## 8. Game history and post-game reports

Design the user experience around a complete game lifecycle:

Start game → Play → Finish → Persist result → Analyze → Display report → Update eligible rating → Show in history.

Use real persisted game data.

Reports should use supported Stockfish evaluations and existing performance metrics. Clearly distinguish engine measurements from any derived score.

Do not invent move evaluations, accuracy values, star ratings, or historical results.

## 9. PlayerDNA research and admin portal

Move historical dataset exploration out of the primary player navigation and into a separate admin/research portal.

The research interface should support, where backed by existing code:
- Historical player selection.
- Player profiles and DNA measurements.
- Similarity comparisons.
- Dataset statistics.
- Model metadata and evaluation.
- Training and experiment status.
- Historical DNA snapshots.
- Research results.

Preserve the existing Player DNA page and its working metrics; relocate or adapt it rather than discarding it.

Fix the known player-selection persistence issue when implementing navigation:
- Selecting `robixy` gives `/player-dna?player=robixy`.
- Navigating to another page and returning currently changes the selected player to `aaaaaaaddd`.
- Preserve the intended selection in URL state and navigation where appropriate.
- Verify that direct links and browser refresh also select the correct player.

## 10. AI-vs-AI arena

Add an administrator-only AI-vs-AI evaluation interface, subject to the audit's findings.

Planned capabilities:
- Select two Stockfish configurations.
- Choose from three configured strength levels.
- Configure time controls and number of games.
- Run games and persist experiment metadata and results.
- Replay games.
- Pause, resume, and fast-forward playback.
- Display move evaluations and outcomes.
- Summarize wins, draws, and losses.
- Compare results across controlled batches.

Use the existing Stockfish integration if suitable. Keep engine processes under controlled resource limits.

Make clear that strength settings are engine configurations, not independently trained models. Any claims about AI model effectiveness must be based on repeatable experiments and actual evidence.

Do not expose expensive or unrestricted engine execution to normal users.

## 11. Visual design system

Use a coherent premium chess-platform design.

### Colors
- Primary background: near-black or deep charcoal.
- Surface: slightly lighter charcoal.
- Text: off-white.
- Main accent: electric lime green.
- Secondary accents: restrained teal or orange where useful.
- Purple must not be the dominant color.

### Design principles
- Strong typography and visual hierarchy.
- Consistent spacing and component sizing.
- Clear buttons and meaningful hover, focus, and disabled states.
- Large, readable chessboard when gameplay is the focus.
- Clean forms and navigation.
- Responsive desktop and mobile layouts.
- Consistent loading, empty, error, success, and confirmation states.
- Accessible contrast and keyboard focus.
- Subtle animations only where they improve feedback.

Avoid excessive gradients, excessive glow effects, decorative metrics without purpose, and repetitive generic cards.

Use the provided chess-platform screenshots as visual inspiration, but build an original PlayerDNA identity.

Reuse the project's current styling and component conventions where possible. Avoid introducing a new design framework unless the existing setup makes it necessary.

## 12. Technical and security constraints

- Preserve the existing Python/FastAPI backend unless the audit demonstrates a necessary change.
- Preserve PostgreSQL data and the current Alembic migration history.
- Never drop or reset the database.
- Never import the historical cohort using destructive replacement during UI work.
- Do not overwrite `.env`.
- Never expose secrets in source code, logs, screenshots, or reports.
- Validate and authorize sensitive API requests on the backend.
- Validate WebSocket connections and game-room membership if multiplayer is implemented.
- Keep historical players, registered users, and AI engine identities distinct.
- Do not change dependencies unnecessarily.
- Do not fabricate API responses or hardcode fake production data.
- Do not claim an end-to-end feature works without testing it.

## 13. Implementation and verification

Implement in stages, beginning with the shared layout, routing, landing page, and authenticated dashboard structure.

After each stage:
1. Run the frontend build.
2. Run relevant existing tests.
3. Check for broken routes and TypeScript errors.
4. Verify that existing API integrations remain intact.
5. Test loading, empty, and error states.
6. Document anything blocked by missing backend functionality.

Then continue to the next approved stage.

Do not try to implement the entire platform in one giant unreviewed rewrite.

## 14. Final deliverables

Provide:
- Summary of the changes made.
- Updated route and navigation map.
- Files created and modified.
- Features completed.
- Features still blocked by backend work.
- Build and test results.
- Database or migration changes, if any.
- Manual steps required to test the result.
- Recommended next implementation stage.

The objective is a coherent, professional PlayerDNA platform that preserves working functionality and clearly separates normal chess players from administrators and historical research.