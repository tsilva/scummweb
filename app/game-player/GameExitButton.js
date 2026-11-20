import { LogOut } from "lucide-react";

export const GAME_EXIT_LABEL = "Exit game";

export default function GameExitButton({ href, onClick, onMouseDown }) {
  const Control = href ? "a" : "button";
  return <Control aria-label={GAME_EXIT_LABEL} className="game-route-control-button is-exit"
    href={href} onClick={onClick} onMouseDown={onMouseDown}
    title={GAME_EXIT_LABEL} type={href ? undefined : "button"}>
    <LogOut aria-hidden="true" size={17} strokeWidth={2} />
  </Control>;
}
