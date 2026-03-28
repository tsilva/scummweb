"use client";

export default function LaunchButton({ href, label = "Launch ScummVM", className = "" }) {
  const classes = ["launch-button", className].filter(Boolean).join(" ");

  return (
    <a className={classes} href={href}>
      {label}
    </a>
  );
}
