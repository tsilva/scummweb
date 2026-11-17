import { LogOut } from "lucide-react";

export default function GameExitButton({ href, onClick, onMouseDown }) {
  const Control = href ? "a" : "button";
  return <Control aria-label="Exit game" className="game-route-control-button is-exit"
    href={href} onClick={onClick} onMouseDown={onMouseDown}
    title="Exit game" type={href ? undefined : "button"}>
    <LogOut aria-hidden="true" size={17} strokeWidth={2} />
  </Control>;
}
