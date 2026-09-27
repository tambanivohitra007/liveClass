/**
 * Contract between the arcade play shell (ArcadePlay.tsx) and the self-paced mini-games
 * (Tower Defense, Café). The shell owns questions, networking and timing; the mini-game owns
 * its own simulation and rendering.
 */
export interface SelfPacedGameProps {
  /**
   * Shows a question over the game. Resolves once the student has answered and seen the
   * feedback, with the resources earned: Tower Defense coins (40–90) or Café restock units
   * (5–10). Resolves 0 for a wrong answer. Never rejects.
   * While it is pending the game should keep rendering but may pause input.
   */
  earn: () => Promise<number>;
  /** Reports the current game score. Call whenever it changes; the shell throttles network calls. */
  reportScore: (score: number) => void;
  /** Epoch ms when the teacher's timer ends the game, or null for no timer. */
  endsAt: number | null;
  /** True once the game is over: stop the simulation and show the final score. */
  ended: boolean;
  /** Player display info for HUD flavour. */
  nickname: string;
  avatar: string;
}
