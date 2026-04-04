export default function LaunchButton({ href, label = "Play", className = "" }) {
  const classes = ["launch-button", className].filter(Boolean).join(" ");

  return (
    <a className={classes} href={href}>
      {label}
    </a>
  );
}
