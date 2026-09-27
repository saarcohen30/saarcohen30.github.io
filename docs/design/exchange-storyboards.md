# Principled & safe AI: storyboards (internal)

Static storyboards for review before any motion is built (see `/design-review/scene-architecture/#storyboards`).

## Key message (defined first)

**One shared model training against itself goes slack; separate roles on a fixed shared base keep the pressure on.**

Source: *The Attacker in the Mirror* (arXiv 2605.08427, NeurIPS 2026). In single-model self-play,
"gradient updates for the attacker shift the defender's decision boundaries, resulting in
self-consistency": the model learns to avoid prompts it already defends against, so attacks stop
exerting adversarial pressure, and equilibria include trivial always-refuse defenders. Anchored
Bipolicy Self-Play freezes the base model and trains separate attacker and defender adapters,
"restoring adversarial pressure".

## Design constraints (from the research)

- One key message, one reading direction (left to right: attacker, then defender), sparse colour
  (Jambor & Bornhäuser, *Ten simple rules for designing graphical abstracts*, PLOS Comput Biol 2024).
- One action at a time, staged, slow-in/slow-out, about one second per stage (Heer & Robertson 2007);
  keep the animation simple enough to be apprehended (Tversky, Morrison & Bétrancourt 2002); never more
  than two or three things moving at once (people track about four: Pylyshyn & Storm 1988).
- Salience goes to the one element that carries the message (Nature Methods *Points of View*).
- The lab framing of red teaming is a loop: generate an attack → the target responds → judge → update
  (Perez et al. 2022; Beutel et al., OpenAI, 2024); attacker collapse is a known failure.

## Shared vocabulary

| Element | Meaning |
|---|---|
| Warm-edged angular form (left) | Attacker; its shape is its current strategy (exploratory). |
| Cool layered arcs (right) | Defender; its shape is its policy (structured, stabilising). |
| One line between them | Adversarial pressure: taut and bright = present; slack and faint = collapsed. |
| Broad quiet base beneath | The frozen shared model (the anchor); never changes. |
| One translucent shared body | Coupling: both roles are the same trainable model. |
| One warm arc / one cool arc | A challenge / a response. |
| Faint dashed outline | The previous shape, so an update is visible in a still. |

No labels in the animation; no walls, projectiles, shields, robots, chat bubbles or red-vs-blue game look.

---

## H · Mirror, separation, rounds (D + G) — recommended

- **Message.** Coupled self-play collapses into a mirror; separating the roles on a fixed base restores a
  real adversarial loop.
- **t = 0.** Two roles joined by one shared body, already near mirror images, pressure line slack.
- **0–2 s.** Coupled phase: a challenge goes out and curls back; both roles drift into the same grey
  mirror shape; the pressure line sags.
- **2–4 s.** Separation: the shared body settles into a quiet base beneath; each role lifts onto its own
  stem, warm and cool again; the pressure line tightens.
- **4–6 s.** One round: challenge → the defender lights and answers → both update differently (ghosts) →
  a stronger challenge. Pressure stays taut.
- **Loop.** Rounds repeat (each slightly different); the coupled prologue replays only on a long cycle
  (e.g. every third loop) so the card mostly shows the healthy loop.
- **Literal.** Two roles, rounds, challenge and response, updates.
- **Metaphorical.** Shared body = one set of trainable weights; base = frozen model; stems = adapters;
  line = adversarial pressure.
- **Research idea.** The paper's contrast (single-model coupling → self-consistency; ABS → pressure).
- **Could be misread as.** Two separate systems that first merge, then split (acceptable); the base as
  a "floor" (acceptable).
- **Why it works at 270 px.** Two large shapes, one line, one arc at a time; the key change (slack →
  taut, grey → warm/cool) is a change in brightness and tension, which survives small sizes.

## D · Mirror → separation

- **Message.** Shared updating makes attacker and defender mirror images; separation restores tension.
- **t = 0.** Coupled roles on one body with a live challenge and a taut line.
- **0–2 s.** Coupled updates: the shapes converge to mirror images and grey; the challenge curls back.
- **2–4 s.** The line slackens fully; a quiet base appears; the roles separate onto it.
- **4–6 s.** Separate updates; a strong challenge; the line taut.
- **Loop.** Restart from the coupled state.
- **Literal.** Two roles; convergence; separation.
- **Metaphorical.** Mirror images = self-consistency; line = pressure.
- **Research idea.** The contrast itself, without the training loop.
- **Could be misread as.** A "merge then split" story without adversarial content.
- **At 270 px.** Clear, but it says less about *self-play* than H.

## F · Shared core, independent adaptations

- **Message.** A fixed common base; the two roles adapt independently.
- **t = 0.** Quiet base with two distinct roles.
- **0–2 s.** An interaction between the roles; the base does not change.
- **2–4 s.** Each role reshapes its own way (ghosts); the base stays identical.
- **4–6 s.** The next interaction between the new shapes.
- **Loop.** Continuous.
- **Literal.** Two roles, interactions, independent updates.
- **Metaphorical.** Base = frozen model; stems = adapters.
- **Research idea.** The ABS architecture.
- **Could be misread as.** A generic "two clients on a server" diagram; without the collapse it does
  not say *why* separation matters.
- **At 270 px.** Readable, but the key message is only half-told.

## G · Adversarial rounds

- **Message.** Challenge → response → learning → stronger challenge.
- **t = 0.** Two roles facing each other.
- **0–2 s.** The attacker sends one probe.
- **2–4 s.** The defender lights and answers; outcome.
- **4–6 s.** Both update (ghosts); a stronger challenge.
- **Loop.** Continuous rounds.
- **Literal.** Rounds of self-play.
- **Metaphorical.** Arc strength = challenge strength.
- **Research idea.** Self-play red teaming in general.
- **Could be misread as.** Generic red teaming; nothing specific to this paper's contribution.
- **At 270 px.** Very clear.

## E · Coupled vs independent trajectories — dropped

Two strategy trajectories that converge (shared) or keep moving apart (bipolicy). Dropped at the
research stage: it is visually too close to the rejected strategy-space study (Exchange C), and a point
moving through an abstract space needs its caption to be understood.
