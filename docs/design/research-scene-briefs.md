# Research scenes: semantic briefs and shared art direction (internal)

Written before the D2 studies, from the papers assigned to each theme in `src/data/publications.yaml`.
The animations are metaphors: none depicts a specific algorithm, and they must not imply one.

## Coalitions & collective decisions

- **Research.** Online coalition formation (agents arrive one by one; their utilities for others are revealed
  on arrival; each must be assigned to a coalition), hedonic games, fairness and egalitarian welfare across
  coalitions, and decentralised online learning of coalition structures by selfish agents who learn
  preferences from repeated interaction and deviate until no one can improve alone (Nash stability).
- **Viewer must perceive.** Individual agents arrive over time, weigh the existing groups, and join one (or
  start a new one); now and then a member moves to a group it prefers, and the structure settles.
- **Must not imply.** A fixed or pre-drawn grouping; a single leader; people or social-network imagery.
- **Literal.** Agents; groups; arrival over time; joining; moving between groups.
- **Metaphorical.** Spatial closeness stands for membership; line brightness for how much an agent values a
  group; a shared halo for a coalition.

## Fair allocation over time

- **Research.** Online fair division of indivisible goods: goods arrive one at a time and must be allocated
  immediately and irrevocably; agents value goods differently; fairness (e.g. proportionality or
  envy-freeness up to a good) is judged on the evolving bundles; variants with budgets, subsidies, recourse,
  random-order arrivals and adversaries.
- **Viewer must perceive.** Items arriving one after another; a pause in which the current state is taken
  into account; the item going to one recipient; bundles growing; no one falling far behind.
- **Must not imply.** That the destination is known in advance (no pre-drawn branches); a specific fairness
  guarantee; money or dashboards.
- **Literal.** Items; recipients; one-at-a-time irrevocable assignment; bundles.
- **Metaphorical.** Heap size or ring size stands for the value of a bundle; response strength for an agent's
  value for the current item; the decision rule shown (value it, and favour whoever is behind) is
  illustrative, not an algorithm from the papers.

## Learning in multi-agent systems

- **Research.** Decentralised online learning by selfish agents (no global coordination or information
  sharing; learning from their own repeated feedback), learning coalition structures, multi-agent
  coordination via recursive reasoning, distributed control and consensus / consensus-prevention in swarms.
- **Viewer must perceive.** Many agents, initially uncertain; local interactions carrying signals; feedback
  after each interaction; agents' states and their links changing as a result; a structure emerging, and
  (variant) re-forming when the environment changes.
- **Must not imply.** A central controller; a global broadcast; a neural-network diagram.
- **Literal.** Agents; local interactions; feedback; changing relationships.
- **Metaphorical.** Colour stands for an agent's current belief about its type; link weight for the learned
  value of an interaction; the moving background field for changing conditions.

## Principled & safe AI

- **Research.** Chiefly *The Attacker in the Mirror* (NeurIPS 2026): self-play red teaming, where attacker and
  defender roles play a zero-sum game (the attacker tries to jailbreak the defender). When both roles share
  and update one model, the dynamics collapse to self-consistency and attacks stop exerting adversarial
  pressure; reachable equilibria include trivial "always refuse" defenders. Anchored Bipolicy Self-Play keeps
  a frozen shared base and trains distinct role-specific adapters, preserving adversarial pressure while
  staying stable. Also in the theme: convexified message-passing GNNs (principled, tractable learning).
- **Viewer must perceive.** Two distinct roles that come from one shared, fixed origin; an attacker sending
  probes and ordinary messages; a defender that answers ordinary messages (it does not refuse everything)
  and stops most attacks; attacks that sometimes get through; both sides adapting round after round, so the
  pressure never collapses.
- **Must not imply.** Robots, brains, shields, padlocks, chat bubbles, glowing "AI" text or circuit boards;
  a literal depiction of adapters or LoRA.
- **Literal.** Two roles; rounds of interaction; probes and messages; blocking and answering; adaptation.
- **Metaphorical.** The fixed glow at the base stands for the frozen shared model; the two branches for
  role-specific policies; the boundary's local strength for the defender's robustness.

## Shared art direction (where consistency lives)

| Element | Rule (shared with the elemental family) |
|---|---|
| Background | The hero stage: near-black `#06070a` with a faint cool atmospheric glow; lots of negative space. |
| Primary marks | Pale, cool, low-contrast (≈ `#d2dcec` at 0.4–0.9 alpha), like Air's streamlines and Water's glints. |
| Accent | One warm family (amber `#ffb070` → pale gold), as in Fire and Convergence: activation, energy, allocation. |
| Group tints | At most three muted tints (mist blue, sand, sage), never saturated. |
| Agents / items | Small discs (2–3 px) with a soft halo (radial, ~4× radius); items are motes or grains (Earth's material). |
| Links / trails | Hairlines (≈ 0.8 px); weight shown by alpha and width; trails fade with an ease-out, like Air. |
| Halos | Additive radial gradients only; no hard outlines, no boxes. |
| Motion | Eased (smoothstep); 400–900 ms moves; nothing snaps; ambient events every 1.5–3 s. |
| Density | About 12–20 agents; the mechanism must read at a glance. |
| Lighting | Low light; brightness carries meaning (value, confidence, activation). |
| Entrance | Fade up over ~1 s, then the mechanism runs; no dramatic intro (they live in context, not the hero). |
| Interaction | None: these explain rather than respond. |
| Typography | None inside the animation; labels live outside it. |
